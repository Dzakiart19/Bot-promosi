/**
 * bot/anonchat-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry point AnonChat Bot — hanya berisi main loop.
 * Semua logika platform ada di lib/platforms/anonchat/.
 *
 * Jalankan:
 *   PORT=3009 node bot/anonchat-bot.js
 *
 * Env wajib:
 *   ANONCHAT_COOKIES="auth_token=xxx; user_id=yyy"
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { startServer }                     = require("../lib/core/server");
const { log, sleep, C }                   = require("../lib/core/logger");
const { stats, pushEvent }                = require("../lib/core/stats");
const { config, createGuest, runSession } = require("../lib/platforms/anonchat");

// ── Start web server (monitoring + health + api/stats) ────────────────────────
startServer("AnonChat Bot");

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`${C.bold}${C.cyan}`);
console.log("   █████╗ ███╗   ██╗ ██████╗ ███╗   ██╗ ██████╗██╗  ██╗ █████╗ ████████╗");
console.log("  ██╔══██╗████╗  ██║██╔═══██╗████╗  ██║██╔════╝██║  ██║██╔══██╗╚══██╔══╝");
console.log("  ███████║██╔██╗ ██║██║   ██║██╔██╗ ██║██║     ███████║███████║   ██║   ");
console.log("  ██╔══██║██║╚██╗██║██║   ██║██║╚██╗██║██║     ██╔══██║██╔══██║   ██║   ");
console.log("  ██║  ██║██║ ╚████║╚██████╔╝██║ ╚████║╚██████╗██║  ██║██║  ██║   ██║   ");
console.log("  ╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ");
console.log(`${C.reset}${C.cyan}  Platform : alpha.anonchat.com/search${C.reset}`);
console.log();

// ── Cek env ANONCHAT_COOKIES ──────────────────────────────────────────────────
if (!process.env.ANONCHAT_COOKIES) {
  log("ERROR", "ANONCHAT_COOKIES belum diset!");
  log("ERROR", 'Set env: ANONCHAT_COOKIES="auth_token=xxx; user_id=yyy"');
  log("WARN",  "Bot tetap berjalan — akan retry tiap 60 detik sampai cookie diset.");
}

// ── Exponential backoff ───────────────────────────────────────────────────────
const BACKOFF = {
  consecutive: 0,
  minMs:  30_000,
  maxMs: 600_000,
};

function backoffDelay() {
  return Math.min(BACKOFF.minMs * 2 ** BACKOFF.consecutive, BACKOFF.maxMs);
}

// ── Main loop ─────────────────────────────────────────────────────────────────
async function main() {
  // Kalau cookie belum diset, tunggu dulu
  while (!process.env.ANONCHAT_COOKIES) {
    await sleep(60_000);
    if (process.env.ANONCHAT_COOKIES) {
      log("SUCCESS", "ANONCHAT_COOKIES terdeteksi — mulai bot...");
    }
  }

  while (true) {
    stats.totalSessions++;
    stats.currentSession = stats.totalSessions;

    log("INFO", "━".repeat(52));
    log("INFO", `  SESI #${stats.totalSessions}  |  Match: ${stats.totalMatches}  Reply: ${stats.totalReplies}  Error: ${stats.totalErrors}`);
    log("INFO", "━".repeat(52));

    try {
      log("BOT", "Menyiapkan session dari cookie...");
      const guest = await createGuest();
      log("SUCCESS", `Guest: ${guest.displayName}  (user_id: ${guest.userId})`);
      pushEvent("new_session", `Sesi #${stats.totalSessions} — ${guest.displayName}`);

      BACKOFF.consecutive = 0;

      const reason = await runSession(guest);
      log("INFO", `Sesi #${stats.totalSessions} selesai → "${reason}"`);
      pushEvent("end_session", `Sesi #${stats.totalSessions} selesai: ${reason}`);

      await sleep(config.LOOP_DELAY_MS);

    } catch (err) {
      log("ERROR", `Sesi #${stats.totalSessions} error: ${err.message}`);
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = err.message;
      pushEvent("error", `Sesi #${stats.totalSessions}: ${err.message}`);

      if (/ANONCHAT_COOKIES/.test(err.message)) {
        // Cookie belum ada — retry tiap 60 detik
        log("WARN", "Cookie belum diset — retry dalam 60 detik...");
        stats.status = "waiting-config";
        await sleep(60_000);
      } else if (/522|503|504|ECONNREFUSED|ETIMEDOUT|connect-error/.test(err.message)) {
        BACKOFF.consecutive++;
        const wait = backoffDelay();
        log("WARN", `Platform/network error — backoff #${BACKOFF.consecutive}, tunggu ${Math.round(wait / 1000)}s...`);
        stats.status = "backoff";
        pushEvent("warn", `Error — retry dalam ${Math.round(wait / 1000)}s`);
        await sleep(wait);
      } else {
        BACKOFF.consecutive = 0;
        await sleep(config.LOOP_DELAY_MS);
      }
    }

    stats.status = "idle";
  }
}

main().catch((err) => {
  log("ERROR", "FATAL: " + err.message);
  process.exit(1);
});
