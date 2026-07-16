/**
 * lib/platforms/silly/config.js
 * Semua konstanta spesifik platform SillyChat (silly.chat/text-chat).
 *
 * Hasil recon: Next.js + Cloudflare. Menggunakan native WebSocket (bukan socket.io).
 * Auth: POST /api/auth/guest-token → { token, userId }
 * WS:   wss://silly.chat/ws?token=<token>
 * Protocol: JSON messages dengan field { feature, type, ... }
 * Feature text-chat selalu pakai feature="text".
 */

"use strict";

module.exports = {
  // ── Endpoints ──────────────────────────────────────────────────────────────
  BASE_URL:        "https://silly.chat",
  WS_URL:          "wss://silly.chat/ws",
  TOKEN_API_PATH:  "/api/auth/guest-token",

  // ── Browser headers ────────────────────────────────────────────────────────
  ORIGIN:     "https://silly.chat",
  REFERER:    "https://silly.chat/text-chat",
  USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",

  // ── Protocol ───────────────────────────────────────────────────────────────
  FEATURE:    "text",   // feature name untuk text-chat
  JOIN_MODE:  "global", // mode join queue

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
  DELAY_SEND_MS:    800,
  DELAY_GOODBYE_MS: 500,
  DELAY_END_MS:     1200,
  WAIT_MATCH_MS:    45000,
  WAIT_REPLY_MS:    30000,
  LOOP_DELAY_MS:    1500,

  // ── WebSocket options ──────────────────────────────────────────────────────
  WS_TIMEOUT_MS:  20000,
  SEND_TIMEOUT_MS: 5000,
};
