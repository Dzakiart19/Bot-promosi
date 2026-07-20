/**
 * lib/platforms/facebook/config.js
 * Konfigurasi bot auto-comment Facebook Reels.
 *
 * Arsitektur: verifikasi cookie → ambil token (LSD/DTSG) → cari Reels via
 * /watch/ + search keyword → comment promo tiap 30 detik.
 *
 * Auth: cookie session (c_user + xs + fr + datr, dll.) disimpan di FB_COOKIES.
 * Comment API: POST https://www.facebook.com/api/graphql/ dengan
 *   doc_id = CometUFICreateCommentMutation (di-discover otomatis dari bundle JS,
 *   fallback ke nilai statis COMMENT_DOC_ID di bawah jika discovery gagal).
 *
 * Recon:
 *   - Token extraction: parse LSD + DTSGInitialData dari HTML homepage (3MB)
 *   - Video IDs: scrape /watch/ + search/videos/?q=KEYWORD
 *   - feedback_id: base64("feedback:" + postId) — postId dari HTML /watch/
 *   - comment doc_id: "27829190080054105" ditemukan dari bundle JS (3.6MB)
 *     dengan pattern: UFICreateCommentMutation_facebookRelayOperation → a.exports="27829190080054105"
 */

"use strict";

module.exports = {
  // Endpoint
  API_BASE:    "https://www.facebook.com",
  ORIGIN:      "https://www.facebook.com",
  USER_AGENT:  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",

  // doc_id untuk CometUFICreateCommentMutation
  // Ditemukan dari bundle JS (3.6MB): a.exports="27829190080054105"
  // Jika FB update bundle, bot coba discover ulang otomatis dari JS bundle,
  // nilai ini sebagai fallback.
  COMMENT_DOC_ID: "27829190080054105",

  // URL bundle JS yang berisi UFICreateCommentMutation (untuk re-discovery)
  // Bot download ini saat startup untuk update doc_id terbaru
  DISCOVERY_BUNDLE_PATTERN: /rsrc\.php\/v4[^"]+\.js/,

  // Halaman untuk fetch token LSD + DTSG (login homepage)
  TOKEN_URL: "https://www.facebook.com/",

  // Halaman untuk cari Reels/video terbaru
  WATCH_URL: "https://www.facebook.com/watch/",

  // Keyword untuk search video (dirotasi tiap siklus)
  SEARCH_KEYWORDS: [
    "sexy video", "hot girls", "adult content", "nsfw",
    "naked", "nude", "xxx video", "porn video",
    "free adult", "OnlyFans", "stripchat", "cam girl",
    "bikini video", "hot women", "sexy dance",
    "random chat", "omegle", "stranger video",
  ],

  // Timing
  LOOP_DELAY_MS:         30_000,   // 30 detik antar komentar
  REQUEST_TIMEOUT_MS:    20_000,   // timeout per HTTP request
  TOKEN_REFRESH_EVERY:       20,   // refresh LSD/DTSG tiap N siklus
  REEL_REFRESH_EVERY:        10,   // refresh daftar Reels tiap N siklus
  MAX_COMMENTS_PER_REEL:      1,   // 1 komentar per reel (hindari duplikat)

  // File persist reel/post ID yang sudah dikomentari
  REPLIED_STORE_PATH: __dirname + "/.replied-ids.json",
  REPLIED_STORE_MAX:  3000,

  // ─── TEKS KOMENTAR — dipilih acak tiap siklus ─────────────────────────────
  COMMENT_TEXTS: [
    "Seeking discreet adult content? Vidorey offers a vast collection of free XXX videos updated daily. No registration needed 🔞 https://vidorey.web.app",
    "Hey 👀 Want free XXX videos with zero sign-up? Vidorey streams thousands of hot adult movies — total privacy, zero cost: https://vidorey.web.app",
    "Why pay for adult content? Vidorey is 100% free — hot XXX videos updated daily, instant streaming, no account needed 🔞 https://vidorey.web.app",
    "Looking for free porn that actually delivers? Vidorey has thousands of explicit HD videos updated every day. No registration: https://vidorey.web.app",
    "💋 Your secret guilty pleasure is one click away — Vidorey streams free adult videos daily, zero registration: https://vidorey.web.app",
    "Bored? Vidorey has the hottest free XXX content right now 🔥 Thousands of videos updated daily, no login needed: https://vidorey.web.app",
    "💦 Free adult content, HD quality, daily updates — no account required. Vidorey is the best-kept secret online 😈 https://vidorey.web.app",
    "Adult videos updated every single day, 100% free, no registration. Vidorey — your private pleasure destination 🍑 https://vidorey.web.app",
    "Want to watch free XXX movies right now? Vidorey has thousands of scenes ready to stream — no sign-up, no fees 🥵 https://vidorey.web.app",
    "😏 The hottest free adult site you didn't know about — Vidorey. Daily updates, zero cost, instant streaming: https://vidorey.web.app",
    "🔥 FREE adult videos every day — no account, no fees, no limits. Vidorey is your go-to pleasure platform: https://vidorey.web.app",
    "😈 Private. Free. Hot. Vidorey is the adult platform you didn't know you needed. Daily updates, zero registration 🔞 https://vidorey.web.app",
  ],
};
