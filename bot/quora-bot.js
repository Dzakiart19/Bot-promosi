/**
 * bot/quora-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Quora Auto-Answer Bot
 *
 * Siklus (tiap 5 menit):
 *   search keyword → pilih pertanyaan yang belum dijawab → post jawaban promo
 *
 * Auth: cookie-based — set QUORA_COOKIES dari browser DevTools:
 *   DevTools → Application → Cookies → quora.com → copy semua sebagai string
 *   Format: "m-b=xxx; m-b_lax=yyy; ..."
 *
 * Formkey di-extract otomatis dari HTML quora.com, di-refresh tiap 30 menit.
 *
 * Quora dilindungi Cloudflare — cookie valid dari browser aktif adalah
 * satu-satunya cara akses API tanpa Playwright. Cookie biasanya bertahan
 * beberapa hari sampai beberapa minggu tergantung sesi browser.
 *
 *   PORT=3012 node bot/quora-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { startServer }                    = require("../lib/core/server");
const { log, sleep, C }                  = require("../lib/core/logger");
const { stats, pushEvent }               = require("../lib/core/stats");
const { config, getFormkey,
        runAnswerSession }               = require("../lib/platforms/quora");
const { log: sentLogStore }             = require("../lib/platforms/quora/sent-log");

// ── Start web server ──────────────────────────────────────────────────────────
startServer("Quora Bot");

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`${C.bold}${C.red}`);
console.log("   ██████╗ ██╗   ██╗ ██████╗ ██████╗  █████╗ ");
console.log("  ██╔═══██╗██║   ██║██╔═══██╗██╔══██╗██╔══██╗");
console.log("  ██║   ██║██║   ██║██║   ██║██████╔╝███████║");
console.log("  ██║▄▄ ██║██║   ██║██║   ██║██╔══██╗██╔══██║");
console.log("  ╚██████╔╝╚██████╔╝╚██████╔╝██║  ██║██║  ██║");
console.log("   ╚══▀▀═╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝");
console.log(`${C.reset}${C.red}  Platform : quora.com (auto-answer)${C.reset}`);
console.log();

// ── Main loop ─────────────────────────────────────────────────────────────────
async function main() {
  // Expose sent log ke /api/stats
  Object.defineProperty(stats, "sentLog", {
    get: () => sentLogStore,
    enumerable: true,
    configurable: true,
  });

  // ── Tunggu cookie tersedia ─────────────────────────────────────────────────
  while (!process.env.QUORA_COOKIES) {
    log("WARN", "QUORA_COOKIES belum diset di Secrets.");
    log("INFO", "DevTools → Application → Cookies → quora.com → copy semua → paste ke QUORA_COOKIES");
    stats.status       = "waiting-cookie";
    stats.lastErrorMsg = "QUORA_COOKIES belum diset";
    await sleep(60_000);
  }

  const cookies = process.env.QUORA_COOKIES;

  // ── Extract formkey ────────────────────────────────────────────────────────
  log("INFO", "Fetching quora.com untuk extract formkey...");
  let formkey;
  let lastFormkeyRefreshAt = 0;

  while (!formkey) {
    try {
      formkey = await getFormkey(cookies);
      lastFormkeyRefreshAt = Date.now();
      log("SUCCESS", "Formkey ditemukan — bot mulai.");
      stats.status = "idle";
    } catch (err) {
      log("ERROR", `Gagal dapat formkey: ${err.message}`);
      log("WARN",  "Pastikan QUORA_COOKIES valid dan belum expired. Retry dalam 60 detik...");
      stats.status       = "waiting-cookie";
      stats.lastErrorMsg = err.message;
      stats.lastErrorAt  = Date.now();
      await sleep(60_000);
    }
  }

  // ── Main loop ──────────────────────────────────────────────────────────────
  while (true) {
    // Refresh formkey secara berkala
    if (Date.now() - lastFormkeyRefreshAt >= config.FORMKEY_REFRESH_MS) {
      try {
        formkey = await getFormkey(cookies);
        lastFormkeyRefreshAt = Date.now();
        log("INFO", "[Quora] Formkey di-refresh ✓");
      } catch (err) {
        log("WARN", `[Quora] Gagal refresh formkey: ${err.message} — lanjut pakai lama`);
      }
    }

    stats.totalSessions++;
    stats.currentSession = stats.totalSessions;

    log("INFO", "━".repeat(56));
    log("INFO", `  SIKLUS #${stats.totalSessions}  [ANSWER]  |  Sent: ${stats.totalMsgSent}  Error: ${stats.totalErrors}`);
    log("INFO", "━".repeat(56));

    try {
      const reason = await runAnswerSession({ cookies, formkey });
      log("INFO", `Siklus #${stats.totalSessions} selesai → "${reason}"`);
      pushEvent("end_session", `Siklus #${stats.totalSessions}: ${reason}`);

      // Kalau jawaban terkirim atau tidak ada target, delay normal
      // Kalau error → mungkin cookie expired, delay lebih lama
      if (/cookie|403|expired|login/i.test(stats.lastErrorMsg || "")) {
        log("WARN", "Kemungkinan cookie expired — tunggu 10 menit sebelum retry...");
        stats.status = "waiting-cookie";
        await sleep(10 * 60_000);
        continue;
      }

    } catch (err) {
      log("ERROR", `Siklus #${stats.totalSessions} fatal error: ${err.message}`);
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = err.message;
      pushEvent("error", `Siklus #${stats.totalSessions}: ${err.message}`);
    }

    stats.status = "idle";
    log("INFO", `Tunggu ${config.LOOP_DELAY_MS / 60000} menit sebelum siklus berikutnya...`);
    await sleep(config.LOOP_DELAY_MS);
  }
}

main().catch((err) => {
  log("ERROR", "FATAL: " + err.message);
  process.exit(1);
});
