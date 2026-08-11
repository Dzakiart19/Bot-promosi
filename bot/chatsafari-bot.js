/**
 * bot/chatsafari-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry point utama — hanya berisi main loop.
 * Semua logika platform ada di lib/platforms/chatsafari/.
 * Semua shared infra ada di lib/core/.
 *
 * Alur per sesi:
 *   1. POST /api/auth/anonymous → buat akun baru
 *   2. Socket.IO connect (polling) → emit "user:join"
 *   3. Terima users:update → pilih target acak → kirim promo
 *   4. Terima balasan → kirim pamit → disconnect
 *   5. Kalau kena ban → buat akun baru → ulangi
 *
 * Jalankan di port terpisah dari bot lain:
 *   PORT=3010 node bot/chatsafari-bot.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const { startServer }              = require("../lib/core/server");
const { log, sleep, C }            = require("../lib/core/logger");
const { stats, pushEvent }         = require("../lib/core/stats");
const { config, createGuest, runSession } = require("../lib/platforms/chatsafari");

// ── Start web server (monitoring + health + api/stats) ────────────────────────
startServer("Chatsafari Bot");

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`${C.bold}${C.yellow}`);
console.log("  ██████╗ ███████╗ █████╗ ██╗  ██╗██╗  ██╗███████╗██╗     ██╗   ██╗ █████╗");
console.log("  ██╔══██╗██╔════╝██╔══██╗██║ ██╔╝██║  ██║██╔════╝██║     ██║   ██║██╔══██╗");
console.log("  ██████╔╝█████╗  ███████║█████╔╝ ███████║█████╗  ██║     ██║   ██║███████║");
console.log("  ██╔══██╗██╔══╝  ██╔══██║██╔═██╗ ██╔══██║██╔══╝  ██║     ██║   ██║██╔══██║");
console.log("  ██║  ██║███████╗██║  ██║██║  ██╗██║  ██║███████╗███████╗╚██████╔╝██║  ██║");
console.log("  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝");
console.log(`${C.reset}${C.cyan}  Platform : chatsafari.com${C.reset}`);
console.log();

// ── Main loop ─────────────────────────────────────────────────────────────────
async function main() {
  // Exponential backoff saat login gagal berturut-turut.
  const LOGIN_BACKOFF_MS = [1500, 10_000, 30_000, 60_000, 120_000, 300_000];
  let consecutiveLoginFails = 0;
  let consecutiveBans      = 0;

  while (true) {
    stats.totalSessions++;
    stats.currentSession = stats.totalSessions;

    log("INFO", "━".repeat(52));
    log("INFO", `  SESI #${stats.totalSessions}  |  Match: ${stats.totalMatches}  Reply: ${stats.totalReplies}  Error: ${stats.totalErrors}  Banned: ${stats.totalBlocked}`);
    log("INFO", "━".repeat(52));

    try {
      log("BOT", "Buat akun anonymous...");
      const guest = await createGuest();
      consecutiveLoginFails = 0;   // reset backoff setelah login berhasil
      log("SUCCESS", `Guest: ${guest.displayName}  (userId=${guest.userId}, gender=${guest.gender})`);
      pushEvent("new_session", `Sesi #${stats.totalSessions} — ${guest.displayName}`);

      const reason = await runSession(guest);
      log("INFO", `Sesi #${stats.totalSessions} selesai → "${reason}"`);
      pushEvent("end_session", `Sesi #${stats.totalSessions} selesai: ${reason}`);

      // ── Ban recovery ───────────────────────────────────────────────────────
      // Kalau kena ban, langsung buat akun baru di loop berikutnya.
      // Jeda singkat supaya tidak terlihat instant.
      if (reason === "account-banned" || reason === "banned") {
        consecutiveBans++;
        const banDelay = Math.min(config.BAN_RECOVERY_MS * consecutiveBans, 60_000);
        log("WARN", `Akun diban (${consecutiveBans}x berturut) — jeda ${banDelay / 1000}s lalu buat akun baru...`);
        pushEvent("warn", `Ban recovery — jeda ${banDelay / 1000}s`);
        stats.status = "idle";
        await sleep(banDelay);
        continue;
      }

      // Reset ban counter kalau sesi selesai normal
      if (consecutiveBans > 0 && reason !== "account-banned" && reason !== "banned") {
        consecutiveBans = 0;
      }

    } catch (err) {
      log("ERROR", `Sesi #${stats.totalSessions} error: ${err.message}`);
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = err.message;
      pushEvent("error", `Sesi #${stats.totalSessions}: ${err.message}`);

      // Login gagal → kemungkinan IP rate-limited.
      // Terapkan exponential backoff.
      if (
        err.message.includes("user.id tidak ada") ||
        err.message.includes("Auth gagal") ||
        err.message.includes("HTTP 4") ||
        err.message.includes("HTTP 5")
      ) {
        consecutiveLoginFails++;
        const backoffMs = LOGIN_BACKOFF_MS[
          Math.min(consecutiveLoginFails - 1, LOGIN_BACKOFF_MS.length - 1)
        ];
        const backoffSec = Math.round(backoffMs / 1000);
        log("WARN", `Login gagal ${consecutiveLoginFails}x berturut-turut — backoff ${backoffSec}s...`);
        pushEvent("warn", `Backoff ${backoffSec}s (login gagal ${consecutiveLoginFails}x)`);
        stats.status = "idle";
        await sleep(backoffMs);
        continue;
      }
    }

    stats.status = "idle";
    await sleep(config.LOOP_DELAY_MS);
  }
}

main().catch((err) => {
  log("ERROR", "FATAL: " + err.message);
  process.exit(1);
});
