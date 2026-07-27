/**
 * bot/xnxx-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * XNXX Auto-Comment Bot
 *
 * Siklus: search video by keyword → ambil detail (videoId)
 *         → solve FriendlyCaptcha PoW (server-side SHA-256)
 *         → post komentar promo → sleep → ulangi
 *
 * Auth: TIDAK dibutuhkan — XNXX mengizinkan komentar anonim dengan
 *       FriendlyCaptcha PoW. Tidak perlu env var khusus.
 *
 *   PORT=3013 node bot/xnxx-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { startServer }         = require("../lib/core/server");
const { log, sleep, C }       = require("../lib/core/logger");
const { stats, pushEvent }    = require("../lib/core/stats");
const { config, runCommentSession } = require("../lib/platforms/xnxx");
const { log: sentLogStore }   = require("../lib/platforms/xnxx/sent-log");

// ── Start web server ──────────────────────────────────────────────────────────
startServer("XNXX Bot");

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`${C.bold}${C.cyan}`);
console.log("  ██╗  ██╗███╗  ██╗██╗  ██╗██╗  ██╗");
console.log("   ██╗██╔╝████╗ ██║╚██╗██╔╝╚██╗██╔╝");
console.log("    ███╔╝ ██╔██╗██║ ╚███╔╝  ╚███╔╝ ");
console.log("   ██╔██╗ ██║╚████║ ██╔██╗  ██╔██╗ ");
console.log("  ██╔╝╚██╗██║ ╚███║██╔╝╚██╗██╔╝╚██╗");
console.log("  ╚═╝  ╚═╝╚═╝  ╚══╝╚═╝  ╚═╝╚═╝  ╚═╝");
console.log(`${C.reset}${C.cyan}  Platform : xnxx.com (auto-comment anonymous)${C.reset}`);
console.log();

// ── Main loop ─────────────────────────────────────────────────────────────────
async function main() {
  // Expose sent log ke /api/stats
  Object.defineProperty(stats, "sentLog", {
    get: () => sentLogStore,
    enumerable: true,
    configurable: true,
  });

  stats.status = "idle";
  log("SUCCESS", "XNXX Bot siap — mode anonymous (tidak butuh login/cookies)");

  // Init timer: siklus pertama langsung eksekusi
  let lastCommentAt = Date.now() - config.COMMENT_INTERVAL_MS;

  while (true) {
    const now       = Date.now();
    const doComment = (now - lastCommentAt >= config.COMMENT_INTERVAL_MS);

    if (!doComment) {
      const nextComment = config.COMMENT_INTERVAL_MS - (now - lastCommentAt);
      stats.status = "idle";
      log("INFO", `Idle — comment dalam ${Math.ceil(nextComment / 60000)}m`);
      await sleep(Math.min(nextComment, config.LOOP_DELAY_MS));
      continue;
    }

    stats.totalSessions++;
    stats.currentSession = stats.totalSessions;

    log("INFO", "━".repeat(54));
    log("INFO", `  SIKLUS #${stats.totalSessions}  [COMMENT]  |  Sent: ${stats.totalMsgSent}  Error: ${stats.totalErrors}`);
    log("INFO", "━".repeat(54));

    let reason;
    try {
      reason        = await runCommentSession();
      lastCommentAt = Date.now();

      log("INFO", `Siklus #${stats.totalSessions} selesai → "${reason}"`);

      switch (reason) {
        case "comments-sent":
          stats.status = "idle";
          log("SUCCESS", `✓ Komentar berhasil dikirim — istirahat ${config.COMMENT_INTERVAL_MS / 60000}m`);
          break;
        case "captcha-failed":
          stats.status = "idle";
          // cooldown sudah di-handle di session.js
          break;
        case "no-target":
          stats.status = "idle";
          await sleep(60_000);   // tunggu 1 menit sebelum coba keyword lain
          break;
        case "all-failed":
          stats.status = "idle";
          await sleep(60_000);
          break;
        case "fetch-error":
          stats.status = "error";
          await sleep(30_000);
          break;
        default:
          stats.status = "idle";
      }
    } catch (err) {
      log("ERROR", `Siklus #${stats.totalSessions} error tak terduga: ${err.message}`);
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = err.message;
      stats.status       = "error";
      pushEvent("error", `Siklus error: ${err.message}`);
      await sleep(60_000);
    }
  }
}

main().catch((err) => {
  log("ERROR", `FATAL: ${err.message}`);
  process.exit(1);
});
