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
    "🔥 No account. No credit card. Just pure free XXX content, every single day. Vidorey is waiting: https://vidorey.web.app",
    "Tired of ads blocking your fun? Vidorey gives you clean, direct access to thousands of adult videos — free forever 🎬 https://vidorey.web.app",
    "🤫 Private browsing? You'll love Vidorey — free XXX movies, no login, no trace. Your secret is safe 😈 https://vidorey.web.app",
    "Just discovered Vidorey and wow 😍 free adult content, HD quality, updated daily — no sign-up at all: https://vidorey.web.app",
    "💥 Unlimited free porn, zero registration, daily updates. Vidorey is the adult site you need right now 🔞 https://vidorey.web.app",
    "⚡ Instant access to thousands of explicit HD videos — Vidorey loads fast, streams smooth, costs nothing: https://vidorey.web.app",
    "Hot. Free. Private. Vidorey is the go-to site for adult content without the BS 🥵 https://vidorey.web.app",
    "🎯 Looking for variety? Vidorey has every category of adult content imaginable — all free, all HD, updated daily: https://vidorey.web.app",
    "😋 Your next guilty pleasure is literally free — Vidorey streams XXX videos on demand, no account needed: https://vidorey.web.app",
    "🌙 Late night cravings? Vidorey has thousands of free adult videos ready to stream right now, no registration: https://vidorey.web.app",
    "Skip the paywall, skip the ads, skip the sign-up. Vidorey gives you free adult content instantly 🔥 https://vidorey.web.app",
    "💎 Premium-quality adult videos, zero cost. Vidorey streams the hottest XXX content daily — try it now: https://vidorey.web.app",
    "🚀 New videos every single day, free access forever, no login required. Vidorey is that site 😏 https://vidorey.web.app",
    "Ever wanted an adult platform that just works — no pop-ups, no fees, no account? That's Vidorey 🔞 https://vidorey.web.app",
    "🍒 Thousands of free XXX scenes from every category. Vidorey never asks for a credit card or login: https://vidorey.web.app",
    "Why risk sketchy sites when Vidorey delivers safe, free, high-quality adult content daily? 💋 https://vidorey.web.app",
    "🔓 Unlock unlimited free adult content right now — Vidorey streams HD XXX videos with zero registration: https://vidorey.web.app",
    "New to free adult sites? Start with the best — Vidorey. Hot videos, daily updates, no account needed 😈 https://vidorey.web.app",
    "💣 Forget OnlyFans. Vidorey streams thousands of free XXX videos every day — no subscriptions, no fees: https://vidorey.web.app",
    "🎬 Action packed adult content, 100% free, updated every day. Vidorey — the better choice 🥵 https://vidorey.web.app",
    "Psst... Vidorey has the best free adult videos online and nobody talks about it enough 😍 https://vidorey.web.app",
    "🌶️ Spice up your night with free HD adult content from Vidorey — instant stream, no login: https://vidorey.web.app",
    "No more buffering, no more paywalls. Vidorey streams free XXX videos in HD, instantly 🔥 https://vidorey.web.app",
    "🥂 Treat yourself to free, unlimited adult content tonight. Vidorey never charges a cent: https://vidorey.web.app",
    "😩 Can't sleep? Vidorey has thousands of free adult videos ready to stream — no sign-up, zero fees 🔞 https://vidorey.web.app",
    "Fresh adult content added daily on Vidorey — totally free, completely private, no account required 💦 https://vidorey.web.app",
    "🏆 Best free adult streaming site? Vidorey. No contest. Try it yourself: https://vidorey.web.app",
    "One link, zero sign-up, unlimited free XXX content. Vidorey makes it that simple 😏 https://vidorey.web.app",
    "🌟 Vidorey has the freshest free adult videos on the internet — updated every day, no registration ever: https://vidorey.web.app",
    "Quick question: when was the last time you found free HD adult videos with NO registration? Vidorey: https://vidorey.web.app",
    "🎁 Free gift for you — unlimited adult content at Vidorey. No strings attached, no sign-up needed 💋 https://vidorey.web.app",
    "The adult site that actually respects your privacy. Vidorey: free, fast, no account needed 🔒 https://vidorey.web.app",
    "👁️ HD adult videos streaming instantly for free — Vidorey is open 24/7, no registration required: https://vidorey.web.app",
    "🌊 Drown in free adult content — Vidorey updates thousands of XXX videos every single day: https://vidorey.web.app",
    "If you love free adult content without the hassle, Vidorey is your answer 🥵 https://vidorey.web.app",
    "💫 Zero fees. Zero sign-up. Just pure adult entertainment. Vidorey has it all: https://vidorey.web.app",
    "🔑 The secret to free unlimited adult content? Vidorey — daily updates, HD quality, no login: https://vidorey.web.app",
    "Adult content so good it should be paid — but Vidorey keeps it 100% free forever 😈 https://vidorey.web.app",
    "📱 Works on any device, streams in HD, costs nothing. Vidorey is your new adult content home 🔞 https://vidorey.web.app",
    "🌍 Join millions enjoying free adult content on Vidorey — no registration, updated daily: https://vidorey.web.app",
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
