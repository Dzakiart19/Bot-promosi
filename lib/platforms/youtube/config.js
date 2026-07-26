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
  // ⚠️ URL tidak pakai "https://" — versi dengan protokol lengkap langsung
  // di-flag spam filter YouTube. Format "site.tld" jauh lebih lolos.
  // Kalimat juga dibuat lebih natural/conversational, bukan hard-sell.
  COMMENT_TEXTS: [
    "Anyone know a good free site for adult content? I've been using vidorey.web.app — no registration, updated daily, works great",
    "not gonna lie, vidorey.web.app has been my go-to lately. free, no sign-up, loads fast. way better than most paid sites",
    "if you're looking for free adult videos, check vidorey.web.app — huge collection, no account needed, daily updates 👌",
    "found this site a while back: vidorey.web.app — completely free adult content, no login required. worth bookmarking",
    "been using vidorey.web.app for months now. free, private, no registration. honestly surprised more people don't know about it",
    "for anyone asking about free adult streaming — vidorey.web.app is solid. no paywall, no signup, tons of content",
    "tried a bunch of sites, vidorey.web.app is the one that actually works without subscriptions or sign-ups. daily updates too",
    "vidorey.web.app — free adult videos, zero registration, HD quality. discovered it recently and it's actually legit",
    "if you want free adult content without the sketchy ads or paywalls, vidorey.web.app is worth a look. no account needed",
    "honestly just go to vidorey.web.app — free, no signup, updated every day. best free adult site I've found so far",
    "someone asked me for a good free adult site yesterday, told them vidorey.web.app — no registration, works on mobile too",
    "vidorey.web.app is what you're looking for if you want free adult content without creating an account. simple and clean",
    "for free adult streaming without the hassle — vidorey.web.app. no login, no subscription, daily new content 🔥",
    "just tried vidorey.web.app and honestly impressed. free adult videos, no account required, fast loading. recommend it",
    "if you're tired of paywalls on adult sites, check vidorey.web.app — 100% free, no sign-up, huge library",
    "vidorey.web.app has been saving me money lol. free adult content, no registration, works perfectly. check it out",
    "free adult site that actually delivers: vidorey.web.app — no annoying sign-up, daily updates, HD quality 👀",
    "been recommending vidorey.web.app to people — free, no account needed, updated daily. solid alternative to paid sites",
  ],

  // ─── TIMING ────────────────────────────────────────────────────────────────
  LOOP_DELAY_MS:    60_000,    // 1 menit antar siklus
  REQUEST_TIMEOUT_MS: 20_000,  // timeout per HTTP request

  // Jumlah video yang diambil per search (pilih satu dari kandidat ini)
  SEARCH_COUNT: 20,

  // ─── PERSIST ───────────────────────────────────────────────────────────────
  COMMENTED_STORE_PATH: __dirname + "/.commented-ids.json",
  COMMENTED_STORE_MAX:  2000,
};
