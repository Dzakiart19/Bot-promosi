/**
 * lib/platforms/gettr/config.js
 * Konfigurasi bot auto-comment GETTR.
 *
 * Arsitektur: login → ambil trending posts → comment promo → sleep.
 * Semua request ke https://gettr.com/api/... dengan header x-app-auth.
 */

"use strict";

module.exports = {
  // Endpoint
  API_BASE:   "https://gettr.com/api",
  ORIGIN:     "https://gettr.com",
  REFERER:    "https://gettr.com/",
  USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",

  // Jumlah trending posts yang diambil per siklus
  TRENDING_MAX: 20,

  // Timing
  LOOP_DELAY_MS:       300_000,   // 5 menit antar siklus
  REQUEST_TIMEOUT_MS:   15_000,   // timeout per request
  POST_DELAY_MS:         8_000,   // jeda antar komentar dalam satu siklus
  MAX_COMMENTS_PER_CYCLE: 3,      // maksimal komentar per siklus

  // ─── KEYWORDS untuk search posts ─────────────────────────────────────────
  SEARCH_KEYWORDS: [
    "porn", "sex", "nsfw", "adult", "xxx",
    "onlyfans", "naked", "nude", "horny",
    "hot girls", "sexy", "erotic",
    "free porn", "adult content", "18+",
    "chaturbate", "stripchat", "cam girl",
    "milf", "lesbian", "blowjob", "orgasm",
    "hookup", "dating", "sugar daddy",
    "omegle", "random chat", "stranger",
  ],

  // ─── COMMENT TEXTS — dipilih acak tiap komentar ──────────────────────────
  COMMENT_TEXTS: [
    "Seeking discreet adult content? Vidorey offers a vast collection of free XXX videos and porn movies, updated daily. Stream instantly, no registration needed. Your private pleasure awaits: vidorey.web.app",
    "Hey 👀 Want free XXX videos with zero sign-up? Vidorey streams thousands of hot adult movies updated every day — total privacy, zero cost: vidorey.web.app",
    "Why pay for adult content? Vidorey is 100% free — hot XXX videos updated daily, instant streaming, no account needed 🔞 vidorey.web.app",
    "Looking for free porn that actually delivers? Vidorey has thousands of explicit HD videos updated every day. No registration required: vidorey.web.app",
    "💋 Your secret guilty pleasure is one click away — Vidorey streams free adult videos daily, zero registration, total privacy: vidorey.web.app",
    "Bored? Vidorey has the hottest free XXX content streaming right now 🔥 Thousands of videos, updated daily, no login needed: vidorey.web.app",
    "💦 Free adult content, HD quality, daily updates — no account required. Vidorey is the best-kept secret online 😈 vidorey.web.app",
    "Adult videos updated every single day, 100% free, no registration. Vidorey — your private pleasure destination 🍑 vidorey.web.app",
    "Want to watch free XXX movies right now? Vidorey has thousands of scenes ready to stream — no sign-up, no fees 🥵 vidorey.web.app",
    "😏 The hottest free adult site you didn't know about — Vidorey. Daily updates, zero cost, instant streaming: vidorey.web.app",
  ],

  // ─── POST TEXTS — auto-post mandiri (1x per jam) ─────────────────────────
  POST_TEXTS: [
    "🔥 Why scroll mindlessly when you can watch FREE XXX videos anytime? Vidorey has thousands of hot scenes updated daily — no sign-up, no fees, just pleasure 😈\n👉 vidorey.web.app\n#FreeXXX #AdultContent #NSFW #FreePorn #Vidorey",
    "💦 Feeling lonely tonight? Vidorey's got you covered with the hottest free porn movies streaming right now. No registration needed 🔞\n➡️ vidorey.web.app\n#FreePorn #PornVideos #NSFW #AdultVideos #XXX",
    "😏 The best free adult content platform just got better. Vidorey — daily updates, zero cost, total privacy.\nStream now: vidorey.web.app\n#FreeAdultContent #XXXVideos #NSFW #Vidorey #AdultContent",
    "🚨 Still paying for adult content? Stop. Vidorey gives you EVERYTHING for free — thousands of XXX videos, updated every day 🔥\nvidorey.web.app\n#FreeXXX #FreePorn #AdultVideos #NoRegistration #NSFW",
    "🥵 Hot videos, free access, no registration. That's Vidorey. Your new favorite guilty pleasure is one click away 😈\n👉 vidorey.web.app\n#HotVideos #FreeAdultContent #XXX #NSFW #FreePornVideos",
    "🎬 Bored? Vidorey has the freshest free porn uploaded daily. HD quality, instant stream, 100% private 🔞\nCheck it out: vidorey.web.app\n#FreePorn #PornHub #AdultContent #NSFW #HDPorn",
    "🌶️ Your daily dose of FREE adult content is waiting at Vidorey. No account needed — just open and enjoy 😏\nvidorey.web.app\n#FreeAdultContent #SexVideos #NSFW #XXX #Vidorey",
    "💋 Why pay for OnlyFans when Vidorey streams thousands of free XXX movies for you right now? No strings attached 🔥\n➡️ vidorey.web.app\n#OnlyFans #FreePorn #FreeXXX #NSFW #AdultContent",
    "😈 Private. Free. Hot. Vidorey is the adult platform you didn't know you needed. Daily updates, zero registration 🔞\nvidorey.web.app\n#FreeXXX #AdultVideos #NSFW #PornVideos #Vidorey",
    "🔞 Free XXX videos with no registration? Yes, that's real. Vidorey — the internet's best-kept secret for adult content 🥵\n👉 vidorey.web.app\n#XXXVideos #FreePorn #FreeAdultContent #NSFW #NoRegistration",
  ],
  POST_INTERVAL_MS: 3_600_000,   // auto-post 1x per jam

  // File persist post id yang sudah dikomentari
  REPLIED_STORE_PATH: __dirname + "/.replied-ids.json",
  REPLIED_STORE_MAX:  2000,
};
