/**
 * bot/silly-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry point utama — hanya berisi main loop.
 * Semua logika platform ada di lib/platforms/silly/.
 * Semua shared infra ada di lib/core/.
 *
 * Jalankan:
 *   PORT=3001 node bot/silly-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { startServer }                    = require("../lib/core/server");
const { log, sleep, C }                  = require("../lib/core/logger");
const { stats, pushEvent }               = require("../lib/core/stats");
const { config, createGuest, runSession } = require("../lib/platforms/silly");

// ── Start web server (monitoring + health + api/stats) ────────────────────────
startServer("SillyChat Bot");

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`${C.bold}${C.magenta}`);
console.log("  ███████╗██╗██╗     ██╗  ██╗   ██╗ ██████╗██╗  ██╗ █████╗ ████████╗");
console.log("  ██╔════╝██║██║     ██║  ╚██╗ ██╔╝██╔════╝██║  ██║██╔══██╗╚══██╔══╝");
console.log("  ███████╗██║██║     ██║   ╚████╔╝ ██║     ███████║███████║   ██║   ");
console.log("  ╚════██║██║██║     ██║    ╚██╔╝  ██║     ██╔══██║██╔══██║   ██║   ");
console.log("  ███████║██║███████╗███████╗██║   ╚██████╗██║  ██║██║  ██║   ██║   ");
console.log("  ╚══════╝╚═╝╚══════╝╚══════╝╚═╝    ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ");
console.log(`${C.reset}${C.cyan}  Platform : silly.chat/text-chat${C.reset}`);
console.log();

// ── Exponential backoff state (untuk CAPTCHA block / platform error berulang) ─
const BACKOFF = {
  consecutive: 0,
  captchaMs:  300_000,  // mulai 5 menit untuk CAPTCHA block
  platformMs:  30_000,  // mulai 30 detik untuk platform error
  maxMs:      900_000,  // max 15 menit
};

// ── Main loop ─────────────────────────────────────────────────────────────────
async function main() {
  while (true) {
    stats.totalSessions++;
    stats.currentSession = stats.totalSessions;

    log("INFO", "━".repeat(52));
    log("INFO", `  SESI #${stats.totalSessions}  |  Match: ${stats.totalMatches}  Reply: ${stats.totalReplies}  Error: ${stats.totalErrors}`);
    log("INFO", "━".repeat(52));

    try {
      log("BOT", "Membuat guest baru (token auth)...");
      const guest = await createGuest();
      log("SUCCESS", `Guest: ${guest.displayName}  (${guest.userId})`);
      pushEvent("new_session", `Sesi #${stats.totalSessions} — ${guest.displayName}`);

      BACKOFF.consecutive = 0; // reset setelah berhasil

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

      // CAPTCHA block (HTTP 403 dari /api/auth/guest-token) → backoff panjang
      if (/403/.test(err.message)) {
        BACKOFF.consecutive++;
        const wait = Math.min(BACKOFF.captchaMs * BACKOFF.consecutive, BACKOFF.maxMs);
        log("WARN", `CAPTCHA block — backoff #${BACKOFF.consecutive}, tunggu ${Math.round(wait / 60000)}m ${Math.round((wait % 60000) / 1000)}s...`);
        stats.status = "captcha-blocked";
        pushEvent("warn", `CAPTCHA block — retry dalam ${Math.round(wait / 60000)} menit`);
        await sleep(wait);
      } else if (/522|503|504|ECONNREFUSED|ETIMEDOUT/.test(err.message)) {
        // Platform down
        BACKOFF.consecutive++;
        const wait = Math.min(BACKOFF.platformMs * 2 ** BACKOFF.consecutive, BACKOFF.maxMs);
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
