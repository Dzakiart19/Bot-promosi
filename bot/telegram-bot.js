/**
 * bot/telegram-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Telegram Auto-Promo Bot — @botchatanonymouss_bot
 *
 * Flow:
 *   1. Baca session dari Replit DB → file → env var (otomatis, tanpa copy-paste)
 *   2. Konek ke Telegram sebagai user
 *   3. Kirim /search → tunggu match → kirim promo → delay 5s → /next → ulangi
 *   4. Saat session expired → minta login ulang via monitor dashboard (OTP di browser)
 *   5. Session tersimpan otomatis ke Replit DB — persist walau deploy ulang / autoscale
 *
 * Jalankan:
 *   PORT=3000 node bot/telegram-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { TelegramClient }         = require("telegram");
const { StringSession }          = require("telegram/sessions");
const { log, sleep, C }          = require("../lib/core/logger");
const { stats, pushEvent }       = require("../lib/core/stats");
const { config, runSession, createMessageListener } = require("../lib/platforms/telegram");
const { readSession, writeSession, clearSession }   = require("../lib/platforms/telegram/persistence");
const {
  startAuthServer,
  requireReauth,
  setBotRunning,
}                                = require("../lib/platforms/telegram/auth-server");

// ── Error codes Telegram yang berarti sesi tidak valid ────────────────────────
const SESSION_EXPIRED_ERRORS = [
  "AUTH_KEY_UNREGISTERED",
  "AUTH_KEY_INVALID",
  "SESSION_REVOKED",
  "SESSION_EXPIRED",
  "USER_DEACTIVATED",
  "USER_DEACTIVATED_BAN",
];

// ── Env check ─────────────────────────────────────────────────────────────────
const API_ID   = parseInt(process.env.TELEGRAM_API_ID  || "0", 10);
const API_HASH = process.env.TELEGRAM_API_HASH || "";

if (!API_ID || !API_HASH) {
  console.error("ERROR: TELEGRAM_API_ID dan TELEGRAM_API_HASH wajib diset di Secrets.");
  process.exit(1);
}

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`${C.bold}${C.cyan}`);
console.log("  ████████╗███████╗██╗     ███████╗ ██████╗ ██████╗  █████╗ ███╗   ███╗");
console.log("     ██║   ██╔════╝██║     ██╔════╝██╔════╝ ██╔══██╗██╔══██╗████╗ ████║");
console.log("     ██║   █████╗  ██║     █████╗  ██║  ███╗██████╔╝███████║██╔████╔██║");
console.log("     ██║   ██╔══╝  ██║     ██╔══╝  ██║   ██║██╔══██╗██╔══██║██║╚██╔╝██║");
console.log("     ██║   ███████╗███████╗███████╗╚██████╔╝██║  ██║██║  ██║██║ ╚═╝ ██║");
console.log("     ╚═╝   ╚══════╝╚══════╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝");
console.log(`${C.reset}${C.cyan}  Platform : @${config.TARGET_BOT}${C.reset}\n`);

// ── Buat GramJS client ────────────────────────────────────────────────────────
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

// ── runBot: satu "masa hidup" bot dengan session tertentu ─────────────────────
// Throw { isSessionExpired: true } jika sesi dicabut / kedaluarsa
async function runBot(sessionStr) {
  stats.platform = "Telegram Bot";
  stats.status   = "connecting";

  const client = makeClient(sessionStr);

  log("INFO", "Menghubungkan ke Telegram...");
  try {
    await client.connect();
  } catch (err) {
    const code = err.errorMessage || err.message || "";
    if (SESSION_EXPIRED_ERRORS.some(e => code.includes(e))) err.isSessionExpired = true;
    throw err;
  }

  // Test koneksi — getMe() akan gagal kalau session tidak valid
  try {
    await client.getMe();
  } catch (err) {
    await client.disconnect();
    const code = err.errorMessage || err.message || "";
    if (SESSION_EXPIRED_ERRORS.some(e => code.includes(e))) err.isSessionExpired = true;
    throw err;
  }

  log("SUCCESS", "Terhubung ke Telegram ✓");

  // Dapatkan entity bot target
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

  // ── Pasang listener pesan permanen (tidak ada race condition antar sesi) ────
  const { nextMsg } = createMessageListener(client, botEntity);

  setBotRunning(true);
  stats.status     = "searching";
  stats.startTime  = Date.now();

  // Kirim /search pertama kali
  log("BOT", `Kirim ${config.CMD_SEARCH} untuk memulai...`);
  await client.sendMessage(botEntity, { message: config.CMD_SEARCH });
  pushEvent("search", "Bot dimulai — menunggu pasangan pertama...");

  // ── Loop utama ──────────────────────────────────────────────────────────────
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
          // /next belum dikirim — kirim /search untuk mulai lagi
          log("BOT", `Timeout — kirim ${config.CMD_SEARCH}...`);
          await client.sendMessage(botEntity, { message: config.CMD_SEARCH });
          pushEvent("search", "Re-search setelah timeout");
        }
        // reason "next-sent": /next sudah dikirim, server otomatis carikan pasangan baru
        // — langsung looping ke runSession berikutnya, tidak kirim /search lagi

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

        // Reconnect jika koneksi putus
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
    setBotRunning(false);
    try { await client.disconnect(); } catch (_) {}
  }
}

// ── main: outer loop — auth + re-auth otomatis ────────────────────────────────
async function main() {
  // Baca session tersimpan (Replit DB → file → env var)
  let session = await readSession();
  const hasSession = session.length > 0;

  log("INFO", hasSession
    ? "Session ditemukan — konek langsung tanpa login"
    : "Session tidak ditemukan — tunggu login via monitor");

  // Start server (port 3000) — selalu menyala sebagai monitor + auth endpoint
  const firstAuthPromise = startAuthServer(
    hasSession ? "_server_only" : "Session belum dikonfigurasi"
  );

  if (!hasSession) {
    session = await firstAuthPromise;
    log("SUCCESS", "Session diterima dari OTP — bot mulai...");
  }

  // ── Loop re-auth: runBot → expired → login ulang → runBot lagi ─────────────
  while (true) {
    try {
      await runBot(session);
      log("WARN", "runBot selesai — restart dalam 3s...");
      await sleep(3000);

    } catch (err) {
      if (err.isSessionExpired) {
        log("ERROR", "═".repeat(52));
        log("ERROR", "  SESSION KEDALUARSA");
        log("ERROR", "  Buka monitor → Telegram Bot → Kirim OTP");
        log("ERROR", "═".repeat(52));

        stats.status       = "auth_required";
        stats.lastErrorMsg = "Session expired — login ulang via monitor";
        pushEvent("error", "Session expired — buka monitor untuk login ulang");

        await clearSession();
        session = await requireReauth("Session kedaluarsa — login ulang diperlukan");

        // Simpan session baru sebelum run bot
        await writeSession(session);
        log("SUCCESS", "Re-auth selesai — bot resume...");

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
