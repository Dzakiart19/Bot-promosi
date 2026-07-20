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
    "😏 Situs ini bikin penasaran banget… ribuan video trending, gratis, tanpa daftar. Coba sendiri: https://vidorey.web.app",
    "🔥 Lagi bosan? Satu klik doang udah nemu hiburan paling seru malam ini — gratis, tanpa login: https://vidorey.web.app",
    "💋 Orang-orang pada nonton ini diem-diem… dan kamu bakal ngerti kenapa. Cek: https://vidorey.web.app",
    "😈 Konten paling hits yang orang jarang share — updated tiap hari, 100% gratis: https://vidorey.web.app",
    "👀 Serius deh, ini salah satu situs paling underrated yang pernah ada. Ribuan video, no account needed: https://vidorey.web.app",
    "🍑 Hiburan malam yang bikin betah… gratis, privat, langsung bisa nonton. Link ada di sini: https://vidorey.web.app",
    "🌙 Mau nonton sesuatu yang beda malam ini? Ini tempatnya — free streaming, ribuan pilihan, no registration: https://vidorey.web.app",
    "😍 Baru tau situs ini dan langsung addicted… kontennya fresh tiap hari, gratis total: https://vidorey.web.app",
    "🔥 Hot banget nih, dan totally free. Nggak perlu akun, langsung bisa dinikmati: https://vidorey.web.app",
    "💦 Penasaran? Coba buka ini kalau lagi sendiri… jamin nggak nyesel 😏 https://vidorey.web.app",
    "✨ Konten yang bikin pengen nonton terus — update harian, streaming instan, tanpa bayar: https://vidorey.web.app",
    "🎬 Ribuan video trending setiap hari, gratis, tanpa iklan ganggu. Ini beneran: https://vidorey.web.app",
  ],
};
