/**
 * lib/platforms/yapping/config.js
 * Semua konstanta spesifik platform Yapping (yapping.me/chat).
 * Edit file ini saja ketika URL, pesan, atau timing berubah.
 *
 * Hasil recon: app SvelteKit, socket.io di origin yang sama (yapping.me),
 * default namespace "/", default path "/socket.io/". Auth berbasis cookie
 * JWT (token, userd, device_token) yang di-set otomatis oleh server saat
 * GET /chat pertama kali — tidak ada endpoint register/login terpisah.
 * Gender wajib diset lewat REST sebelum join_match_queue, kalau tidak
 * server balas error "GENDER_REQUIRED".
 */

"use strict";

module.exports = {
  // ── Endpoints ──────────────────────────────────────────────────────────────
  BASE_URL:        "https://yapping.me",
  CHAT_PAGE_PATH:  "/chat",
  GENDER_API_PATH: "/api/user/gender",
  SOCKET_PATH:     "/socket.io/",   // namespace default "/" — tidak perlu sub-path

  // ── Browser headers (wajib agar server tidak reject) ───────────────────────
  ORIGIN:      "https://yapping.me",
  REFERER:     "https://yapping.me/chat",
  USER_AGENT:  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",

  // ── Preferensi sesi chat ─────────────────────────────────────────────────────
  MY_GENDER:      "male",   // gender diri sendiri — wajib diisi sebelum matching
  WANT_GENDER:    "both",   // filter gender partner — "both" = semua
  INTERESTS:      [],
  IS_PAID_USER:   0,

  // ── Pesan yang dikirim bot ──────────────────────────────────────────────────
  // Array variasi sapa — satu dipilih acak tiap sesi agar tidak terlihat spam.
  MESSAGE_GREETS: [
    "Seeking discreet adult content? Vidorey offers a vast collection of free XXX videos and porn movies, updated daily. Stream instantly, no registration needed. Your private pleasure awaits: https://vidorey.web.app",
    "Hey 👀 Want free XXX videos with zero sign-up? Vidorey streams thousands of hot adult movies updated every day — total privacy, zero cost: https://vidorey.web.app",
    "Why pay for adult content? Vidorey is 100% free — hot XXX videos updated daily, instant streaming, no account needed 🔞 https://vidorey.web.app",
    "Looking for free porn that actually delivers? Vidorey has thousands of explicit HD videos updated every day. No registration required: https://vidorey.web.app",
    "💋 Your secret guilty pleasure is one click away — Vidorey streams free adult videos daily, zero registration, total privacy: https://vidorey.web.app",
    "Bored? Vidorey has the hottest free XXX content streaming right now 🔥 Thousands of videos, updated daily, no login needed: https://vidorey.web.app",
    "💦 Free adult content, HD quality, daily updates — no account required. Vidorey is the best-kept secret online 😈 https://vidorey.web.app",
    "Adult videos updated every single day, 100% free, no registration. Vidorey — your private pleasure destination 🍑 https://vidorey.web.app",
    "Want to watch free XXX movies right now? Vidorey has thousands of scenes ready to stream — no sign-up, no fees 🥵 https://vidorey.web.app",
    "😏 The hottest free adult site you didn't know about — Vidorey. Daily updates, zero cost, instant streaming: https://vidorey.web.app",
  ],
  // Yapping menolak link mentah di free plan (server balas error "LINK_NOT_ALLOWED").
  // Versi ini tanpa "https://" dan titik domain dipisah spasi agar lolos filter link,
  // dipakai sebagai fallback otomatis kalau MESSAGE_GREETS ditolak server.
  MESSAGE_GREETS_SAFE: [
    "Seeking discreet adult content? Vidorey offers a vast collection of free XXX videos and porn movies, updated daily. Stream instantly, no registration needed. Your private pleasure awaits: vidorey . web . app",
    "Hey 👀 Want free XXX videos with zero sign-up? Vidorey streams thousands of hot adult movies updated every day — total privacy, zero cost: vidorey . web . app",
    "Why pay for adult content? Vidorey is 100% free — hot XXX videos updated daily, instant streaming, no account needed 🔞 vidorey . web . app",
    "Looking for free porn that actually delivers? Vidorey has thousands of explicit HD videos updated every day. No registration: vidorey . web . app",
    "💋 Your secret guilty pleasure is one click away — Vidorey streams free adult videos daily, zero registration, total privacy: vidorey . web . app",
    "Bored? Vidorey has the hottest free XXX content streaming right now 🔥 Thousands of videos, updated daily, no login needed: vidorey . web . app",
    "💦 Free adult content, HD quality, daily updates — no account required. Best-kept secret online 😈 vidorey . web . app",
    "Adult videos updated every single day, 100% free, no registration. Your private pleasure destination 🍑 vidorey . web . app",
    "Want to watch free XXX movies right now? Thousands of scenes ready to stream — no sign-up, no fees 🥵 vidorey . web . app",
    "😏 The hottest free adult site you didn't know about — daily updates, zero cost, instant streaming: vidorey . web . app",
  ],
  MESSAGE_GOODBYE: "have fun",

  // ── Timing (ms) ────────────────────────────────────────────────────────────
  DELAY_JOIN_QUEUE_MS: 500,   // jeda setelah identify_user sebelum join_match_queue
  DELAY_SEND_MS:       800,   // jeda sebelum kirim pesan pertama setelah match
  DELAY_GOODBYE_MS:    500,   // jeda sebelum kirim pamit setelah dapat balasan
  DELAY_END_MS:        1200,  // jeda setelah kirim pamit sebelum tutup koneksi
  WAIT_MATCH_MS:       45000, // timeout tunggu match
  WAIT_REPLY_MS:       30000, // timeout tunggu balasan
  LOOP_DELAY_MS:       1500,  // jeda antar sesi

  // ── Socket.io options ──────────────────────────────────────────────────────
  SOCKET_TRANSPORTS: ["websocket", "polling"],
  SOCKET_TIMEOUT_MS: 20000,
  SEND_TIMEOUT_MS:   5000,
};
