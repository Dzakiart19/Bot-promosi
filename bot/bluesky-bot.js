/**
 * bot/bluesky-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Bluesky Auto-Promo Bot (AT Protocol)
 *
 * Siklus — sama dengan X Bot / GETTR Bot:
 *   REPLY: search keyword → reply promo ke post relevan  (1x/jam)
 *   POST : auto-post promo mandiri                       (1x/jam, offset 30 menit)
 *
 * Auth: BLUESKY_IDENTIFIER + BLUESKY_PASSWORD di Replit Secrets.
 * Rekomendasi: buat "App Password" di bsky.app → Settings → App Passwords
 * agar password akun utama tidak diekspos langsung.
 *
 * Token refresh otomatis tiap 90 menit (accessJwt Bluesky expired ~2 jam).
 *
 *   PORT=3011 node bot/bluesky-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { startServer }                       = require("../lib/core/server");
const { log, sleep, C }                     = require("../lib/core/logger");
const { stats, pushEvent }                  = require("../lib/core/stats");
const { config, login, refreshSession,
        runReplySession, runPostSession }   = require("../lib/platforms/bluesky");
const { log: sentLogStore }                = require("../lib/platforms/bluesky/sent-log");

// ── Start web server ──────────────────────────────────────────────────────────
startServer("Bluesky Bot");

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`${C.bold}${C.cyan}`);
console.log("  ██████╗ ██╗     ██╗   ██╗███████╗███████╗██╗  ██╗██╗   ██╗");
console.log("  ██╔══██╗██║     ██║   ██║██╔════╝██╔════╝██║ ██╔╝╚██╗ ██╔╝");
console.log("  ██████╔╝██║     ██║   ██║█████╗  ███████╗█████╔╝  ╚████╔╝ ");
console.log("  ██╔══██╗██║     ██║   ██║██╔══╝  ╚════██║██╔═██╗   ╚██╔╝  ");
console.log("  ██████╔╝███████╗╚██████╔╝███████╗███████║██║  ██╗   ██║   ");
console.log("  ╚═════╝ ╚══════╝ ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝   ╚═╝   ");
console.log(`${C.reset}${C.cyan}  Platform : bsky.app (AT Protocol — auto-reply + auto-post)${C.reset}`);
console.log();

// ── Main loop ─────────────────────────────────────────────────────────────────
async function main() {
  // Expose sent log ke /api/stats supaya dashboard bisa baca
  Object.defineProperty(stats, "sentLog", {
    get: () => sentLogStore,
    enumerable: true,
    configurable: true,
  });

  // ── Tunggu credentials tersedia ────────────────────────────────────────────
  while (!process.env.BLUESKY_IDENTIFIER || !process.env.BLUESKY_PASSWORD) {
    log("WARN", "BLUESKY_IDENTIFIER / BLUESKY_PASSWORD belum diset di Secrets.");
    log("INFO", "Set secrets lalu bot otomatis jalan. Cek ulang tiap 60 detik...");
    stats.status       = "waiting-config";
    stats.lastErrorMsg = "BLUESKY_IDENTIFIER atau BLUESKY_PASSWORD belum diset";
    await sleep(60_000);
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  let session;
  try {
    session = await login(
      process.env.BLUESKY_IDENTIFIER,
      process.env.BLUESKY_PASSWORD
    );
    stats.status = "idle";
  } catch (err) {
    log("ERROR", `FATAL: Login Bluesky gagal — ${err.message}`);
    stats.status       = "error";
    stats.lastErrorMsg = err.message;
    stats.lastErrorAt  = Date.now();
    process.exit(1);
  }

  // Init timer: POST offset 30 menit agar tidak bertabrakan dengan REPLY
  let lastReplyAt = Date.now() - config.REPLY_INTERVAL_MS;              // langsung jalan
  let lastPostAt  = Date.now() - config.POST_INTERVAL_MS + 30 * 60_000; // tunda 30 menit
  let lastTokenRefreshAt = Date.now();

  while (true) {
    const now = Date.now();

    // ── Refresh token tiap TOKEN_REFRESH_INTERVAL_MS ───────────────────────
    if (now - lastTokenRefreshAt >= config.TOKEN_REFRESH_INTERVAL_MS) {
      try {
        session = await refreshSession(session);
        lastTokenRefreshAt = Date.now();
      } catch (err) {
        log("WARN", `Token refresh gagal: ${err.message} — coba re-login...`);
        try {
          session = await login(
            process.env.BLUESKY_IDENTIFIER,
            process.env.BLUESKY_PASSWORD
          );
          lastTokenRefreshAt = Date.now();
          log("SUCCESS", "Re-login berhasil ✓");
        } catch (e) {
          log("ERROR", `Re-login gagal: ${e.message}`);
        }
      }
    }

    const doReply = (now - lastReplyAt >= config.REPLY_INTERVAL_MS);
    const doPost  = (now - lastPostAt  >= config.POST_INTERVAL_MS);

    if (!doReply && !doPost) {
      const nextReply = config.REPLY_INTERVAL_MS - (now - lastReplyAt);
      const nextPost  = config.POST_INTERVAL_MS  - (now - lastPostAt);
      const waitMs    = Math.min(nextReply, nextPost, config.LOOP_DELAY_MS);
      stats.status = "idle";
      log("INFO", `Idle — reply dalam ${Math.ceil(nextReply/60000)}m, post dalam ${Math.ceil(nextPost/60000)}m`);
      await sleep(waitMs);
      continue;
    }

    // Prioritas: POST > REPLY (mengikuti pola GETTR Bot)
    const mode = doPost ? "POST" : "REPLY";

    stats.totalSessions++;
    stats.currentSession = stats.totalSessions;

    log("INFO", "━".repeat(56));
    log("INFO", `  SIKLUS #${stats.totalSessions}  [${mode}]  |  Sent: ${stats.totalMsgSent}  Error: ${stats.totalErrors}`);
    log("INFO", "━".repeat(56));

    try {
      let reason;
      if (doPost) {
        reason     = await runPostSession(session);
        lastPostAt = Date.now();
      } else {
        reason      = await runReplySession(session);
        lastReplyAt = Date.now();
      }

      log("INFO", `Siklus #${stats.totalSessions} [${mode}] selesai → "${reason}"`);
      pushEvent("end_session", `Siklus #${stats.totalSessions} [${mode}]: ${reason}`);

    } catch (err) {
      log("ERROR", `Siklus #${stats.totalSessions} [${mode}] error: ${err.message}`);
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = err.message;
      pushEvent("error", `Siklus #${stats.totalSessions}: ${err.message}`);

      // Token expired — refresh / re-login
      if (err.status === 401 || /ExpiredToken|AuthMissing|InvalidToken/i.test(err.code || "")) {
        log("WARN", "[BSky] Token expired — refresh/re-login...");
        try {
          session = await refreshSession(session);
          lastTokenRefreshAt = Date.now();
          log("SUCCESS", "Token refresh OK");
        } catch {
          try {
            session = await login(
              process.env.BLUESKY_IDENTIFIER,
              process.env.BLUESKY_PASSWORD
            );
            lastTokenRefreshAt = Date.now();
            log("SUCCESS", "Re-login OK");
          } catch (e) {
            log("ERROR", `Re-login gagal: ${e.message}`);
          }
        }
      }
    }

    stats.status = "idle";
    await sleep(1_000);  // langsung cek mode lain tanpa delay panjang
  }
}

main().catch((err) => {
  log("ERROR", "FATAL: " + err.message);
  process.exit(1);
});
