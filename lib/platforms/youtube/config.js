/**
 * lib/platforms/youtube/config.js
 * Konfigurasi bot auto-comment YouTube.
 *
 * Alur kerja: search keyword → ambil video kandidat → post komentar
 * via InnerTube API (youtubei.js) pakai cookie session YouTube.
 * Tidak pakai OAuth2/API key — cookie browser biasa sudah cukup.
 */

"use strict";

module.exports = {
  // ─── KEYWORDS — dipakai untuk mencari video target ─────────────────────────
  // Bot pilih satu keyword acak per siklus, cari video, lalu komentari
  // video pertama yang belum pernah dikomentari.
  SEARCH_KEYWORDS: [
    // platform random chat / video chat
    "omegle alternative 2025", "chatroulette alternative", "random video chat",
    "stranger chat app", "talk to strangers", "anonymous chat",
    "random chat roulette", "video chat stranger", "free video chat",
    // platform adult / entertainment
    "adult content platform", "free adult videos", "xxx video site",
    "watch free movies online", "streaming adult", "free streaming site",
    // dating / hookup
    "best dating app 2025", "online dating tips", "hookup app review",
    "casual dating site", "meet people online", "find partner online",
    "sugar daddy app", "sugar baby tips",
    // konten viral / trending
    "viral adult content", "nsfw content 2025", "leaked content viral",
    "onlyfans alternative", "onlyfans free", "fansly review",
    // keyword broad untuk reach tinggi
    "hot girls tiktok", "sexy women instagram", "beautiful girls viral",
    "hot video viral", "sexy video compilation",
    // gaming / streaming (reach luas)
    "twitch streamer hot tub", "e-girl stream", "hot cosplay",
    // review / reaksi yang biasa punya banyak penonton
    "reaksi video viral", "reaksi tik tok lucu",
    // bahasa Indonesia
    "video viral indonesia", "bokep indonesia", "video panas indo",
    "cewek cantik indonesia", "artis seksi indonesia",
    "konten dewasa indonesia", "link video dewasa",
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
  ],

  // ─── TIMING ────────────────────────────────────────────────────────────────
  // Delay antar siklus — cukup panjang agar tidak kena rate-limit / shadowban.
  // Shadowban bisa terjadi kalau komentar terlalu cepat (lihat issue #878 YT.js).
  LOOP_DELAY_MS:    600_000,   // 10 menit antar siklus (lebih safe dari X Bot)
  REQUEST_TIMEOUT_MS: 20_000,  // timeout per HTTP request

  // Jumlah video yang diambil per search (pilih satu dari kandidat ini)
  SEARCH_COUNT: 20,

  // ─── PERSIST ───────────────────────────────────────────────────────────────
  COMMENTED_STORE_PATH: __dirname + "/.commented-ids.json",
  COMMENTED_STORE_MAX:  2000,
};
