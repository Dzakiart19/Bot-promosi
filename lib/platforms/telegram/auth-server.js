/**
 * lib/platforms/telegram/auth-server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Web server + Auth flow untuk Telegram bot.
 *
 * Dua mode operasi:
 *   1. AUTH MODE  — status auth_required/session_expired
 *                   Monitor menampilkan UI OTP → user input kode → bot resume otomatis
 *   2. RUNNING MODE — bot sudah konek, stats ditampilkan di monitor
 *
 * API:
 *   startAuthServer(reason)  → Promise<string>  — start server, resolve saat auth selesai
 *   requireReauth(reason)    → Promise<string>  — reset auth state (server tetap jalan)
 *   setBotRunning(bool)      — set mode running/auth_required untuk stats endpoint
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const path               = require("path");
const fs                 = require("fs");
const express            = require("express");
const { writeSession }   = require("./persistence");
const { TelegramClient } = require("telegram");
const { StringSession }  = require("telegram/sessions");
const { Api }            = require("telegram/tl");
const { log }            = require("../../core/logger");
const { stats: botStats } = require("../../core/stats");
const REGISTRY           = require("../../core/platforms-registry");

const API_ID   = parseInt(process.env.TELEGRAM_API_ID  || "0", 10);
const API_HASH = process.env.TELEGRAM_API_HASH || "";
const PHONE    = process.env.TELEGRAM_PHONE    || "";
const PORT     = process.env.PORT ? parseInt(process.env.PORT) : 4000;

// File tempat session string disimpan — dibaca saat bot restart
const SESSION_FILE = path.join(__dirname, "../../../.telegram_session");

// ── Module-level state ────────────────────────────────────────────────────────
let authClient      = null;
let phoneCodeHash   = null;
let step            = "idle";  // idle | otp_sent | need_2fa | done | running | error
let lastError       = "";
let sessionResult   = "";
let httpServer      = null;
let resolveAuth     = null;   // resolver aktif — di-call saat auth selesai
let botRunning      = false;  // true = bot konek & loop berjalan
let logoutRequested = false;  // sinyal ke runBot() agar berhenti di iterasi berikutnya
const AUTH_START    = Date.now();
const PROXY_TIMEOUT_MS = 2500;

/** Dipanggil oleh telegram-bot.js tiap iterasi loop — true sekali lalu reset. */
function consumeLogoutRequest() {
  if (!logoutRequested) return false;
  logoutRequested = false;
  return true;
}

// ── Helpers file ──────────────────────────────────────────────────────────────
function writeSavedSession(s) {
  try { fs.writeFileSync(SESSION_FILE, s, "utf8"); } catch (e) {
    log("WARN", "[AUTH] Gagal tulis session ke file: " + e.message);
  }
}

// ── Set mode running (dipanggil dari bot/telegram-bot.js) ─────────────────────
function setBotRunning(running) {
  botRunning = running;
  step       = running ? "running" : "idle";
}

// ── Inisialisasi GramJS client kosong untuk auth ──────────────────────────────
async function initClient() {
  if (authClient) { try { await authClient.disconnect(); } catch (_) {} }
  const { Logger } = require("telegram/extensions/Logger");
  const noopLogger = new Logger();
  noopLogger.levels    = [];
  noopLogger._logLevel = null;
  noopLogger.canSend   = () => false;
  noopLogger._log      = () => {};
  authClient = new TelegramClient(
    new StringSession(""),
    API_ID, API_HASH,
    { connectionRetries: 5, retryDelay: 2000, baseLogger: noopLogger }
  );
  await authClient.connect();
  log("INFO", "[AUTH] Client GramJS terhubung");
}

// ── Reset state untuk auth ulang (tanpa restart server) ───────────────────────
function _resetState(reason) {
  log("WARN",  "[AUTH] " + reason);
  log("INFO",  "[AUTH] Buka monitor → tab Telegram → Kirim OTP untuk login ulang");
  step          = "idle";
  lastError     = "";
  sessionResult = "";
  phoneCodeHash = null;
  botRunning    = false;
  initClient().catch((err) => {
    step      = "error";
    lastError = "Gagal connect ke Telegram: " + err.message;
    log("ERROR", "[AUTH] " + lastError);
  });
}

// ── Callback saat autentikasi berhasil ────────────────────────────────────────
function _onAuthDone(session) {
  writeSavedSession(session);
  log("SUCCESS", "[AUTH] Session disimpan ke file .telegram_session");
  if (resolveAuth) {
    const resolve = resolveAuth;
    resolveAuth   = null;
    resolve(session);
  }
}

