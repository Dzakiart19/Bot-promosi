/**
 * bot/duckchat-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry point utama DuckChat Bot — hanya berisi main loop.
 * Semua logika platform ada di lib/platforms/duckchat/.
 * Semua shared infra ada di lib/core/.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { startServer }                     = require("../lib/core/server");
const { log, sleep, C }                   = require("../lib/core/logger");
const { stats, pushEvent }                = require("../lib/core/stats");
const { config, createGuest, runSession } = require("../lib/platforms/duckchat");

// ── Start web server (monitoring + health + api/stats) ────────────────────────
startServer("DuckChat Bot");

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`${C.bold}${C.yellow}`);
console.log("  ██████╗ ██╗   ██╗ ██████╗██╗  ██╗ ██████╗██╗  ██╗ █████╗ ████████╗");
console.log("  ██╔══██╗██║   ██║██╔════╝██║ ██╔╝██╔════╝██║  ██║██╔══██╗╚══██╔══╝");
console.log("  ██║  ██║██║   ██║██║     █████╔╝ ██║     ███████║███████║   ██║   ");
console.log("  ██║  ██║██║   ██║██║     ██╔═██╗ ██║     ██╔══██║██╔══██║   ██║   ");
console.log("  ██████╔╝╚██████╔╝╚██████╗██║  ██╗╚██████╗██║  ██║██║  ██║   ██║   ");
console.log("  ╚═════╝  ╚═════╝  ╚═════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ");
console.log(`${C.reset}${C.cyan}  Platform : duckchat.club/lake${C.reset}`);
console.log();

// ── Main loop ─────────────────────────────────────────────────────────────────
async function main() {
  while (true) {
    stats.totalSessions++;
    stats.currentSession = stats.totalSessions;

    log("INFO", "━".repeat(52));
    log("INFO", `  SESI #${stats.totalSessions}  |  Match: ${stats.totalMatches}  Reply: ${stats.totalReplies}  Error: ${stats.totalErrors}`);
    log("INFO", "━".repeat(52));

    try {
      log("BOT", "Membuat guest baru (user-account-sync)...");
      const guest = await createGuest();
      log("SUCCESS", `Guest: ${guest.displayName}  (${guest.userId.slice(0, 20)}…)`);
      pushEvent("new_session", `Sesi #${stats.totalSessions} — ${guest.displayName}`);

      const reason = await runSession(guest);
      log("INFO", `Sesi #${stats.totalSessions} selesai → "${reason}"`);
      pushEvent("end_session", `Sesi #${stats.totalSessions} selesai: ${reason}`);

    } catch (err) {
      log("ERROR", `Sesi #${stats.totalSessions} error: ${err.message}`);
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = err.message;
      pushEvent("error", `Sesi #${stats.totalSessions}: ${err.message}`);
    }

    stats.status = "idle";
    await sleep(config.LOOP_DELAY_MS);
  }
}

main().catch((err) => {
  log("ERROR", "FATAL: " + err.message);
  process.exit(1);
});
