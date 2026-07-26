/**
 * lib/platforms/youtube/config.js
 * Konfigurasi bot auto-comment YouTube.
 *
 * Target: penonton INTERNASIONAL (English-speaking) — tidak ada keyword bahasa Indonesia.
 * Alur kerja: search keyword → ambil video kandidat → post komentar
 * via InnerTube API (youtubei.js) pakai cookie session YouTube.
 * Tidak pakai OAuth2/API key — cookie browser biasa sudah cukup.
 */

"use strict";

module.exports = {
  // ─── SEARCH_KEYWORDS ───────────────────────────────────────────────────────
  // Bot pilih satu keyword acak per siklus, cari video, lalu komentari
  // video pertama yang belum pernah dikomentari.
  // Diorganisir per kategori seperti X Bot — reach luas, semua internasional.
  SEARCH_KEYWORDS: [
    // ── random chat / video chat platform ─────────────────────────────────────
    "omegle alternative 2025", "chatroulette alternative 2025",
    "random video chat app", "talk to strangers app", "anonymous video chat",
    "omegle is back", "stranger chat online", "random chat roulette",
    "video chat with strangers", "free random video chat",
    "CooMeet review", "CamSurf review", "ChatHub review",
    "Emerald Chat review", "Shagle alternative", "Chatspin review",
    "Bazoocam alternative", "stranger meet app 2025",

    // ── adult content / free porn platform ────────────────────────────────────
    "free adult content site 2025", "best free porn site 2025",
    "xxx video site review", "free streaming adult",
    "pornhub alternative 2025", "xvideos alternative",
    "xhamster alternative", "spankbang review",
    "OnlyFans alternative free", "fansly alternative 2025",
    "adult content platform review", "best nsfw site",
    "free xxx movies online", "watch free adult movies",
    "explicit content platform", "18+ content site",

    // ── live cam / cam girl ────────────────────────────────────────────────────
    "Chaturbate review 2025", "stripchat review", "LiveJasmin review",
    "MyFreeCams review", "bongacams review", "Jerkmate review",
    "cam girl site review", "live cam show", "webcam girls site",
    "best cam site 2025", "free cam chat",

    // ── OnlyFans / creator economy ─────────────────────────────────────────────
    "OnlyFans free account", "OnlyFans leaked 2025", "OF free content",
    "fansly leaked content", "best creator platform adult",
    "amateur content creator", "nsfw creator platform",

    // ── dating / hookup ────────────────────────────────────────────────────────
    "best hookup app 2025", "casual dating site review",
    "one night stand app", "sugar daddy app review",
    "sugar baby tips 2025", "online dating tips 2025",
    "hookup app review", "meet people online app",
    "best dating app for adults",

    // ── porn categories (high search volume) ──────────────────────────────────
    "free milf porn", "free teen porn site", "hentai site 2025",
    "anime porn review", "leaked nudes site", "homemade porn site",
    "amateur porn free", "sex tape leaked", "nsfw compilation",
    "hot girls compilation", "sexy girls tiktok", "e-girl compilation",

    // ── gaming / streaming (broad reach) ──────────────────────────────────────
    "twitch hot tub stream", "twitch nsfw moments", "e-girl gaming compilation",
    "hot cosplay 2025", "sexy streamer moments", "thirst trap compilation",
    "tiktok nsfw compilation", "hot shorts compilation",

    // ── trending / viral ──────────────────────────────────────────────────────
    "nsfw content 2025", "viral adult content", "leaked content viral 2025",
    "hot video viral", "sexy video compilation 2025",
    "adult video review", "best adult site review",
  ],

  // ─── COMMENT_TEXTS — pilih acak tiap siklus ────────────────────────────────
  COMMENT_TEXTS: [
    "Seeking discreet adult content? Vidorey offers a vast collection of free XXX videos and porn movies, updated daily. Stream instantly, no registration needed: https://vidorey.web.app",
    "Hey 👀 Want free XXX videos with zero sign-up? Vidorey streams thousands of hot adult movies every day — total privacy, zero cost: https://vidorey.web.app",
    "Why pay for adult content? Vidorey is 100% free — hot XXX videos updated daily, instant streaming, no account needed 🔞 https://vidorey.web.app",
    "Looking for free porn that actually delivers? Vidorey has thousands of explicit HD videos updated every day. No registration required: https://vidorey.web.app",
    "💋 Your secret guilty pleasure is one click away — Vidorey streams free adult videos daily, zero registration, total privacy: https://vidorey.web.app",
    "Bored? Vidorey has the hottest free XXX content streaming right now 🔥 Thousands of videos, updated daily, no login needed: https://vidorey.web.app",
    "💦 Free adult content, HD quality, daily updates — no account required. Vidorey is the best-kept secret online 😈 https://vidorey.web.app",
    "Adult videos updated every single day, 100% free, no registration. Vidorey — your private pleasure destination 🍑 https://vidorey.web.app",
    "Want to watch free XXX movies right now? Vidorey has thousands of scenes ready to stream — no sign-up, no fees 🥵 https://vidorey.web.app",
    "😏 The hottest free adult site you didn't know about — Vidorey. Daily updates, zero cost, instant streaming: https://vidorey.web.app",
    "💥 Forget the paywalls. Vidorey gives you unlimited free access to the hottest adult videos online. Stream now 😏 https://vidorey.web.app",
    "⚡ Fast. Free. Hot. Vidorey streams the best adult content with zero cost and zero registration. Try it now 🔞 https://vidorey.web.app",
    "🎬 Bored? Vidorey has the freshest free porn uploaded daily. HD quality, instant stream, 100% private 🔞 https://vidorey.web.app",
    "🔥 Why scroll mindlessly when you can watch FREE XXX videos anytime? Vidorey has thousands of hot scenes updated daily — no sign-up, no fees, just pleasure 😈 https://vidorey.web.app",
    "🌶️ Your daily dose of FREE adult content is waiting at Vidorey. No account needed — just open and enjoy 😏 https://vidorey.web.app",
    "🤫 Shhh... Vidorey is where adults go for free, private, and unlimited XXX content. No login, no tracking, just fun 😈 https://vidorey.web.app",
    "🍑 New hot videos added every single day at Vidorey — completely FREE, no account needed. Your pleasure awaits 🔥 https://vidorey.web.app",
    "👀 Looking for free adult content that actually works? Vidorey has thousands of videos ready to stream right now — no sign-up 🥵 https://vidorey.web.app",
  ],

  // ─── TIMING ────────────────────────────────────────────────────────────────
  LOOP_DELAY_MS:    600_000,   // 10 menit antar siklus (aman dari rate-limit / shadowban)
  REQUEST_TIMEOUT_MS: 20_000,  // timeout per HTTP request

  // Jumlah video yang diambil per search (pilih satu dari kandidat ini)
  SEARCH_COUNT: 20,

  // ─── PERSIST ───────────────────────────────────────────────────────────────
  COMMENTED_STORE_PATH: __dirname + "/.commented-ids.json",
  COMMENTED_STORE_MAX:  2000,
};
