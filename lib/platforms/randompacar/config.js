/**
 * lib/platforms/randompacar/config.js
 * Konfigurasi bot Telegram ke-3 — auto-chat di @random_pacar_bot.
 *
 * Dari recon screenshot:
 *   - Match signal : "Pasangan telah ditemukan!"
 *   - Commands     : /search, /next, /stop
 *   - Bot PROMOTE  : "mimin bikin grup baru sini cari temen baru 👉 @caripacar_teman_jodoh" (diabaikan)
 *   - Alur         : /search → match → delay 3s → promo → delay 5s → /next → loop
 */

"use strict";

module.exports = {
  // ── Target bot ───────────────────────────────────────────────────────────────
  TARGET_BOT: "random_pacar_bot",   // tanpa @ untuk getEntity()

  // ── Commands ─────────────────────────────────────────────────────────────────
  CMD_SEARCH: "/search",
  CMD_NEXT:   "/next",
  CMD_STOP:   "/stop",

  // ── Deteksi pesan dari bot ────────────────────────────────────────────────────
  MATCH_SIGNALS: [
    "pasangan telah ditemukan",
    "partner has been found",
    "you are now connected",
    "stranger found",
    "chat partner found",
  ],

  // ── Pesan promo acak — target bot Indonesia, promo Vidorey + Dramain ─────────
  MESSAGE_GREETS: [
    "free bokep update setiap hari 👀 https://vidorey.web.app",
    "nonton bokep gratis tanpa daftar 🔥 https://vidorey.web.app",
    "ribuan video xxx gratis update tiap hari, tanpa akun 😈 https://vidorey.web.app",
    "ga usah bayar buat nonton video panas 🥵 Vidorey gratis selamanya — https://vidorey.web.app",
    "bokep HD gratis tanpa login, update tiap hari 🔞 https://vidorey.web.app",
    "mau nonton video dewasa gratis? Vidorey ribuan konten update tiap hari, tanpa daftar 💦 https://vidorey.web.app",
    "konten 18+ terlengkap, 100% gratis, tanpa registrasi 🍑 https://vidorey.web.app",
    "video xxx baru tiap hari, langsung tonton tanpa akun 😏 https://vidorey.web.app",
    "situs bokep terbaik yang belum kamu tau 👀 ribuan video gratis tanpa daftar — https://vidorey.web.app",
    "free bokep update setiap hari 👀 https://vidorey.web.app\nbisa juga ke https://dramain-aja.web.app yang suka drakor/dracin full episode gratis 🚀",
    "nonton bokep gratis setiap hari + drakor/dracin full episode 😍\n→ bokep: https://vidorey.web.app\n→ drama: https://dramain-aja.web.app",
    "2 situs terbaik gratis tanpa daftar 🔥\n🔞 bokep: https://vidorey.web.app\n🎬 drakor/dracin: https://dramain-aja.web.app",
  ],

  // ── Timing (ms) ──────────────────────────────────────────────────────────────
  DELAY_SEND_MS:   3000,   // delay 3 detik setelah match sebelum kirim promo
  DELAY_NEXT_MS:   5000,   // jeda 5 detik sebelum /next (hindari rate limit)
  WAIT_MATCH_MS:   90000,  // timeout tunggu pasangan
  LOOP_DELAY_MS:   500,    // jeda micro antar siklus loop

  // ── GramJS connection ─────────────────────────────────────────────────────────
  CONNECTION_RETRIES: 5,
};