// ── fetchLocal helper untuk proxy stats ───────────────────────────────────────
async function fetchLocal(port, urlPath) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROXY_TIMEOUT_MS);
  try {
    const res = await fetch(`http://localhost:${port}${urlPath}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Buat dan start Express server (hanya sekali) ──────────────────────────────
function _createServer() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, "../../../public")));

  // Root → dashboard monitor
  app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "../../../public/monitor.html"));
  });

  // ── Stats endpoint — dinamis: real stats saat bot running, auth_required saat idle ──
  app.get("/api/stats", (_req, res) => {
    if (botRunning && botStats.platform) {
      return res.json({
        ...botStats,
        uptimeSeconds: Math.floor((Date.now() - botStats.startTime) / 1000),
      });
    }
    res.json({
      platform      : "Telegram Bot",
      status        : "auth_required",
      phone         : PHONE,
      startTime     : AUTH_START,
      uptimeSeconds : Math.floor((Date.now() - AUTH_START) / 1000),
      totalSessions : 0,
      totalMatches  : 0,
      totalMsgSent  : 0,
      totalReplies  : 0,
      totalErrors   : 0,
    });
  });

  app.get("/health", (_req, res) => {
    res.json({
      status   : botRunning ? (botStats.status || "running") : "auth_required",
      authStep : step,
    });
  });

  // ── Agregator stats semua platform ───────────────────────────────────────────
  app.get("/api/stats/all", async (_req, res) => {
    const results = await Promise.all(
      REGISTRY.map(async (entry) => {
        try {
          const data = await fetchLocal(entry.port, "/api/stats");
          return { key: entry.key, name: entry.name, port: entry.port, online: true, stats: data };
        } catch (err) {
          return { key: entry.key, name: entry.name, port: entry.port, online: false, error: err.message };
        }
      })
    );
    res.json({ platforms: results });
  });

  // Proxy health per platform
  app.get("/proxy/:key/health", async (req, res) => {
    const entry = REGISTRY.find((p) => p.key === req.params.key);
    if (!entry) return res.status(404).json({ status: "unknown_platform" });
    try {
      const data = await fetchLocal(entry.port, "/health");
      res.json(data);
    } catch (err) {
      res.status(502).json({ status: "offline", error: err.message });
    }
  });

  // ── Kirim OTP ke nomor TELEGRAM_PHONE ────────────────────────────────────────
  app.post("/api/send-otp", async (req, res) => {
    try {
      if (!authClient?.connected) await initClient();
      const result = await authClient.invoke(
        new Api.auth.SendCode({
          phoneNumber : PHONE,
          apiId       : API_ID,
          apiHash     : API_HASH,
          settings    : new Api.CodeSettings({}),
        })
      );
      phoneCodeHash = result.phoneCodeHash;
      step          = "otp_sent";
      lastError     = "";
      log("SUCCESS", "[AUTH] OTP dikirim ke " + PHONE);
      res.json({ ok: true, nextStep: "otp_sent" });
    } catch (err) {
      step      = "error";
      lastError = err.message;
      log("ERROR", "[AUTH] Gagal kirim OTP: " + err.message);
      res.json({ ok: false, error: err.message });
    }
  });

  // ── Verifikasi kode OTP ───────────────────────────────────────────────────────
  app.post("/api/verify", async (req, res) => {
    const { code } = req.body;
    try {
      await authClient.invoke(
        new Api.auth.SignIn({
          phoneNumber   : PHONE,
          phoneCodeHash : phoneCodeHash,
          phoneCode     : String(code).trim(),
        })
      );
      // Berhasil tanpa 2FA
      sessionResult = authClient.session.save();
      step          = "done";
      log("SUCCESS", "[AUTH] ✓ Login berhasil — bot akan resume otomatis");
      res.json({ ok: true, nextStep: "done" });
      // Resolve setelah response terkirim agar client dapat respons duluan
      setImmediate(() => _onAuthDone(sessionResult));
    } catch (err) {
      if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
        step = "need_2fa";
        log("INFO", "[AUTH] 2FA diperlukan");
        res.json({ ok: true, nextStep: "need_2fa" });
      } else {
        step      = "error";
        lastError = err.message;
        log("ERROR", "[AUTH] Gagal verifikasi OTP: " + err.message);
        res.json({ ok: false, error: err.message });
      }
    }
  });

  // ── Verifikasi 2FA ────────────────────────────────────────────────────────────
  app.post("/api/verify-2fa", async (req, res) => {
    const { password } = req.body;
    try {
      const pwdInfo   = await authClient.invoke(new Api.account.GetPassword());
      const { computeCheck } = require("telegram/Password");
      const srpAnswer = await computeCheck(pwdInfo, password);
      await authClient.invoke(new Api.auth.CheckPassword({ password: srpAnswer }));
      sessionResult = authClient.session.save();
      step          = "done";
      log("SUCCESS", "[AUTH] ✓ Login 2FA berhasil — bot akan resume otomatis");
      res.json({ ok: true, nextStep: "done" });
      setImmediate(() => _onAuthDone(sessionResult));
    } catch (err) {
      step      = "error";
      lastError = err.message;
      log("ERROR", "[AUTH] Gagal verifikasi 2FA: " + err.message);
      res.json({ ok: false, error: err.message });
    }
  });

  // ── Logout: dedicated route — HARUS di atas proxy /:action supaya tidak loop ──
  app.post("/api/telegram-auth/logout", (req, res) => _doLogout(res));
  app.post("/api/logout",               (req, res) => _doLogout(res));

  // ── Proxy /api/telegram-auth/:action (untuk send-otp, verify, verify-2fa) ────
  // Logout sudah ditangani di atas; route ini hanya untuk action lainnya.
  app.post("/api/telegram-auth/:action", async (req, res) => {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const upstream = await fetch(`http://localhost:${PORT}/api/${req.params.action}`, {
        method  : "POST",
        headers : { "Content-Type": "application/json" },
        body    : JSON.stringify(req.body || {}),
        signal  : ctrl.signal,
      });
      res.json(await upstream.json());
    } catch (err) {
      res.status(502).json({ ok: false, error: err.message });
    } finally {
      clearTimeout(timer);
    }
  });

  httpServer = app.listen(PORT, "0.0.0.0", () => {
    log("SUCCESS", `Web server → http://0.0.0.0:${PORT}`);
    log("SUCCESS", `Health     → http://0.0.0.0:${PORT}/health`);
    log("SUCCESS", `Stats      → http://0.0.0.0:${PORT}/api/stats`);
  });
}

