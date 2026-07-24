/**
 * bot/yapping-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry point utama — hanya berisi main loop.
 * Semua logika platform ada di lib/platforms/yapping/.
 * Semua shared infra ada di lib/core/.
 *
 * Jalankan di port terpisah dari bot lain:
 *   PORT=3000 node bot/yapping-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { startServer }                    = require("../lib/core/server");
const { log, sleep, C }                  = require("../lib/core/logger");
const { stats, pushEvent }               = require("../lib/core/stats");
const { config, createGuest, runSession } = require("../lib/platforms/yapping");

// ── Start web server (monitoring + health + api/stats) ────────────────────────
startServer("Yapping Bot");

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`${C.bold}${C.green}`);
console.log("  ██╗   ██╗ █████╗ ██████╗ ██████╗ ██╗███╗   ██╗ ██████╗ ");
console.log("  ╚██╗ ██╔╝██╔══██╗██╔══██╗██╔══██╗██║████╗  ██║██╔════╝ ");
console.log("   ╚████╔╝ ███████║██████╔╝██████╔╝██║██╔██╗ ██║██║  ███╗");
console.log("    ╚██╔╝  ██╔══██║██╔═══╝ ██╔═══╝ ██║██║╚██╗██║██║   ██║");
console.log("     ██║   ██║  ██║██║     ██║     ██║██║ ╚████║╚██████╔╝");
console.log("     ╚═╝   ╚═╝  ╚═╝╚═╝     ╚═╝     ╚═╝╚═╝  ╚═══╝ ╚═════╝ ");
console.log(`${C.reset}${C.cyan}  Platform : yapping.me/chat${C.reset}`);
console.log();

// ── Exponential backoff state (untuk error berulang seperti platform down) ────
const BACKOFF = {
  consecutive: 0,
  minMs:   30_000,   // 30 detik
  maxMs:  600_000,   // 10 menit
};

function backoffDelay() {
  const ms = Math.min(BACKOFF.minMs * 2 ** BACKOFF.consecutive, BACKOFF.maxMs);
  return ms;
}

// ── Main loop ─────────────────────────────────────────────────────────────────
async function main() {
  while (true) {
    stats.totalSessions++;
    stats.currentSession = stats.totalSessions;

    log("INFO", "━".repeat(52));
    log("INFO", `  SESI #${stats.totalSessions}  |  Match: ${stats.totalMatches}  Reply: ${stats.totalReplies}  Error: ${stats.totalErrors}`);
    log("INFO", "━".repeat(52));

    try {
      log("BOT", "Membuat guest baru (cookie auth)...");
      const guest = await createGuest();
      log("SUCCESS", `Guest: ${guest.displayName}  (${guest.username})`);
      pushEvent("new_session", `Sesi #${stats.totalSessions} — ${guest.displayName}`);

      BACKOFF.consecutive = 0; // reset backoff setelah berhasil connect

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

      // Platform down (HTTP 522/503/504) → exponential backoff
      if (/522|503|504|ECONNREFUSED|ETIMEDOUT/.test(err.message)) {
        BACKOFF.consecutive++;
        const wait = backoffDelay();
        log("WARN", `Platform down — backoff #${BACKOFF.consecutive}, tunggu ${Math.round(wait / 1000)}s...`);
        stats.status = "backoff";
        pushEvent("warn", `Platform down — retry dalam ${Math.round(wait / 1000)}s`);
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
