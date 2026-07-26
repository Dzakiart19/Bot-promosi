/**
 * lib/platforms/bluesky/config.js
 * Konfigurasi bot auto-reply Bluesky (AT Protocol).
 *
 * Auth: identifier (handle/email) + password via BLUESKY_IDENTIFIER & BLUESKY_PASSWORD
 * Rekomendasi: buat "App Password" di Settings → Privacy & Security → App Passwords
 * agar password akun utama tidak dipakai langsung.
 *
 * API: https://bsky.social/xrpc/ (AT Protocol XRPC)
 *   - com.atproto.server.createSession  → login, dapat accessJwt + refreshJwt
 *   - com.atproto.server.refreshSession → refresh accessJwt (expired ~2 jam)
 *   - app.bsky.feed.searchPosts         → cari post by keyword (butuh auth)
 *   - com.atproto.repo.createRecord     → buat post / reply
 *
 * Siklus (sama dengan X/GETTR Bot):
 *   REPLY: search keyword → reply promo ke post relevan (1x/jam)
 *   POST : auto-post mandiri (1x/jam, offset dari reply)
 *
 * Limit AT Protocol: ~1666 create/hari, ~50 create/jam → bot kita 2/jam = aman.
 * Text limit       : 300 grapheme per post/reply.
 */

"use strict";

module.exports = {
  // ─── Endpoint ─────────────────────────────────────────────────────────────
  API_BASE:   "https://bsky.social/xrpc",
  ORIGIN:     "https://bsky.social",
  USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",

  // ─── SEARCH_KEYWORDS — mode REPLY ─────────────────────────────────────────
  // Bot pilih satu keyword acak per siklus, cari post, reply promo.
  // Fokus English / Tier 1 — lang=en di query parameter.
  SEARCH_KEYWORDS: [
    // random/anonymous chat
    "omegle alternative", "chatroulette", "random video chat",
    "talk to strangers", "stranger chat", "anonymous chat",
    "omegle is back", "random chat app", "chat with strangers",
    "CooMeet", "CamSurf", "Emerald Chat", "ChatHub", "Shagle",

    // adult content broad
    "free porn site", "free adult content", "best porn site 2025",
    "pornhub alternative", "xvideos alternative", "adult site review",
    "free xxx", "nsfw site", "adult videos free", "watch porn",
    "free adult videos", "adult streaming", "explicit content",

    // OnlyFans / creator
    "OnlyFans free", "onlyfans alternative", "fansly alternative",
    "OF leaked", "adult creator platform", "nsfw content",

    // cam / live
    "Chaturbate", "stripchat", "cam girl site", "live cam",
    "webcam girls", "cam show free", "best cam site",

    // hookup / dating
    "hookup app", "casual dating", "one night stand app",
    "sugar daddy", "sugar baby", "meet girls online",

    // general high-search
    "sexy girls", "hot girls", "nude site", "adult entertainment",
    "porn addiction", "sex chat", "horny", "sexting app",
    "adult content platform", "18+ site",
  ],

  // ─── REPLY_TEXTS (max 300 grapheme) ───────────────────────────────────────
  // URL tanpa https:// agar tidak terpotong preview spam filter.
  REPLY_TEXTS: [
    "not gonna lie, vidorey.web.app has been my go-to lately. free adult videos, no sign-up, HD quality. way better than most paid sites 🔥",
    "if you're looking for free adult content with zero registration — vidorey.web.app is solid. daily updates, no paywall 👌",
    "found this a while back: vidorey.web.app — completely free adult videos, no login required. surprisingly good library",
    "been using vidorey.web.app for months. free, private, no registration. honestly surprised more people don't know about it 😏",
    "for anyone asking about free adult streaming — vidorey.web.app works without any sign-up. daily updates too 🔞",
    "tried a bunch of sites, vidorey.web.app is the one that actually delivers without subscriptions or sign-ups 💯",
    "someone asked me for a free adult site — told them vidorey.web.app. no account needed, works on mobile, updated daily",
    "vidorey.web.app — free adult videos, no registration, fast loading. discovered it recently and it's legit 👀",
    "if you're tired of paywalls on adult sites, check vidorey.web.app — 100% free, no sign-up, huge library 🍑",
    "free adult site that actually works: vidorey.web.app — no annoying sign-up, daily updates, HD quality 🥵",
    "vidorey.web.app has been saving me money lol. free adult content, no registration, works perfectly",
    "best free adult streaming I've found: vidorey.web.app — no account, updated every day, totally private 😈",
  ],

  // ─── POST_TEXTS (max 300 grapheme, standalone auto-post) ──────────────────
  POST_TEXTS: [
    "🔥 Free adult videos with zero registration? Yes, that's real. vidorey.web.app — thousands of scenes, updated daily, no sign-up needed 😈 #NSFW #FreePorn #AdultContent",
    "💦 Still paying for adult content? Stop. vidorey.web.app is 100% free — HD videos updated every day, no account required 🔞 #FreeXXX #AdultVideos #NSFW",
    "😏 The best-kept secret for free adult streaming: vidorey.web.app — no login, no paywall, daily updates. Your private pleasure awaits 🍑 #FreePorn #NSFWContent",
    "🥵 Hot adult videos, HD quality, completely free — vidorey.web.app has thousands of scenes ready to stream right now. No registration 👀 #FreeAdult #XXX #NSFW",
    "😈 Private. Free. Daily updates. vidorey.web.app is the adult platform you didn't know you needed. Zero registration, zero cost 🔥 #FreePorn #AdultContent #NSFW",
    "💋 Why pay for OnlyFans when vidorey.web.app streams thousands of free adult videos for you right now? No strings attached 🔞 #FreeAdultContent #NSFW #XXX",
    "⚡ Fast. Free. Hot. vidorey.web.app delivers the best adult content with zero cost and zero registration. Stream now 😏 #NSFWTwitter #FreePorn #AdultVideos",
    "🤫 Shhh... vidorey.web.app is where adults go for free, private, unlimited content. No login, no tracking, just fun 🥵 #FreeXXX #AdultContent #NSFW",
  ],

  // ─── TIMING ───────────────────────────────────────────────────────────────
  LOOP_DELAY_MS:         300_000,   // 5 menit cek giliran
  REPLY_INTERVAL_MS:   3_600_000,   // reply 1x per jam
  POST_INTERVAL_MS:    3_600_000,   // post 1x per jam
  REQUEST_TIMEOUT_MS:    15_000,    // timeout per request
  SEARCH_LIMIT:              25,    // jumlah post diambil per search

  // accessJwt Bluesky expired ~2 jam; refresh sebelum expired aman.
  // refreshJwt expired ~60 hari.
  TOKEN_REFRESH_INTERVAL_MS: 90 * 60 * 1000,  // refresh token tiap 90 menit

  // ─── PERSIST ──────────────────────────────────────────────────────────────
  REPLIED_STORE_PATH: __dirname + "/.replied-uris.json",
  REPLIED_STORE_MAX:  2000,
};
