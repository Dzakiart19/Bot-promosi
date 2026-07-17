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
  // Exponential backoff saat login gagal berturut-turut (kemungkinan IP rate-limited).
  // Step: 0→1.5s, 1→10s, 2→30s, 3→60s, 4→120s, 5+→300s
  const LOGIN_BACKOFF_MS = [1500, 10_000, 30_000, 60_000, 120_000, 300_000];
  let consecutiveLoginFails = 0;

  while (true) {
    stats.totalSessions++;
    stats.currentSession = stats.totalSessions;

    log("INFO", "━".repeat(52));
    log("INFO", `  SESI #${stats.totalSessions}  |  Match: ${stats.totalMatches}  Reply: ${stats.totalReplies}  Error: ${stats.totalErrors}`);
    log("INFO", "━".repeat(52));

    try {
      log("BOT", "Login anonim (handle+gender+age, tanpa email)...");
      const guest = await createGuest();
      consecutiveLoginFails = 0;   // reset backoff setelah login berhasil
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

      // Login gagal (jwt tidak ditemukan) → kemungkinan IP rate-limited.
      // Terapkan exponential backoff agar tidak memperparah ban.
      if (err.message.includes("jwt tidak ditemukan") || err.message.includes("Login gagal")) {
        consecutiveLoginFails++;
        const backoffMs = LOGIN_BACKOFF_MS[Math.min(consecutiveLoginFails - 1, LOGIN_BACKOFF_MS.length - 1)];
        const backoffSec = Math.round(backoffMs / 1000);
        log("WARN", `Login gagal ${consecutiveLoginFails}x berturut-turut — backoff ${backoffSec}s sebelum retry...`);
        pushEvent("warn", `Backoff ${backoffSec}s (login gagal ${consecutiveLoginFails}x berturut-turut)`);
        stats.status = "idle";
        await sleep(backoffMs);
        continue;
      }
    }

    stats.status = "idle";
    await sleep(config.LOOP_DELAY_MS);
  }
}

main().catch((err) => {
  log("ERROR", "FATAL: " + err.message);
  process.exit(1);
});
