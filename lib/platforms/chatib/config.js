/**
 * lib/platforms/chatib/config.js
 * Semua konstanta spesifik platform Chatib (app.chatib.chat).
 *
 * Reverse-engineered dari:
 *   - https://chatib.chat/               → landing page, form login inline JS
 *   - https://app.chatib.chat/enter      → login "anonim" (username+gender+age+country, tanpa email)
 *   - https://app.chatib.chat/app/       → SPA, bundle /public/dist/js/{socket,app,attachments}.min.js
 *
 * Catatan arsitektur PENTING (beda dari platform lain di project ini):
 * Chatib BUKAN sistem random-match 1-on-1. Setelah connect socket, server
 * broadcast daftar SEMUA user yang sedang online lewat event "existing_users"
 * dan "new_user" (lobby publik) — siapapun bisa emit "send_message" langsung
 * ke user_id siapapun yang online, tanpa proses match/persetujuan dulu.
 * Jadi bot ini memilih SATU target acak dari daftar online lalu menyapa
 * duluan, bukan menunggu di-pasangkan oleh server.
 */

"use strict";

module.exports = {
  // ── Endpoints ──────────────────────────────────────────────────────────────
  APP_ORIGIN:    "https://app.chatib.chat",
  ENTER_PATH:    "/enter",              // GET ?handle=&gender=&age=&country= → set cookie jwt+session, redirect ke /app/
  WS_SERVER:     "https://app.chatib.chat",
  SOCKET_PATH:   "/socket.io/",

  // ── Browser headers ──────────────────────────────────────────────────────────
  ORIGIN:        "https://app.chatib.chat",
  REFERER:       "https://chatib.chat/",
  USER_AGENT:    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",

  // ── Data login "anonim" (bebas isi, tidak diverifikasi — tanpa email) ───────
  GENDER_POOL:   ["male", "female"],
  AGE_MIN:       21,
  AGE_MAX:       40,
  COUNTRY:       "US",

  // ── Pesan yang dikirim bot ──────────────────────────────────────────────────
  // URL disamarkan (koma, bukan titik) agar lolos filter link Chatib.
  // Array variasi sapa — satu dipilih acak tiap sesi agar tidak terlihat spam.
  MESSAGE_GREETS: [
    "Seeking discreet adult content? Vidorey offers a vast collection of free XXX videos and porn movies, updated daily. Stream instantly, no registration needed. Your private pleasure awaits: vidorey,web,app (ketik di browser pakai titik)",
    "Hey 👀 Want free XXX videos with zero sign-up? Vidorey streams thousands of hot adult movies updated every day — total privacy, zero cost: vidorey,web,app (ketik di browser pakai titik)",
    "Why pay for adult content? Vidorey is 100% free — hot XXX videos updated daily, instant streaming, no account needed 🔞 vidorey,web,app (ketik di browser pakai titik)",
    "Looking for free porn that actually delivers? Vidorey has thousands of explicit HD videos updated every day. No registration: vidorey,web,app (ketik di browser pakai titik)",
    "💋 Your secret guilty pleasure is one click away — Vidorey streams free adult videos daily, zero registration, total privacy: vidorey,web,app (ketik di browser pakai titik)",
    "Bored? Vidorey has the hottest free XXX content streaming right now 🔥 Thousands of videos, updated daily, no login needed: vidorey,web,app (ketik di browser pakai titik)",
    "💦 Free adult content, HD quality, daily updates — no account required. Best-kept secret online 😈 vidorey,web,app (ketik di browser pakai titik)",
    "Adult videos updated every single day, 100% free, no registration. Your private pleasure destination 🍑 vidorey,web,app (ketik di browser pakai titik)",
    "Want to watch free XXX movies right now? Thousands of scenes ready to stream — no sign-up, no fees 🥵 vidorey,web,app (ketik di browser pakai titik)",
    "😏 The hottest free adult site you didn't know about — daily updates, zero cost, instant streaming: vidorey,web,app (ketik di browser pakai titik)",
  ],
  MESSAGE_GOODBYE: "have fun",

  // ── Timing (ms) ────────────────────────────────────────────────────────────
  DELAY_SEND_MS:    600,    // jeda sebelum kirim sapa setelah target dipilih
  DELAY_GOODBYE_MS: 500,    // jeda sebelum kirim pamit setelah dapat balasan
  DELAY_END_MS:     1200,   // jeda setelah kirim pamit sebelum end chat
  WAIT_USERS_MS:    20000,  // timeout tunggu ada user lain online (existing_users/new_user)
  WAIT_REPLY_MS:    30000,  // timeout tunggu balasan dari target
  LOOP_DELAY_MS:    1500,   // jeda antar sesi

  // ── Socket.io options ──────────────────────────────────────────────────────
  SOCKET_TIMEOUT_MS:   20000,
  SEND_TIMEOUT_MS:     5000,
};
