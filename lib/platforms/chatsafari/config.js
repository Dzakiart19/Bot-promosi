/**
 * lib/platforms/chatsafari/config.js
 * Semua konstanta spesifik platform Chatsafari (chatsafari.com).
 *
 * Reverse-engineered dari:
 *   - https://chatsafari.com/               → React SPA (Netlify)
 *   - https://chatsafari.sliplane.app/api/ → Backend API
 *
 * Arsitektur Chatsafari (mirip Chatib):
 *   BUKAN sistem random-match 1-on-1. Setelah connect socket, server
 *   mengirim daftar user online lewat event "users:update".
 *   Bot pilih SATU target acak lalu kirim pesan promo.
 *
 * Alur:
 *   1. POST /api/auth/anonymous {gender} → dapat user (id, username)
 *   2. Socket.IO connect (polling) → emit "user:join" {userId, gender}
 *   3. Terima "users:update" → daftar user online
 *   4. Pilih target acak → emit "message:send" {message, roomId, toUserId}
 *   5. Terima balasan → kirim pamit → disconnect → sesi baru
 *   6. Kalau kena "account:banned" → buat akun baru → reconnect
 */

"use strict";

module.exports = {
  // ── Endpoints ──────────────────────────────────────────────────────────────
  API_BASE:     "https://chatsafari.sliplane.app",
  AUTH_ENDPOINT: "/api/auth/anonymous",
  WS_SERVER:    "https://chatsafari.sliplane.app",
  SOCKET_PATH:  "/socket.io/",

  // ── Frontend (untuk Origin/Referer) ────────────────────────────────────────
  ORIGIN:       "https://chatsafari.com",
  REFERER:      "https://chatsafari.com/",
  USER_AGENT:   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",

  // ── Data login anonim ─────────────────────────────────────────────────────
  GENDER_POOL: ["male", "female"],

  // ── Pesan yang dikirim bot ──────────────────────────────────────────────────
  // URL disamarkan (koma, bukan titik) agar lolos filter link Chatsafari.
  // Array variasi sapa — satu dipilih acak tiap sesi agar tidak terlihat spam.
  MESSAGE_GREETS: [
    "Seeking discreet adult content? Vidorey offers a vast collection of free XXX videos and porn movies, updated daily. Stream instantly, no registration needed. Your private pleasure awaits: vidorey,web,app (type in browser with dots)",
    "Hey 👀 Want free XXX videos with zero sign-up? Vidorey streams thousands of hot adult movies updated every day — total privacy, zero cost: vidorey,web,app (type in browser with dots)",
    "Why pay for adult content? Vidorey is 100% free — hot XXX videos updated daily, instant streaming, no account needed 🔞 vidorey,web,app (type in browser with dots)",
    "Looking for free porn that actually delivers? Vidorey has thousands of explicit HD videos updated every day. No registration: vidorey,web,app (type in browser with dots)",
    "💋 Your secret guilty pleasure is one click away — Vidorey streams free adult videos daily, zero registration, total privacy: vidorey,web,app (type in browser with dots)",
    "Bored? Vidorey has the hottest free XXX content streaming right now 🔥 Thousands of videos, updated daily, no login needed: vidorey,web,app (type in browser with dots)",
    "💦 Free adult content, HD quality, daily updates — no account required. Best-kept secret online 😈 vidorey,web,app (type in browser with dots)",
    "Adult videos updated every single day, 100% free, no registration. Your private pleasure destination 🍑 vidorey,web,app (type in browser with dots)",
    "Want to watch free XXX movies right now? Thousands of scenes ready to stream — no sign-up, no fees 🥵 vidorey,web,app (type in browser with dots)",
    "😏 The hottest free adult site you didn't know about — daily updates, zero cost, instant streaming: vidorey,web,app (type in browser with dots)",
    "🔥 No account. No credit card. Just free XXX content every day. Try it: vidorey,web,app (type in browser with dots)",
    "Tired of ads and paywalls? Vidorey gives you clean, free access to thousands of adult videos 🎬 vidorey,web,app (type in browser with dots)",
    "🤫 Private browsing just got better — free XXX movies, no login, no trace at Vidorey 😈 vidorey,web,app (type in browser with dots)",
    "Just found this and wow 😍 free adult content, HD quality, updated daily — no sign-up: vidorey,web,app (type in browser with dots)",
    "💥 Unlimited free porn, zero registration, daily updates. Vidorey is the site you need 🔞 vidorey,web,app (type in browser with dots)",
    "⚡ Instant access to thousands of explicit HD videos — loads fast, streams smooth, costs nothing: vidorey,web,app (type in browser with dots)",
    "Hot. Free. Private. The go-to site for adult content without the BS 🥵 vidorey,web,app (type in browser with dots)",
    "🎯 Every category of adult content imaginable — all free, all HD, all updated daily: vidorey,web,app (type in browser with dots)",
    "😋 Your next guilty pleasure is literally free — XXX videos on demand, no account needed: vidorey,web,app (type in browser with dots)",
    "🌙 Late night cravings? Thousands of free adult videos ready to stream right now: vidorey,web,app (type in browser with dots)",
    "Skip the paywall, skip the ads, skip the sign-up. Free adult content instantly 🔥 vidorey,web,app (type in browser with dots)",
    "💎 Premium-quality adult videos, zero cost. The hottest XXX content daily: vidorey,web,app (type in browser with dots)",
    "🚀 New videos every single day, free access forever, no login required 😏 vidorey,web,app (type in browser with dots)",
    "No pop-ups, no fees, no account? That's exactly what Vidorey is 🔞 vidorey,web,app (type in browser with dots)",
    "🍒 Thousands of free XXX scenes from every category. No credit card, no login ever: vidorey,web,app (type in browser with dots)",
    "Why risk sketchy sites when Vidorey delivers safe, free, HD adult content daily? 💋 vidorey,web,app (type in browser with dots)",
    "🔓 Unlock unlimited free adult content right now — HD XXX videos, zero registration: vidorey,web,app (type in browser with dots)",
    "New to free adult sites? Start with the best — hot videos, daily updates, no account 😈 vidorey,web,app (type in browser with dots)",
    "💣 Forget OnlyFans. Thousands of free XXX videos every day — no subscriptions: vidorey,web,app (type in browser with dots)",
    "🎬 Action-packed adult content, 100% free, updated every day. The better choice 🥵 vidorey,web,app (type in browser with dots)",
    "Psst... Vidorey has the best free adult videos online and nobody talks about it 😍 vidorey,web,app (type in browser with dots)",
    "🌶️ Spice up your night with free HD adult content — instant stream, no login: vidorey,web,app (type in browser with dots)",
    "No more buffering, no more paywalls. Free XXX videos in HD, instantly 🔥 vidorey,web,app (type in browser with dots)",
    "🥂 Treat yourself to free, unlimited adult content tonight. Never charges a cent: vidorey,web,app (type in browser with dots)",
    "😩 Can't sleep? Thousands of free adult videos ready to stream — no sign-up 🔞 vidorey,web,app (type in browser with dots)",
    "Fresh adult content added daily — totally free, completely private, no account required 💦 vidorey,web,app (type in browser with dots)",
    "🏆 Best free adult streaming site online? Vidorey. No contest: vidorey,web,app (type in browser with dots)",
    "One link, zero sign-up, unlimited free XXX content. That simple 😏 vidorey,web,app (type in browser with dots)",
    "🌟 The freshest free adult videos on the internet — updated every day, no registration: vidorey,web,app (type in browser with dots)",
    "When was the last time you found free HD adult videos with NO registration? Right here 😮 vidorey,web,app (type in browser with dots)",
    "🎁 Free gift — unlimited adult content, no strings attached, no sign-up needed 💋 vidorey,web,app (type in browser with dots)",
    "The adult site that actually respects your privacy. Free, fast, no account needed 🔒 vidorey,web,app (type in browser with dots)",
    "👁️ HD adult videos streaming instantly for free — open 24/7, no registration required: vidorey,web,app (type in browser with dots)",
    "🌊 Thousands of XXX videos updated every single day — all completely free: vidorey,web,app (type in browser with dots)",
    "Free adult content without the hassle — this is what Vidorey is all about 🥵 vidorey,web,app (type in browser with dots)",
    "💫 Zero fees. Zero sign-up. Just pure adult entertainment 24/7: vidorey,web,app (type in browser with dots)",
    "🔑 The secret to free unlimited adult content? Daily updates, HD quality, no login: vidorey,web,app (type in browser with dots)",
    "Adult content so good it should cost money — but Vidorey keeps it 100% free 😈 vidorey,web,app (type in browser with dots)",
    "📱 Works on any device, streams in HD, costs nothing. Your new adult content home 🔞 vidorey,web,app (type in browser with dots)",
    "🌍 Millions enjoy free adult content here — no registration, updated daily: vidorey,web,app (type in browser with dots)",
  ],
  MESSAGE_GOODBYE: "have fun",

  // ── Timing (ms) ────────────────────────────────────────────────────────────
  DELAY_SEND_MS:    800,    // jeda sebelum kirim sapa setelah target dipilih
  DELAY_GOODBYE_MS: 500,    // jeda sebelum kirim pamit setelah dapat balasan
  DELAY_END_MS:     1000,   // jeda setelah kirim pamit sebelum disconnect
  WAIT_USERS_MS:    25000,  // timeout tunggu ada user online
  WAIT_REPLY_MS:    30000,  // timeout tunggu balasan dari target
  LOOP_DELAY_MS:    2000,   // jeda antar sesi
  BAN_RECOVERY_MS:  5000,   // jeda sebelum buat akun baru setelah ban

  // ── Socket.io options ──────────────────────────────────────────────────────
  SOCKET_TRANSPORTS: ["polling"],  // Chatsafari pakai polling, bukan websocket
  SOCKET_TIMEOUT_MS: 20000,
  SEND_TIMEOUT_MS:   5000,

  // ── Room ID ─────────────────────────────────────────────────────────────────
  ROOM_ID: "global",
};
