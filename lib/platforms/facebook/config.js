/**
 * lib/platforms/facebook/config.js
 * Konfigurasi bot auto-comment Facebook Reels.
 *
 * Arsitektur: verifikasi cookie → ambil token (LSD/DTSG) → cari Reels via
 * /watch/ + search keyword + trending → comment promo tiap 30 detik.
 *
 * Auth: cookie session (c_user + xs + fr + datr, dll.) disimpan di FB_COOKIES.
 * Comment API: POST https://www.facebook.com/api/graphql/ dengan
 *   doc_id = CometUFICreateCommentMutation (di-discover otomatis dari bundle JS,
 *   fallback ke nilai statis COMMENT_DOC_ID di bawah jika discovery gagal).
 *
 * Recon:
 *   - Token extraction: parse LSD + DTSGInitialData dari HTML homepage (3MB)
 *   - Video IDs: scrape /watch/ + /watch/trending/ + search/videos/?q=KEYWORD
 *   - Feed posts: scrape top_level_post_id dari homepage news feed
 *   - feedback_id: base64("feedback:" + postId) — postId dari HTML /watch/
 *   - comment doc_id: "27829190080054105" ditemukan dari bundle JS (3.6MB)
 */

"use strict";

module.exports = {
  // Endpoint
  API_BASE:    "https://www.facebook.com",
  ORIGIN:      "https://www.facebook.com",
  USER_AGENT:  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",

  // doc_id untuk CometUFICreateCommentMutation
  // Ditemukan dari bundle JS (3.6MB): a.exports="27829190080054105"
  COMMENT_DOC_ID: "27829190080054105",

  // URL bundle JS yang berisi UFICreateCommentMutation (untuk re-discovery)
  DISCOVERY_BUNDLE_PATTERN: /rsrc\.php\/v4[^"]+\.js/,

  // Halaman untuk fetch token LSD + DTSG (login homepage)
  TOKEN_URL: "https://www.facebook.com/",

  // Halaman untuk cari Reels/video terbaru
  WATCH_URL: "https://www.facebook.com/watch/",

  // Halaman trending video Facebook (konten viral/populer global)
  TRENDING_URL: "https://www.facebook.com/watch/trending/",

  // Halaman Reels Facebook
  REELS_URL: "https://www.facebook.com/reels/",

  // Keyword untuk search video (dirotasi tiap siklus)
  // Kelompok 1: Viral & trending (US/tier-1 market)
  // Kelompok 2: Populer umum — aman untuk search, menghasilkan video nyata
  // Catatan: keyword NSFW diblokir oleh FB search (return 0 hasil)
  SEARCH_KEYWORDS: [
    // Trending US / tier-1 — high-reach, high-CPM
    "trending today",    "viral today",       "going viral",
    "viral moment",      "viral clip",        "viral video 2025",
    "most viral",        "trending now",      "viral this week",
    "breaking news",     "top trending",      "viral usa",
    "trending america",  "viral united states","popular usa",
    "viral worldwide",   "trending worldwide",

    // Entertainment & viral umum (engagement tinggi)
    "funny video",       "viral video",       "trending video",
    "dance video",       "music video",       "love song",
    "travel vlog",       "food video",        "workout video",
    "motivational video","prank video",       "challenge video",
    "cute video",        "amazing video",     "reaction video",
    "comedy video",      "lifestyle vlog",    "short film",
    "party video",       "beach video",       "night out",
    "celebrity video",   "sports highlight",  "highlight reel",
  ],

  // Timing
  LOOP_DELAY_MS:         30_000,   // 30 detik antar komentar sukses
  REQUEST_TIMEOUT_MS:    20_000,   // timeout per HTTP request
  TOKEN_REFRESH_EVERY:       20,   // refresh LSD/DTSG tiap N siklus
  REEL_REFRESH_EVERY:         8,   // refresh daftar post tiap N siklus (lebih sering)

  // Max berapa post yang dicoba per siklus sebelum menyerah
  // (skip post yang komentar dinonaktifkan tanpa tunggu 30s)
  MAX_POSTS_TO_TRY_PER_CYCLE: 10,

  MAX_COMMENTS_PER_REEL:      1,   // 1 komentar per reel (hindari duplikat)

  // File persist reel/post ID yang sudah dikomentari
  REPLIED_STORE_PATH: __dirname + "/.replied-ids.json",
  REPLIED_STORE_MAX:  5000,

  // ─── TEKS KOMENTAR — khusus Facebook ─────────────────────────────────────
  COMMENT_TEXTS: [
    "Update every day vidorey.web.app",
  ],
};
