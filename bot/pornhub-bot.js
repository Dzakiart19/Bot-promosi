/**
 * bot/pornhub-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PornHub Auto-Comment Bot
 *
 * Siklus: search video by keyword → ambil detail (video_id + XSRF token)
 *         → post komentar promo → sleep → ulangi
 *
 * Auth: PORNHUB_COOKIES (cookie session dari browser) + PORNHUB_USER_ID
 *       Diset sebagai env var di environment "shared".
 *       Update PORNHUB_COOKIES kalau session expired (ganti dari browser).
 *
 * Tidak ada login via username/password — langsung pakai cookie dari browser,
 * mirip pola AnonChat Bot dan X Bot.
 *
 *   PORT=3013 node bot/pornhub-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { startServer }                    = require("../lib/core/server");
const { log, sleep, C }                  = require("../lib/core/logger");
const { stats, pushEvent }               = require("../lib/core/stats");
const { config, verifySession,
        runCommentSession }              = require("../lib/platforms/pornhub");
const { log: sentLogStore }             = require("../lib/platforms/pornhub/sent-log");

// ── Start web server ──────────────────────────────────────────────────────────
startServer("PornHub Bot");

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`${C.bold}${C.magenta}`);
console.log("  ██████╗  ██╗  ██╗");
console.log("  ██╔══██╗ ██║  ██║");
console.log("  ██████╔╝ ███████║");
console.log("  ██╔═══╝  ██╔══██║");
console.log("  ██║      ██║  ██║");
console.log("  ╚═╝      ╚═╝  ╚═╝");
console.log(`${C.reset}${C.cyan}  Platform : pornhub.org (auto-comment)${C.reset}`);
console.log();

// ── Main loop ─────────────────────────────────────────────────────────────────
async function main() {
  // Expose sent log ke /api/stats
  Object.defineProperty(stats, "sentLog", {
    get: () => sentLogStore,
    enumerable: true,
    configurable: true,
  });

  // ── Tunggu sampai PORNHUB_COOKIES tersedia ────────────────────────────────
  while (!process.env.PORNHUB_COOKIES) {
    log("WARN", "PORNHUB_COOKIES belum diset di environment.");
    log("INFO", "Set env var PORNHUB_COOKIES lalu restart workflow ini.");
    stats.status       = "waiting-config";
    stats.lastErrorMsg = "PORNHUB_COOKIES belum diset";
    await sleep(60_000);
  }

  // ── Verifikasi session cookies ────────────────────────────────────────────
  let session;
  try {
    log("BOT", "Verifikasi cookie session PornHub...");
    session = await verifySession();
    log("SUCCESS", `Session OK — userId: ${session.userId || "?"}, handle: @${session.handle || "?"}`);
    stats.status = "idle";
  } catch (err) {
    log("ERROR", `FATAL: Verifikasi session gagal — ${err.message}`);
    stats.status       = "error";
    stats.lastErrorMsg = err.message;
    stats.lastErrorAt  = Date.now();
    process.exit(1);
  }

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
      pushEvent("end_session", `Siklus #${stats.totalSessions}: ${reason}`);

      // Kalau cookies expired — warning dan sleep panjang (tunggu update manual)
      if (reason === "cookies-expired") {
        log("WARN", "[PH] Cookies expired — update PORNHUB_COOKIES di environment, bot sleep 30 menit");
        pushEvent("warn", "PORNHUB_COOKIES expired — perlu diupdate manual");
        stats.status       = "error";
        stats.lastErrorMsg = "Cookies expired — update PORNHUB_COOKIES";
        await sleep(30 * 60 * 1000);
        // Coba lanjut — mungkin env var sudah diupdate
        stats.status = "idle";
      }

    } catch (err) {
      log("ERROR", `Siklus #${stats.totalSessions} error: ${err.message}`);
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = err.message;
      pushEvent("error", `Siklus #${stats.totalSessions}: ${err.message}`);

      // Re-check cookies kalau 401
      if (/401|cookies|expired|auth/i.test(err.message)) {
        log("WARN", "[PH] Auth error — tunggu 10 menit lalu coba lagi");
        await sleep(10 * 60 * 1000);
      }
      lastCommentAt = Date.now(); // reset timer supaya tidak langsung retry
    }

    stats.status = "idle";
    await sleep(1_000);
  }
}

main().catch((err) => {
  log("ERROR", "FATAL: " + err.message);
  process.exit(1);
});