// ── Logic logout — shared oleh /api/logout dan /api/telegram-auth/logout ─────
async function _doLogout(res) {
  const { clearSession, readSession } = require("./persistence");
  try {
    // Baca session dulu (untuk RPC background), lalu langsung bersihkan & respond
    const sessionStr = await readSession();
    await clearSession();
    logoutRequested = true;   // sinyal ke runBot() untuk berhenti di iterasi berikutnya
    _resetState("Logout manual — sesi dihapus dari DB & file");
    log("SUCCESS", "[AUTH] Session dihapus — bot menunggu login ulang");

    // Respond segera — jangan tunggu RPC Telegram (bisa >10s, bikin timeout di proxy)
    res.json({ ok: true });

    // Cabut sesi dari sisi Telegram di background (best-effort, tidak blocking)
    if (sessionStr) {
      setImmediate(async () => {
        try {
          const { Logger } = require("telegram/extensions/Logger");
          const noopLogger = new Logger();
          noopLogger.levels = []; noopLogger._logLevel = null;
          noopLogger.canSend = () => false; noopLogger._log = () => {};
          const logoutClient = new TelegramClient(
            new StringSession(sessionStr),
            API_ID, API_HASH,
            { connectionRetries: 1, retryDelay: 1000, baseLogger: noopLogger }
          );
          await logoutClient.connect();
          await logoutClient.invoke(new Api.auth.LogOut());
          log("SUCCESS", "[AUTH] Sesi dicabut dari Telegram ✓ (background)");
        } catch (e) {
          log("WARN", "[AUTH] LogOut RPC gagal (diabaikan): " + e.message);
        }
      });
    }
  } catch (err) {
    log("ERROR", "[AUTH] Logout error: " + err.message);
    if (!res.headersSent) res.status(500).json({ ok: false, error: err.message });
  }
}

// ── startAuthServer: start server + kembalikan Promise yang resolve saat auth selesai ──
function startAuthServer(reason = "Session belum dikonfigurasi") {
  const promise = new Promise((resolve) => { resolveAuth = resolve; });

  if (!httpServer) {
    // Pertama kali: buat server
    log("WARN", "[AUTH] " + reason);
    log("INFO", "[AUTH] Buka monitor → tab Telegram → Kirim OTP untuk login");
    _createServer();
    // Init client hanya jika butuh auth (bukan mode "server saja")
    if (reason !== "_server_only") {
      initClient().catch((err) => {
        step      = "error";
        lastError = "Gagal connect ke Telegram: " + err.message;
        log("ERROR", "[AUTH] " + lastError);
      });
    }
  }
  // Jika server sudah jalan: Promise baru akan resolve saat auth berikutnya selesai
  return promise;
}

// ── requireReauth: panggil saat session expired — reset state, kembalikan Promise ──
function requireReauth(reason = "Session kedaluarsa — login ulang diperlukan") {
  const promise = new Promise((resolve) => { resolveAuth = resolve; });
  _resetState(reason);
  return promise;
}

module.exports = { startAuthServer, requireReauth, setBotRunning, consumeLogoutRequest };
