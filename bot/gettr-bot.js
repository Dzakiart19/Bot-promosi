/**
 * bot/gettr-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry point bot GETTR. Siklus: login → post mandiri tiap 15 menit.
 * Mode comment dinonaktifkan — endpoint comment GETTR tidak berfungsi
 * dari server-side (kemungkinan proteksi anti-bot dari sisi platform).
 *
 *   PORT=3008 node bot/gettr-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { startServer }            = require("../lib/core/server");
const { log, sleep, C }          = require("../lib/core/logger");
const { stats, pushEvent }       = require("../lib/core/stats");
const { config, login, runPostSession } = require("../lib/platforms/gettr");
const { log: sentLogStore }      = require("../lib/platforms/gettr/sent-log");

// ── Start web server ──────────────────────────────────────────────────────────
startServer("GETTR Bot");

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`${C.bold}${C.blue}`);
console.log("   ██████╗ ███████╗████████╗████████╗██████╗ ");
console.log("  ██╔════╝ ██╔════╝╚══██╔══╝╚══██╔══╝██╔══██╗");
console.log("  ██║  ███╗█████╗     ██║      ██║   ██████╔╝");
console.log("  ██║   ██║██╔══╝     ██║      ██║   ██╔══██╗");
console.log("  ╚██████╔╝███████╗   ██║      ██║   ██║  ██║");
console.log("   ╚═════╝ ╚══════╝   ╚═╝      ╚═╝   ╚═╝  ╚═╝");
console.log(`${C.reset}${C.cyan}  Platform : GETTR (auto-comment)${C.reset}`);
console.log();

// ── Main loop ─────────────────────────────────────────────────────────────────
async function main() {
  // Login dan dapatkan session token
  let session;
  try {
    log("BOT", "Login ke GETTR...");
    session = await login();
    log("SUCCESS", `Login OK — @${session.username}`);
    stats.status = "idle";
  } catch (err) {
    log("ERROR", `FATAL: Login GETTR gagal — ${err.message}`);
    stats.status = "error";
    stats.lastErrorMsg = err.message;
    stats.lastErrorAt  = Date.now();
    process.exit(1);
  }

  // Expose sent log ke /api/stats
  Object.defineProperty(stats, "sentLog", {
    get: () => sentLogStore,
    enumerable: true,
    configurable: true,
  });

  // POST-only: tiap 15 menit kirim satu post mandiri.
  // Init ke (now - interval) supaya siklus pertama langsung eksekusi.
  let lastPostAt = Date.now() - config.POST_INTERVAL_MS;

  while (true) {
    const now    = Date.now();
    const doPost = (now - lastPostAt >= config.POST_INTERVAL_MS);

    if (!doPost) {
      const nextPost = config.POST_INTERVAL_MS - (now - lastPostAt);
      stats.status = "idle";
      log("INFO", `Idle — post berikutnya dalam ${Math.ceil(nextPost / 60000)}m`);
      await sleep(Math.min(nextPost, config.LOOP_DELAY_MS));
      continue;
    }

    stats.totalSessions++;
    stats.currentSession = stats.totalSessions;

    log("INFO", "━".repeat(54));
    log("INFO", `  SIKLUS #${stats.totalSessions}  [POST]  |  Sent: ${stats.totalMsgSent}  Error: ${stats.totalErrors}`);
    log("INFO", "━".repeat(54));

    try {
      const reason = await runPostSession(session);
      lastPostAt   = Date.now();

      log("INFO", `Siklus #${stats.totalSessions} [POST] selesai → "${reason}"`);
      pushEvent("end_session", `Siklus #${stats.totalSessions} [POST]: ${reason}`);
    } catch (err) {
      log("ERROR", `Siklus #${stats.totalSessions} [POST] error: ${err.message}`);
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = err.message;
      pushEvent("error", `Siklus #${stats.totalSessions}: ${err.message}`);

      // Re-login kalau token expired
      if (/token|auth|E_BAD_TOKEN|E_AUTH/i.test(err.message)) {
        log("WARN", "[GETTR] Token expired — re-login...");
        try {
          session = await login();
          log("SUCCESS", "Re-login berhasil");
        } catch (e) {
          log("ERROR", `Re-login gagal: ${e.message}`);
        }
      }
    }

    await sleep(1000);
  }
}

main().catch((err) => {
  log("ERROR", "FATAL: " + err.message);
  process.exit(1);
});
