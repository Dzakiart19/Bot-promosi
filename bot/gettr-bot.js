/**
 * bot/gettr-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry point bot GETTR. Siklus: login → trending → comment promo → sleep.
 * Auto-post mandiri setiap 1 jam. Tidak ada socket/match.
 *
 *   PORT=3008 node bot/gettr-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { startServer }            = require("../lib/core/server");
const { log, sleep, C }          = require("../lib/core/logger");
const { stats, pushEvent }       = require("../lib/core/stats");
const { config, login, runCommentSession, runPostSession } = require("../lib/platforms/gettr");
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

  let lastPostAt = Date.now();
  // Init supaya siklus pertama selalu COMMENT
  let lastPostTriggered = false;

  while (true) {
    stats.totalSessions++;
    stats.currentSession = stats.totalSessions;

    const now    = Date.now();
    const doPost = (now - lastPostAt >= config.POST_INTERVAL_MS);
    const mode   = doPost ? "POST" : "COMMENT";

    log("INFO", "━".repeat(54));
    log("INFO", `  SIKLUS #${stats.totalSessions}  [${mode}]  |  Sent: ${stats.totalMsgSent}  Error: ${stats.totalErrors}`);
    log("INFO", "━".repeat(54));

    try {
      let reason;

      if (doPost) {
        reason    = await runPostSession(session);
        lastPostAt = Date.now();
      } else {
        reason = await runCommentSession(session);
      }

      log("INFO", `Siklus #${stats.totalSessions} [${mode}] selesai → "${reason}"`);
      pushEvent("end_session", `Siklus #${stats.totalSessions} [${mode}]: ${reason}`);

      // Re-login kalau token expired / banned
      if (reason === "banned") {
        log("WARN", "[GETTR] Akun banned — coba re-login dalam 30 menit...");
        pushEvent("warn", "Akun banned — tunggu 30 menit lalu re-login");
        stats.status = "idle";
        await sleep(30 * 60 * 1000);
        try {
          session = await login();
          log("SUCCESS", "Re-login GETTR berhasil");
          pushEvent("info", "Re-login GETTR berhasil");
        } catch (e) {
          log("ERROR", `Re-login gagal: ${e.message}`);
          stats.lastErrorMsg = e.message;
        }
        continue;
      }
    } catch (err) {
      log("ERROR", `Siklus #${stats.totalSessions} [${mode}] error: ${err.message}`);
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

    stats.status = "idle";
    log("INFO", `Tunggu ${config.LOOP_DELAY_MS / 1000}s sebelum siklus berikutnya...`);
    await sleep(config.LOOP_DELAY_MS);
  }
}

main().catch((err) => {
  log("ERROR", "FATAL: " + err.message);
  process.exit(1);
});
