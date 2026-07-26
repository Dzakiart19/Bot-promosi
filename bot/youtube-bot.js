/**
 * bot/youtube-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry point auto-comment YouTube. Polanya sama dengan X Bot:
 * tidak ada socket/match — cuma siklus search keyword → komentari video → sleep.
 *
 * Auth: set env var YOUTUBE_COOKIES dengan isi cookie string dari youtube.com.
 * Cara ambil cookie:
 *   1. Login ke youtube.com di browser
 *   2. DevTools → Application → Cookies → youtube.com
 *   3. Copy semua cookie jadi satu string: "SAPISID=xxx; SID=yyy; SSID=zzz; ..."
 *   4. Paste ke Replit Secrets → key: YOUTUBE_COOKIES
 *
 *   PORT=3010 node bot/youtube-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { startServer }            = require("../lib/core/server");
const { log, sleep, C }          = require("../lib/core/logger");
const { stats, pushEvent }       = require("../lib/core/stats");
const { config, verifyLogin, runCommentSession } = require("../lib/platforms/youtube");
const { log: sentLogStore }      = require("../lib/platforms/youtube/sent-log");

// ── Start web server (monitoring + health + api/stats) ────────────────────────
startServer("YouTube Bot");

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`${C.bold}${C.red}`);
console.log("  ██╗   ██╗ ██████╗ ██╗   ██╗████████╗██╗   ██╗██████╗ ███████╗");
console.log("  ╚██╗ ██╔╝██╔═══██╗██║   ██║╚══██╔══╝██║   ██║██╔══██╗██╔════╝");
console.log("   ╚████╔╝ ██║   ██║██║   ██║   ██║   ██║   ██║██████╔╝█████╗  ");
console.log("    ╚██╔╝  ██║   ██║██║   ██║   ██║   ██║   ██║██╔══██╗██╔══╝  ");
console.log("     ██║   ╚██████╔╝╚██████╔╝   ██║   ╚██████╔╝██████╔╝███████╗");
console.log("     ╚═╝    ╚═════╝  ╚═════╝    ╚═╝    ╚═════╝ ╚═════╝ ╚══════╝");
console.log(`${C.reset}${C.cyan}  Platform : youtube.com (auto-comment via InnerTube)${C.reset}`);
console.log();

// ── Main loop ─────────────────────────────────────────────────────────────────
async function main() {
  // Expose sent log ke /api/stats supaya dashboard bisa baca
  Object.defineProperty(stats, "sentLog", {
    get: () => sentLogStore,
    enumerable: true,
    configurable: true,
  });

  // ── Tunggu cookie valid ────────────────────────────────────────────────────
  let verified = false;
  while (!verified) {
    if (!process.env.YOUTUBE_COOKIES) {
      log("WARN", "YOUTUBE_COOKIES belum diset — set Replit Secret lalu bot otomatis jalan. Cek ulang tiap 60 detik...");
      log("INFO", "Cara: DevTools YouTube → Application → Cookies → copy semua → paste ke YOUTUBE_COOKIES");
      stats.status = "waiting-cookie";
      stats.lastErrorMsg = "YOUTUBE_COOKIES belum diset";
      await sleep(60_000);
      continue;
    }

    try {
      const info = await verifyLogin();
      log("SUCCESS", `Login OK — logged_in=${info.logged_in} ${info.visitorData ? "(session valid)" : ""}`);
      verified = true;
    } catch (err) {
      log("ERROR", `Cookie tidak valid: ${err.message}. Retry dalam 60 detik...`);
      stats.status = "waiting-cookie";
      stats.lastErrorMsg = err.message;
      stats.lastErrorAt  = Date.now();
      await sleep(60_000);
    }
  }

  // ── Main siklus ────────────────────────────────────────────────────────────
  while (true) {
    stats.totalSessions++;
    stats.currentSession = stats.totalSessions;

    log("INFO", "━".repeat(58));
    log("INFO", `  SIKLUS #${stats.totalSessions}  [COMMENT]  |  Sent: ${stats.totalReplies}  Error: ${stats.totalErrors}`);
    log("INFO", "━".repeat(58));

    let reason;
    try {
      reason = await runCommentSession();
      log("INFO", `Siklus #${stats.totalSessions} selesai → "${reason}"`);
      pushEvent("end_session", `Siklus #${stats.totalSessions} selesai: ${reason}`);
    } catch (err) {
      reason = "fatal-error";
      log("ERROR", `Siklus #${stats.totalSessions} error: ${err.message}`);
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = err.message;
      pushEvent("error", `Siklus #${stats.totalSessions}: ${err.message}`);
    }

    stats.status = "idle";

    // Kalau cookie expired, tunggu lebih lama sebelum retry
    if (/cookie|expired|signed in|logged_in/i.test(stats.lastErrorMsg || "")) {
      log("WARN", "Session mungkin expired — tunggu 5 menit lalu coba reinit...");
      pushEvent("warn", "Cookie mungkin expired — reinit dalam 5 menit");
      await sleep(300_000);
    } else {
      // Delay normal antar siklus (10 menit — lebih aman dari shadowban)
      log("INFO", `Tunggu ${config.LOOP_DELAY_MS / 60000} menit sebelum siklus berikutnya...`);
      await sleep(config.LOOP_DELAY_MS);
    }
  }
}

main().catch((err) => {
  log("ERROR", "FATAL: " + err.message);
  process.exit(1);
});
