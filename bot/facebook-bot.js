/**
 * bot/facebook-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry point bot auto-comment Facebook Reels.
 *
 * Beda dari platform chat anonim: tidak ada socket/match.
 * Loop: ambil daftar reel/video → comment promo tiap 30 detik.
 *
 * Auth: cookie session dari FB_COOKIES (c_user + xs + fr + datr + dll.)
 *
 *   PORT=3009 node bot/facebook-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { startServer }              = require("../lib/core/server");
const { log, sleep, C }            = require("../lib/core/logger");
const { stats, pushEvent }         = require("../lib/core/stats");
const { config, createGuest, runCommentSession } = require("../lib/platforms/facebook");
const { log: sentLogStore }        = require("../lib/platforms/facebook/sent-log");

// ── Start web server (monitoring + health + api/stats) ────────────────────────
startServer("Facebook Bot");

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`${C.bold}${C.blue}`);
console.log("  ███████╗ █████╗  ██████╗███████╗██████╗  ██████╗  ██████╗ ██╗  ██╗");
console.log("  ██╔════╝██╔══██╗██╔════╝██╔════╝██╔══██╗██╔═══██╗██╔═══██╗██║ ██╔╝");
console.log("  █████╗  ███████║██║     █████╗  ██████╔╝██║   ██║██║   ██║█████╔╝ ");
console.log("  ██╔══╝  ██╔══██║██║     ██╔══╝  ██╔══██╗██║   ██║██║   ██║██╔═██╗ ");
console.log("  ██║     ██║  ██║╚██████╗███████╗██████╔╝╚██████╔╝╚██████╔╝██║  ██╗");
console.log("  ╚═╝     ╚═╝  ╚═╝ ╚═════╝╚══════╝╚═════╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═╝");
console.log(`${C.reset}${C.cyan}  Platform : facebook.com (auto-comment Reels)${C.reset}`);
console.log();

// ── Main loop ─────────────────────────────────────────────────────────────────
async function main() {
  let account;
  try {
    log("BOT", "Verifikasi cookie session Facebook (FB_COOKIES)...");
    account = await createGuest();
    log("SUCCESS", `Login OK — userId=${account.userId}`);
  } catch (err) {
    log("ERROR", `FATAL: cookie FB tidak valid — ${err.message}`);
    stats.status = "error";
    stats.lastErrorMsg = err.message;
    stats.lastErrorAt  = Date.now();
    process.exit(1);
  }

  // Expose sent log ke /api/stats supaya dashboard bisa baca
  Object.defineProperty(stats, "sentLog", {
    get: () => sentLogStore,
    enumerable: true,
    configurable: true,
  });

  let consecutiveErrors = 0;

  while (true) {
    log("INFO", "━".repeat(52));
    log("INFO", `  SIKLUS #${stats.totalSessions + 1}  [COMMENT]  |  Sent: ${stats.totalMsgSent}  Error: ${stats.totalErrors}`);
    log("INFO", "━".repeat(52));

    try {
      const reason = await runCommentSession(account);
      log("INFO", `Siklus #${stats.totalSessions} selesai → "${reason}"`);
      pushEvent("end_session", `Siklus #${stats.totalSessions} selesai: ${reason}`);
      consecutiveErrors = 0;

      // Rate-limit Facebook — istirahat 10 menit supaya ban cepat lift
      if (reason === "rate-limited") {
        log("WARN", "[FB] Rate-limited oleh Facebook — istirahat 10 menit");
        stats.status = "idle";
        await sleep(10 * 60 * 1000);
        continue;
      }

      // Kalau akun blocked, tunggu lebih lama
      if (reason === "account-blocked") {
        log("WARN", "[FB] Akun blocked — tidur 30 menit");
        stats.status = "idle";
        await sleep(30 * 60 * 1000);
        continue;
      }
    } catch (err) {
      consecutiveErrors++;
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = err.message;
      log("ERROR", `Siklus error: ${err.message}`);
      pushEvent("error", `Siklus error: ${err.message}`);

      // Exponential backoff jika error terus-menerus
      if (consecutiveErrors >= 5) {
        const backoff = Math.min(consecutiveErrors * 60_000, 600_000); // max 10 menit
        log("WARN", `[FB] ${consecutiveErrors}x error berturut — backoff ${backoff / 1000}s`);
        stats.status = "idle";
        await sleep(backoff);
        continue;
      }
    }

    stats.status = "idle";
    // 30 detik antar komentar sesuai permintaan
    log("INFO", `[FB] Tunggu ${config.LOOP_DELAY_MS / 1000}s sebelum siklus berikutnya...`);
    await sleep(config.LOOP_DELAY_MS);
  }
}

main().catch((err) => {
  log("ERROR", "FATAL: " + err.message);
  process.exit(1);
});
