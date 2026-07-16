/**
 * lib/platforms/duckchat/config.js
 * Semua konstanta spesifik platform DuckChat.
 * Edit file ini saja ketika URL, pesan, atau timing berubah.
 *
 * Reverse-engineered dari:
 *   /_next/static/chunks/2096-9e9c67339538de56.js  (socket connect + event map)
 *   /_next/static/chunks/app/(internal)/findduck/page-61269f8b17b0bed5.js  (find_chat flow)
 */

"use strict";

module.exports = {
  // ── Endpoints ──────────────────────────────────────────────────────────────
  WS_SERVER:   "https://wsws.duckchat.club",
  SOCKET_PATH: "/socket.io/",
  API_BASE:    "https://api.duckchat.club",

  // ── Browser headers (wajib agar server tidak reject) ───────────────────────
  ORIGIN:    "https://duckchat.club",
  REFERER:   "https://duckchat.club/lake",
  USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",

  // ── Auth (hardcoded di frontend DuckChat) ──────────────────────────────────
  // Nilai literal "authTokenFromClient" memang begitu adanya di source mereka
  SOCKET_AUTH_TOKEN: "authTokenFromClient",

  // ── Enkripsi pesan (AES-256-CTR, key hardcoded di frontend) ───────────────
  ENCRYPT_KEY: "secret_key",

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
  MESSAGE_GOODBYE: "have fun",

  // ── Timing (ms) ────────────────────────────────────────────────────────────
  DELAY_SEND_MS:    600,   // jeda sebelum kirim sapa setelah match
  DELAY_GOODBYE_MS: 500,   // jeda sebelum kirim pamit setelah dapat balasan
  DELAY_END_MS:     1200,  // jeda setelah pamit sebelum finish
  WAIT_MATCH_MS:    45000, // timeout tunggu match
  WAIT_REPLY_MS:    30000, // timeout tunggu balasan
  LOOP_DELAY_MS:    1500,  // jeda antar sesi

  // ── Socket.io options ──────────────────────────────────────────────────────
  SOCKET_TIMEOUT_MS: 20000,
  SEND_TIMEOUT_MS:   5000,
};
