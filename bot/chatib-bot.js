/**
 * bot/chatib-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry point utama — hanya berisi main loop.
 * Semua logika platform ada di lib/platforms/chatib/.
 * Semua shared infra ada di lib/core/.
 *
 * Jalankan di port terpisah dari bot lain:
 *   PORT=3003 node bot/chatib-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { startServer }              = require("../lib/core/server");
const { log, sleep, C }            = require("../lib/core/logger");
const { stats, pushEvent }         = require("../lib/core/stats");
const { config, createGuest, runSession } = require("../lib/platforms/chatib");

// ── Start web server (monitoring + health + api/stats) ────────────────────────
startServer("Chatib Bot");

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`${C.bold}${C.magenta}`);
console.log("   ██████╗██╗  ██╗ █████╗ ████████╗██╗██████╗ ");
console.log("  ██╔════╝██║  ██║██╔══██╗╚══██╔══╝██║██╔══██╗");
console.log("  ██║     ███████║███████║   ██║   ██║██████╔╝");
console.log("  ██║     ██╔══██║██╔══██║   ██║   ██║██╔══██╗");
console.log("  ╚██████╗██║  ██║██║  ██║   ██║   ██║██████╔╝");
console.log("   ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝╚═════╝ ");
console.log(`${C.reset}${C.cyan}  Platform : app.chatib.chat${C.reset}`);
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
      log("BOT", "Login anonim (handle+gender+age, tanpa email)...");
      const guest = await createGuest();
      log("SUCCESS", `Guest: ${guest.displayName}  (user_id=${guest.userId})`);
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
