/**
 * bot/threads-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry point bot Threads (threads.com). Siklus: verify cookie → search thread
 * → comment promo → sleep. Auto-post thread mandiri setiap 1 jam.
 * Tidak ada socket/match — sama seperti X Bot dan GETTR Bot.
 *
 * Diperlukan:
 *   THREADS_COOKIES = "sessionid=<val>; csrftoken=<val>"
 *
 * Cara dapat cookie:
 *   1. Buka threads.com di browser → login
 *   2. DevTools → Application → Cookies → threads.com
 *   3. Copy 'sessionid' dan 'csrftoken'
 *   4. Set THREADS_COOKIES = "sessionid=X; csrftoken=Y" di Secrets
 *
 *   PORT=3010 node bot/threads-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { startServer }                       = require("../lib/core/server");
const { log, sleep, C }                     = require("../lib/core/logger");
const { stats, pushEvent }                  = require("../lib/core/stats");
const { config, createGuest, runCommentSession, runPostSession } = require("../lib/platforms/threads");
const { log: sentLogStore }                 = require("../lib/platforms/threads/sent-log");

// ── Start web server (monitoring + health + api/stats) ────────────────────────
startServer("Threads Bot");

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`${C.bold}${C.magenta}`);
console.log("  ████████╗██╗  ██╗██████╗ ███████╗ █████╗ ██████╗ ███████╗");
console.log("     ██║   ██║  ██║██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝");
console.log("     ██║   ███████║██████╔╝█████╗  ███████║██║  ██║███████╗");
console.log("     ██║   ██╔══██║██╔══██╗██╔══╝  ██╔══██║██║  ██║╚════██║");
console.log("     ██║   ██║  ██║██║  ██║███████╗██║  ██║██████╔╝███████║");
console.log("     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝");
console.log(`${C.reset}${C.cyan}  Platform : threads.com (auto-comment)${C.reset}`);
console.log();

// ── Main loop ─────────────────────────────────────────────────────────────────
async function main() {
  let account;

  // Tunggu hingga THREADS_COOKIES tersedia dan valid (retry tiap 60 detik)
  while (!account) {
    try {
      log("BOT", "Verifikasi cookie session Threads (sessionid/csrftoken)...");
      account = await createGuest();
      log("SUCCESS", `Login OK sebagai ${account.displayName} (userId: ${account.userId})`);
    } catch (err) {
      if (!process.env.THREADS_COOKIES) {
        log("WARN", "THREADS_COOKIES belum diset — set Secrets lalu bot otomatis jalan. Cek ulang tiap 60 detik...");
      } else {
        log("ERROR", `Cookie Threads tidak valid — ${err.message}. Retry dalam 60 detik...`);
      }
      stats.status       = "waiting-cookie";
      stats.lastErrorMsg = err.message;
      stats.lastErrorAt  = Date.now();
      pushEvent("warn", `Cookie belum valid: ${err.message}`);
      await sleep(60_000);
    }
  }

  // Expose sent log ke /api/stats supaya dashboard bisa render tabel riwayat
  Object.defineProperty(stats, "sentLog", {
    get:          () => sentLogStore,
    enumerable:   true,
    configurable: true,
  });

  // Init timer: keduanya "sudah waktunya" supaya siklus pertama langsung POST + COMMENT
  let lastPostAt    = Date.now() - config.POST_INTERVAL_MS;
  let lastCommentAt = Date.now() - config.COMMENT_INTERVAL_MS;

  while (true) {
    const now       = Date.now();
    const doPost    = (now - lastPostAt    >= config.POST_INTERVAL_MS);
    const doComment = (now - lastCommentAt >= config.COMMENT_INTERVAL_MS);

    if (!doPost && !doComment) {
      const nextPost    = config.POST_INTERVAL_MS    - (now - lastPostAt);
      const nextComment = config.COMMENT_INTERVAL_MS - (now - lastCommentAt);
      const waitMs      = Math.min(nextPost, nextComment, config.LOOP_DELAY_MS);
      stats.status = "idle";
      log("INFO", `Idle — comment dalam ${Math.ceil(nextComment / 60000)}m, post dalam ${Math.ceil(nextPost / 60000)}m`);
      await sleep(waitMs);
      continue;
    }

    // Prioritas: POST > COMMENT
    const mode = doPost ? "POST" : "COMMENT";

    stats.totalSessions++;
    stats.currentSession = stats.totalSessions;

    log("INFO", "━".repeat(56));
    log("INFO", `  SIKLUS #${stats.totalSessions}  [${mode}]  |  Sent: ${stats.totalMsgSent}  Error: ${stats.totalErrors}`);
    log("INFO", "━".repeat(56));

    try {
      let reason;

      if (doPost) {
        reason     = await runPostSession(account);
        lastPostAt = Date.now();
      } else {
        reason        = await runCommentSession(account);
        lastCommentAt = Date.now();
      }

      log("INFO", `Siklus #${stats.totalSessions} [${mode}] selesai → "${reason}"`);
      pushEvent("end_session", `Siklus #${stats.totalSessions} [${mode}]: ${reason}`);

      // Kalau session expired → re-auth
      if (/expired|invalid|sessionid|cookie/i.test(reason)) {
        log("WARN", "[Threads] Session kemungkinan expired — re-verify dalam 30 detik...");
        pushEvent("warn", "Session expired — re-verify...");
        stats.status = "idle";
        await sleep(30_000);
        try {
          account = await createGuest();
          log("SUCCESS", "Re-verify Threads berhasil");
          pushEvent("info", "Re-verify Threads berhasil");
        } catch (e) {
          log("ERROR", `Re-verify gagal: ${e.message} — THREADS_COOKIES mungkin perlu diperbarui`);
          stats.lastErrorMsg = e.message;
        }
      }
    } catch (err) {
      log("ERROR", `Siklus #${stats.totalSessions} [${mode}] error: ${err.message}`);
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = err.message;
      pushEvent("error", `Siklus #${stats.totalSessions}: ${err.message}`);

      // Jika session expired → re-auth otomatis
      if (/expired|invalid|sessionid|HTML bukan JSON/i.test(err.message)) {
        log("WARN", "[Threads] Token/session expired — re-verify...");
        try {
          account = await createGuest();
          log("SUCCESS", "Re-verify berhasil");
        } catch (e) {
          log("ERROR", `Re-verify gagal: ${e.message}`);
        }
      }
    }

    // Cek segera (mungkin mode lain masih giliran)
    await sleep(1_000);
  }
}

main().catch((err) => {
  log("ERROR", "FATAL: " + err.message);
  process.exit(1);
});
