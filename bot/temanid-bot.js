/**
 * bot/temanid-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Telegram Auto-Promo Bot ke-2 — @temanidbot
 *
 * Pakai SESSION YANG SAMA dengan bot/telegram-bot.js (satu akun, satu login).
 * Tidak ada auth flow sendiri — session dibaca dari Replit DB / .telegram_session
 * yang ditulis oleh Telegram Bot saat pertama kali OTP.
 *
 * Kalau session belum ada (Telegram Bot belum auth), bot ini poll setiap 3 detik
 * sampai session tersedia. Tidak perlu restart manual.
 *
 * Jalankan:
 *   PORT=3006 node bot/temanid-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { TelegramClient }         = require("telegram");
const { StringSession }          = require("telegram/sessions");
const { log, sleep, C }          = require("../lib/core/logger");
const { stats, pushEvent }       = require("../lib/core/stats");
const { config, runSession, createMessageListener } = require("../lib/platforms/temanid");
// Shared session — sama dengan Telegram Bot, satu akun satu login
const { readSession }            = require("../lib/platforms/temanid/persistence");

// Stats-only web server (tidak ada OTP endpoint)
const express  = require("express");
const path     = require("path");
const REGISTRY = require("../lib/core/platforms-registry");
const PORT     = process.env.PORT ? parseInt(process.env.PORT) : 3006;
const PROXY_TIMEOUT_MS = 2500;

const SESSION_EXPIRED_ERRORS = [
  "AUTH_KEY_UNREGISTERED",
  "AUTH_KEY_INVALID",
  "SESSION_REVOKED",
  "SESSION_EXPIRED",
  "USER_DEACTIVATED",
  "USER_DEACTIVATED_BAN",
];

const API_ID   = parseInt(process.env.TELEGRAM_API_ID  || "0", 10);
const API_HASH = process.env.TELEGRAM_API_HASH || "";

if (!API_ID || !API_HASH) {
  console.error("ERROR: TELEGRAM_API_ID dan TELEGRAM_API_HASH wajib diset di Secrets.");
  process.exit(1);
}

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`${C.bold}${C.magenta}`);
console.log("  ████████╗███████╗███╗   ███╗ █████╗ ███╗   ██╗██╗██████╗ ");
console.log("     ██║   ██╔════╝████╗ ████║██╔══██╗████╗  ██║██║██╔══██╗");
console.log("     ██║   █████╗  ██╔████╔██║███████║██╔██╗ ██║██║██║  ██║");
console.log("     ██║   ██╔══╝  ██║╚██╔╝██║██╔══██║██║╚██╗██║██║██║  ██║");
console.log("     ██║   ███████╗██║ ╚═╝ ██║██║  ██║██║ ╚████║██║██████╔╝");
console.log("     ╚═╝   ╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝╚═════╝ ");
console.log(`${C.reset}${C.magenta}  Platform : @${config.TARGET_BOT}${C.reset}\n`);

// ── Stats-only Express server ─────────────────────────────────────────────────
function startStatsServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "../public")));

  app.get("/", (_req, res) =>
    res.sendFile(path.join(__dirname, "../public/monitor.html"))
  );

  app.get("/api/stats", (_req, res) => {
    const s = stats;
    if (s.platform) {
      return res.json({ ...s, uptimeSeconds: Math.floor((Date.now() - s.startTime) / 1000) });
    }
    res.json({
      platform      : "TemanID Bot",
      status        : "waiting_session",
      startTime     : Date.now(),
      uptimeSeconds : 0,
      totalSessions : 0,
      totalMatches  : 0,
      totalMsgSent  : 0,
      totalErrors   : 0,
    });
  });

  app.get("/health", (_req, res) =>
    res.json({ status: stats.status || "waiting_session" })
  );

  async function fetchLocal(port, urlPath) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROXY_TIMEOUT_MS);
    try {
      const res = await fetch(`http://localhost:${port}${urlPath}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(timer); }
  }

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

  app.listen(PORT, "0.0.0.0", () => {
    log("SUCCESS", `Web server → http://0.0.0.0:${PORT}`);
    log("SUCCESS", `Stats      → http://0.0.0.0:${PORT}/api/stats`);
  });
}

// ── makeClient ────────────────────────────────────────────────────────────────
function makeClient(sessionStr) {
  return new TelegramClient(
    new StringSession(sessionStr),
    API_ID, API_HASH,
    {
      connectionRetries : config.CONNECTION_RETRIES,
      retryDelay        : 2000,
      autoReconnect     : true,
      baseLogger        : (() => {
        const { Logger } = require("telegram/extensions/Logger");
        const l = new Logger();
        l.levels = []; l._logLevel = null; l.canSend = () => false; l._log = () => {};
        return l;
      })(),
    }
  );
}

// ── runBot ────────────────────────────────────────────────────────────────────
async function runBot(sessionStr) {
  stats.platform = "TemanID Bot";
  stats.status   = "connecting";

  const client = makeClient(sessionStr);

  log("INFO", "Menghubungkan ke Telegram...");
  try { await client.connect(); } catch (err) {
    const code = err.errorMessage || err.message || "";
    if (SESSION_EXPIRED_ERRORS.some(e => code.includes(e))) err.isSessionExpired = true;
    throw err;
  }

  try { await client.getMe(); } catch (err) {
    await client.disconnect();
    const code = err.errorMessage || err.message || "";
    if (SESSION_EXPIRED_ERRORS.some(e => code.includes(e))) err.isSessionExpired = true;
    throw err;
  }

  log("SUCCESS", "Terhubung ke Telegram ✓");

  let botEntity;
  try {
    botEntity = await client.getEntity(config.TARGET_BOT);
    log("SUCCESS", `Bot target: @${config.TARGET_BOT} (id=${botEntity.id})`);
  } catch (err) {
    await client.disconnect();
    const code = err.errorMessage || err.message || "";
    if (SESSION_EXPIRED_ERRORS.some(e => code.includes(e))) err.isSessionExpired = true;
    throw err;
  }

  const { nextMsg } = createMessageListener(client, botEntity);

  stats.status    = "searching";
  stats.startTime = Date.now();

  log("BOT", `Kirim ${config.CMD_SEARCH} untuk memulai...`);
  await client.sendMessage(botEntity, { message: config.CMD_SEARCH });
  pushEvent("search", "Bot dimulai — menunggu pasangan pertama...");

  try {
    while (true) {
      stats.totalSessions++;
      stats.currentSession = stats.totalSessions;

      log("INFO", "━".repeat(52));
      log("INFO", `  SESI #${stats.totalSessions}  |  Match: ${stats.totalMatches}  Kirim: ${stats.totalMsgSent}  Error: ${stats.totalErrors}`);
      log("INFO", "━".repeat(52));

      try {
        const reason = await runSession(client, botEntity, nextMsg);
        log("INFO", `Sesi #${stats.totalSessions} selesai → "${reason}"`);

        if (reason === "match-timeout") {
          log("BOT", `Timeout — kirim ${config.CMD_SEARCH}...`);
          await client.sendMessage(botEntity, { message: config.CMD_SEARCH });
          pushEvent("search", "Re-search setelah timeout");
        }
      } catch (err) {
        const code = err.errorMessage || err.message || "";
        if (SESSION_EXPIRED_ERRORS.some(e => code.includes(e))) {
          try { await client.disconnect(); } catch (_) {}
          const e = new Error("Session expired: " + code);
          e.isSessionExpired = true;
          throw e;
        }

        log("ERROR", `Sesi error: ${err.message}`);
        stats.totalErrors++;
        stats.lastErrorAt  = Date.now();
        stats.lastErrorMsg = err.message;
        pushEvent("error", `Sesi #${stats.totalSessions}: ${err.message}`);

        if (!client.connected) {
          log("WARN", "Koneksi putus — reconnect...");
          try {
            await client.connect();
            await client.sendMessage(botEntity, { message: config.CMD_SEARCH });
            log("SUCCESS", "Reconnect OK");
          } catch (re) {
            const reCode = re.errorMessage || re.message || "";
            if (SESSION_EXPIRED_ERRORS.some(e => reCode.includes(e))) {
              const ex = new Error("Session expired saat reconnect");
              ex.isSessionExpired = true;
              throw ex;
            }
            log("ERROR", `Reconnect gagal: ${re.message}`);
            await sleep(10000);
          }
        }
      }

      await sleep(config.LOOP_DELAY_MS);
    }
  } finally {
    try { await client.disconnect(); } catch (_) {}
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  startStatsServer();

  // Tunggu sampai session tersedia (ditulis oleh Telegram Bot saat OTP)
  let session = await readSession();
  if (!session) {
    log("INFO", "Session belum ada — menunggu Telegram Bot selesai auth...");
    log("INFO", "Login sekali di monitor Telegram Bot (port 3000), bot ini otomatis jalan.");
    stats.status = "waiting_session";

    while (!session) {
      await sleep(3000);
      session = await readSession();
      if (session) log("SUCCESS", "Session ditemukan! Konek ke Telegram...");
    }
  } else {
    log("INFO", "Session ditemukan — konek langsung tanpa login");
  }

  // Loop: runBot → jika expired → poll sampai session baru tersedia
  while (true) {
    try {
      await runBot(session);
      log("WARN", "runBot selesai — restart dalam 3s...");
      await sleep(3000);

    } catch (err) {
      if (err.isSessionExpired) {
        log("ERROR", "Session expired — menunggu Telegram Bot re-auth...");
        stats.status = "waiting_session";

        session = "";
        while (!session) {
          await sleep(5000);
          session = await readSession();
        }
        log("SUCCESS", "Session baru ditemukan — resume...");

      } else {
        log("ERROR", `runBot error: ${err.message}`);
        await sleep(5000);
      }
    }
  }
}

main().catch(err => {
  log("ERROR", "FATAL: " + err.message);
  process.exit(1);
});
