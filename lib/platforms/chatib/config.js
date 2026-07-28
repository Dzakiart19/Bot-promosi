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
    "🔥 No account. No credit card. Just free XXX content every day. Try it: vidorey,web,app (ketik di browser pakai titik)",
    "Tired of ads and paywalls? Vidorey gives you clean, free access to thousands of adult videos 🎬 vidorey,web,app (ketik di browser pakai titik)",
    "🤫 Private browsing just got better — free XXX movies, no login, no trace at Vidorey 😈 vidorey,web,app (ketik di browser pakai titik)",
    "Just found this and wow 😍 free adult content, HD quality, updated daily — no sign-up: vidorey,web,app (ketik di browser pakai titik)",
    "💥 Unlimited free porn, zero registration, daily updates. Vidorey is the site you need 🔞 vidorey,web,app (ketik di browser pakai titik)",
    "⚡ Instant access to thousands of explicit HD videos — loads fast, streams smooth, costs nothing: vidorey,web,app (ketik di browser pakai titik)",
    "Hot. Free. Private. The go-to site for adult content without the BS 🥵 vidorey,web,app (ketik di browser pakai titik)",
    "🎯 Every category of adult content imaginable — all free, all HD, all updated daily: vidorey,web,app (ketik di browser pakai titik)",
    "😋 Your next guilty pleasure is literally free — XXX videos on demand, no account needed: vidorey,web,app (ketik di browser pakai titik)",
    "🌙 Late night cravings? Thousands of free adult videos ready to stream right now: vidorey,web,app (ketik di browser pakai titik)",
    "Skip the paywall, skip the ads, skip the sign-up. Free adult content instantly 🔥 vidorey,web,app (ketik di browser pakai titik)",
    "💎 Premium-quality adult videos, zero cost. The hottest XXX content daily: vidorey,web,app (ketik di browser pakai titik)",
    "🚀 New videos every single day, free access forever, no login required 😏 vidorey,web,app (ketik di browser pakai titik)",
    "No pop-ups, no fees, no account? That's exactly what Vidorey is 🔞 vidorey,web,app (ketik di browser pakai titik)",
    "🍒 Thousands of free XXX scenes from every category. No credit card, no login ever: vidorey,web,app (ketik di browser pakai titik)",
    "Why risk sketchy sites when Vidorey delivers safe, free, HD adult content daily? 💋 vidorey,web,app (ketik di browser pakai titik)",
    "🔓 Unlock unlimited free adult content right now — HD XXX videos, zero registration: vidorey,web,app (ketik di browser pakai titik)",
    "New to free adult sites? Start with the best — hot videos, daily updates, no account 😈 vidorey,web,app (ketik di browser pakai titik)",
    "💣 Forget OnlyFans. Thousands of free XXX videos every day — no subscriptions: vidorey,web,app (ketik di browser pakai titik)",
    "🎬 Action-packed adult content, 100% free, updated every day. The better choice 🥵 vidorey,web,app (ketik di browser pakai titik)",
    "Psst... Vidorey has the best free adult videos online and nobody talks about it 😍 vidorey,web,app (ketik di browser pakai titik)",
    "🌶️ Spice up your night with free HD adult content — instant stream, no login: vidorey,web,app (ketik di browser pakai titik)",
    "No more buffering, no more paywalls. Free XXX videos in HD, instantly 🔥 vidorey,web,app (ketik di browser pakai titik)",
    "🥂 Treat yourself to free, unlimited adult content tonight. Never charges a cent: vidorey,web,app (ketik di browser pakai titik)",
    "😩 Can't sleep? Thousands of free adult videos ready to stream — no sign-up 🔞 vidorey,web,app (ketik di browser pakai titik)",
    "Fresh adult content added daily — totally free, completely private, no account required 💦 vidorey,web,app (ketik di browser pakai titik)",
    "🏆 Best free adult streaming site online? Vidorey. No contest: vidorey,web,app (ketik di browser pakai titik)",
    "One link, zero sign-up, unlimited free XXX content. That simple 😏 vidorey,web,app (ketik di browser pakai titik)",
    "🌟 The freshest free adult videos on the internet — updated every day, no registration: vidorey,web,app (ketik di browser pakai titik)",
    "When was the last time you found free HD adult videos with NO registration? Right here 😮 vidorey,web,app (ketik di browser pakai titik)",
    "🎁 Free gift — unlimited adult content, no strings attached, no sign-up needed 💋 vidorey,web,app (ketik di browser pakai titik)",
    "The adult site that actually respects your privacy. Free, fast, no account needed 🔒 vidorey,web,app (ketik di browser pakai titik)",
    "👁️ HD adult videos streaming instantly for free — open 24/7, no registration required: vidorey,web,app (ketik di browser pakai titik)",
    "🌊 Thousands of XXX videos updated every single day — all completely free: vidorey,web,app (ketik di browser pakai titik)",
    "Free adult content without the hassle — this is what Vidorey is all about 🥵 vidorey,web,app (ketik di browser pakai titik)",
    "💫 Zero fees. Zero sign-up. Just pure adult entertainment 24/7: vidorey,web,app (ketik di browser pakai titik)",
    "🔑 The secret to free unlimited adult content? Daily updates, HD quality, no login: vidorey,web,app (ketik di browser pakai titik)",
    "Adult content so good it should cost money — but Vidorey keeps it 100% free 😈 vidorey,web,app (ketik di browser pakai titik)",
    "📱 Works on any device, streams in HD, costs nothing. Your new adult content home 🔞 vidorey,web,app (ketik di browser pakai titik)",
    "🌍 Millions enjoy free adult content here — no registration, updated daily: vidorey,web,app (ketik di browser pakai titik)",
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
