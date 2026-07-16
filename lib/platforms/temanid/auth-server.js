/**
 * lib/platforms/temanid/auth-server.js
 * Web server + Auth flow untuk bot Telegram ke-2 (@temanidbot).
 * Identik dengan lib/platforms/telegram/auth-server.js
 * tapi port = PORT env (3006), platform label "TemanID Bot".
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
const PORT     = process.env.PORT ? parseInt(process.env.PORT) : 3006;

const SESSION_FILE = path.join(__dirname, "../../../.temanid_session");
const PROXY_TIMEOUT_MS = 2500;

let authClient    = null;
let phoneCodeHash = null;
let step          = "idle";
let lastError     = "";
let sessionResult = "";
let httpServer    = null;
let resolveAuth   = null;
let botRunning    = false;
const AUTH_START  = Date.now();

function writeSavedSession(s) {
  try { fs.writeFileSync(SESSION_FILE, s, "utf8"); } catch (e) {
    log("WARN", "[AUTH2] Gagal tulis session ke file: " + e.message);
  }
}

function setBotRunning(running) {
  botRunning = running;
  step       = running ? "running" : "idle";
}

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
  log("INFO", "[AUTH2] Client GramJS terhubung");
}

function _resetState(reason) {
  log("WARN",  "[AUTH2] " + reason);
  log("INFO",  "[AUTH2] Buka monitor → tab TemanID Bot → Kirim OTP untuk login ulang");
  step          = "idle";
  lastError     = "";
  sessionResult = "";
  phoneCodeHash = null;
  botRunning    = false;
  initClient().catch((err) => {
    step      = "error";
    lastError = "Gagal connect ke Telegram: " + err.message;
    log("ERROR", "[AUTH2] " + lastError);
  });
}

async function _onAuthDone(session) {
  writeSavedSession(session);
  await writeSession(session);
  log("SUCCESS", "[AUTH2] Session disimpan ke file .temanid_session");
  if (resolveAuth) {
    const resolve = resolveAuth;
    resolveAuth   = null;
    resolve(session);
  }
}

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

function _createServer() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, "../../../public")));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "../../../public/monitor.html"));
  });

  app.get("/api/stats", (_req, res) => {
    if (botRunning && botStats.platform) {
      return res.json({
        ...botStats,
        uptimeSeconds: Math.floor((Date.now() - botStats.startTime) / 1000),
      });
    }
    res.json({
      platform      : "TemanID Bot",
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
      log("SUCCESS", "[AUTH2] OTP dikirim ke " + PHONE);
      res.json({ ok: true, nextStep: "otp_sent" });
    } catch (err) {
      step      = "error";
      lastError = err.message;
      log("ERROR", "[AUTH2] Gagal kirim OTP: " + err.message);
      res.json({ ok: false, error: err.message });
    }
  });

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
      sessionResult = authClient.session.save();
      step          = "done";
      log("SUCCESS", "[AUTH2] ✓ Login berhasil — bot akan resume otomatis");
      res.json({ ok: true, nextStep: "done" });
      setImmediate(() => _onAuthDone(sessionResult));
    } catch (err) {
      if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
        step = "need_2fa";
        log("INFO", "[AUTH2] 2FA diperlukan");
        res.json({ ok: true, nextStep: "need_2fa" });
      } else {
        step      = "error";
        lastError = err.message;
        log("ERROR", "[AUTH2] Gagal verifikasi OTP: " + err.message);
        res.json({ ok: false, error: err.message });
      }
    }
  });

  app.post("/api/verify-2fa", async (req, res) => {
    const { password } = req.body;
    try {
      const pwdInfo   = await authClient.invoke(new Api.account.GetPassword());
      const { computeCheck } = require("telegram/Password");
      const srpAnswer = await computeCheck(pwdInfo, password);
      await authClient.invoke(new Api.auth.CheckPassword({ password: srpAnswer }));
      sessionResult = authClient.session.save();
      step          = "done";
      log("SUCCESS", "[AUTH2] ✓ Login 2FA berhasil — bot akan resume otomatis");
      res.json({ ok: true, nextStep: "done" });
      setImmediate(() => _onAuthDone(sessionResult));
    } catch (err) {
      step      = "error";
      lastError = err.message;
      log("ERROR", "[AUTH2] Gagal verifikasi 2FA: " + err.message);
      res.json({ ok: false, error: err.message });
    }
  });

  // Proxy endpoint agar dashboard di port lain bisa trigger OTP
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

function startAuthServer(reason = "Session belum dikonfigurasi") {
  const promise = new Promise((resolve) => { resolveAuth = resolve; });
  if (!httpServer) {
    log("WARN", "[AUTH2] " + reason);
    log("INFO", "[AUTH2] Buka monitor → tab TemanID Bot → Kirim OTP untuk login");
    _createServer();
    if (reason !== "_server_only") {
      initClient().catch((err) => {
        step      = "error";
        lastError = "Gagal connect ke Telegram: " + err.message;
        log("ERROR", "[AUTH2] " + lastError);
      });
    }
  }
  return promise;
}

function requireReauth(reason = "Session kedaluarsa — login ulang diperlukan") {
  const promise = new Promise((resolve) => { resolveAuth = resolve; });
  _resetState(reason);
  return promise;
}

module.exports = { startAuthServer, requireReauth, setBotRunning };
