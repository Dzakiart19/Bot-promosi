/**
 * lib/platforms/telegram/config.js
 * Konfigurasi bot Telegram — auto-chat di @botchatanonymous.
 *
 * Alur (dari recon screenshot):
 *   1. Kirim /search → bot balas "Sedang mencari obrolan..."
 *   2. Bot balas "Pasangan telah ditemukan! ..."
 *   3. Kirim pesan promo (acak dari MESSAGE_GREETS)
 *   4. Kirim /next → kembali ke langkah 2 (loop)
 */

"use strict";

module.exports = {
  // ── Target bot ───────────────────────────────────────────────────────────────
  TARGET_BOT: "botchatanonymouss_bot",   // tanpa @ untuk getEntity()

  // ── Commands ─────────────────────────────────────────────────────────────────
  CMD_SEARCH: "/search",
  CMD_NEXT:   "/next",
  CMD_STOP:   "/stop",

  // ── Deteksi pesan dari bot ────────────────────────────────────────────────────
  // Substring yang menandai pasangan ditemukan (case-insensitive)
  MATCH_SIGNALS: [
    "pasangan telah ditemukan",
    "partner has been found",
    "you are now connected",
    "stranger found",
    "chat partner found",
  ],

  // ── Pesan promo (acak tiap sesi) — Bahasa Indonesia karena target bot ID ──────
  MESSAGE_GREETS: [
    "free bokep update setiap hari 👀 https://vidorey.web.app",
    "nonton video dewasa gratis tanpa daftar 🔥 https://vidorey.web.app",
    "ribuan video xxx gratis update tiap hari, tanpa akun 😈 https://vidorey.web.app",
    "ga usah bayar buat nonton video panas 🥵 Vidorey gratis selamanya — https://vidorey.web.app",
    "bokep HD gratis tanpa login, update tiap hari 🔞 https://vidorey.web.app",
    "mau nonton video dewasa gratis? Vidorey ribuan konten update tiap hari, tanpa daftar 💦 https://vidorey.web.app",
    "konten 18+ terlengkap, 100% gratis, tanpa registrasi 🍑 https://vidorey.web.app",
    "video xxx baru tiap hari, langsung tonton tanpa akun 😏 https://vidorey.web.app",
    "Vidorey — bokep gratis kualitas HD, update tiap hari, tanpa sign-up 🔥 https://vidorey.web.app",
    "situs bokep terbaik yang belum kamu tau 👀 ribuan video gratis tanpa daftar — https://vidorey.web.app",
  ],

  // ── Timing (ms) ──────────────────────────────────────────────────────────────
  DELAY_SEND_MS:      3000,   // kirim promo langsung setelah match
  DELAY_NEXT_MS:   5000,   // jeda 5 detik setelah kirim promo sebelum /next (hindari rate limit bot)
  WAIT_MATCH_MS:   90000,  // timeout tunggu pasangan ditemukan
  LOOP_DELAY_MS:   500,    // jeda micro antar siklus loop

  // ── GramJS connection ─────────────────────────────────────────────────────────
  CONNECTION_RETRIES: 5,
};
