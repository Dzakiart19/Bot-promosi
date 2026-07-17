/**
 * bot/x-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry point auto-reply X (Twitter). Beda dari bot chat lain: tidak ada
 * socket/match, cuma siklus search-keyword → reply satu tweet → sleep 1 menit.
 * Semua logika platform ada di lib/platforms/x/.
 *
 *   PORT=6000 node bot/x-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { startServer }              = require("../lib/core/server");
const { log, sleep, C }            = require("../lib/core/logger");
const { stats, pushEvent }         = require("../lib/core/stats");
const { config, createGuest, runReplySession, runCommentSession, runPostSession } = require("../lib/platforms/x");
const { log: sentLogStore } = require("../lib/platforms/x/sent-log");

// ── Start web server (monitoring + health + api/stats) ────────────────────────
startServer("X Bot");

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`${C.bold}${C.blue}`);
console.log("  ██╗  ██╗    ██████╗  ██████╗ ████████╗");
console.log("  ╚██╗██╔╝    ██╔══██╗██╔═══██╗╚══██╔══╝");
console.log("   ╚███╔╝     ██████╔╝██║   ██║   ██║   ");
console.log("   ██╔██╗     ██╔══██╗██║   ██║   ██║   ");
console.log("  ██╔╝ ██╗    ██████╔╝╚██████╔╝   ██║   ");
console.log("  ╚═╝  ╚═╝    ╚═════╝  ╚═════╝    ╚═╝   ");
console.log(`${C.reset}${C.cyan}  Platform : x.com (auto-reply)${C.reset}`);
console.log();

// ── Main loop ─────────────────────────────────────────────────────────────────
async function main() {
  let account;
  try {
    log("BOT", "Verifikasi cookie session X (auth_token/ct0)...");
    account = await createGuest();
    log("SUCCESS", `Login OK sebagai @${account.displayName} (${account.userId})`);
  } catch (err) {
    log("ERROR", `FATAL: cookie X tidak valid — ${err.message}`);
    stats.status = "error";
    stats.lastErrorMsg = err.message;
    stats.lastErrorAt = Date.now();
    process.exit(1);
  }

  // Expose sent log ke /api/stats supaya dashboard bisa baca
  Object.defineProperty(stats, "sentLog", {
    get: () => sentLogStore,
    enumerable: true,
    configurable: true,
  });

  // lastReplyAt & lastPostAt diinit ke Date.now() supaya siklus pertama
  // selalu [COMMENT], reply & post baru jalan setelah interval pertama habis.
  let lastReplyAt = Date.now();
  let lastPostAt  = Date.now();

  while (true) {
    stats.totalSessions++;
    stats.currentSession = stats.totalSessions;

    const now = Date.now();
    const doReply = config.COMMENT_MODE_ENABLED
      ? (now - lastReplyAt >= config.REPLY_INTERVAL_MS)
      : true;
    const doPost = (now - lastPostAt >= config.POST_INTERVAL_MS);

    // Prioritas: POST > REPLY > COMMENT
    const mode = doPost ? "POST" : doReply ? "REPLY" : "COMMENT";

    log("INFO", "━".repeat(52));
    log("INFO", `  SIKLUS #${stats.totalSessions}  [${mode}]  |  Reply: ${stats.totalReplies}  Error: ${stats.totalErrors}`);
    log("INFO", "━".repeat(52));

    try {
      let reason;
      if (doPost) {
        reason = await runPostSession(account);
        lastPostAt = Date.now();
      } else if (doReply) {
        reason = await runReplySession(account);
        lastReplyAt = Date.now();
      } else {
        reason = await runCommentSession(account);
      }

      log("INFO", `Siklus #${stats.totalSessions} [${mode}] selesai → "${reason}"`);
      pushEvent("end_session", `Siklus #${stats.totalSessions} [${mode}] selesai: ${reason}`);
    } catch (err) {
      log("ERROR", `Siklus #${stats.totalSessions} [${mode}] error: ${err.message}`);
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = err.message;
      pushEvent("error", `Siklus #${stats.totalSessions}: ${err.message}`);
    }

    stats.status = "idle";

    // Cek apakah error terakhir adalah daily limit X (501).
    // Jika ya, tidur sampai midnight UTC berikutnya — limit X reset setiap hari.
    if (stats.lastErrorMsg && /daily limit/i.test(stats.lastErrorMsg)) {
      const now2   = new Date();
      const midnight = new Date(Date.UTC(now2.getUTCFullYear(), now2.getUTCMonth(), now2.getUTCDate() + 1));
      const msUntilMidnight = midnight.getTime() - Date.now();
      const hoursLeft = (msUntilMidnight / 3_600_000).toFixed(1);
      log("WARN", `Daily limit X tercapai — tidur ${hoursLeft} jam sampai midnight UTC (${midnight.toISOString()})`);
      pushEvent("warn", `Daily limit — resume otomatis dalam ${hoursLeft} jam (midnight UTC)`);
      stats.status = "idle";
      // Reset error msg agar setelah bangun tidak re-trigger
      stats.lastErrorMsg = `[menunggu reset daily limit — resume ${midnight.toUTCString()}]`;
      await sleep(msUntilMidnight + 5_000);  // +5s buffer setelah midnight
      log("INFO", "Midnight UTC tercapai — lanjut posting...");
      pushEvent("info", "Daily limit reset — lanjut posting");
      continue;
    }

    // Tunggu 5 menit sebelum siklus berikutnya
    await sleep(config.LOOP_DELAY_MS);
  }
}

main().catch((err) => {
  log("ERROR", "FATAL: " + err.message);
  process.exit(1);
});
