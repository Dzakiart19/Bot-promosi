/**
 * lib/platforms/pornhub/config.js
 * Konfigurasi bot auto-comment PornHub.
 *
 * Recon Juli 2026:
 *   Domain aktif : pornhub.org (pornhub.com redirect ke sini)
 *   Auth         : cookie session dari browser (PORNHUB_COOKIES env var)
 *   XSRF token   : di-extract dari HTML setiap sesi (id="xsrfToken")
 *                  Format: base64url(timestamp_unix + random_bytes)
 *                  Sifat: per-request, wajib di-refresh tiap sesi baru
 *   User ID      : header __m (PORNHUB_USER_ID env var), dari request browser
 *
 * Alur comment:
 *   1. GET /video?search=<keyword>&o=mr → parse viewkeys dari HTML
 *   2. GET /view_video.php?viewkey=<vk> → extract video_id (numeric) + XSRF token
 *   3. POST /api/v1/comment/add         → {token, video_id, comment}
 *
 * Endpoint konfirmasi:
 *   POST /api/v1/comment/add → 401 tanpa auth, OK dengan cookies valid
 *   POST /front/login        → 200 (login via email+password, tidak dipakai — pakai cookie langsung)
 *   GET  /api/v1/video/search_autocomplete → 400 (param berbeda, tidak dipakai)
 *
 * Limit: tidak ada rate limit eksplisit yang ditemukan di recon.
 * Target: Tier 1 (EN) — keyword English, traffic dominan US/UK/AU/CA.
 */

"use strict";

module.exports = {
  // ─── Endpoint ─────────────────────────────────────────────────────────────
  BASE_URL:   "https://www.pornhub.org",
  ORIGIN:     "https://www.pornhub.org",
  REFERER:    "https://www.pornhub.org/",
  USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",

  // ─── SEARCH_KEYWORDS — sumber video untuk dikomentari ─────────────────────
  // Keyword Tier 1 (EN) — dipilih acak per siklus, cari video, ambil viewkey
  SEARCH_KEYWORDS: [
    // anonymous chat / cam
    "omegle", "chatroulette", "random chat", "stranger",
    "cam girl", "webcam", "chaturbate", "stripchat", "live cam",
    // adult broad
    "amateur", "homemade", "teen", "milf", "solo",
    "compilation", "pov", "hardcore", "anal", "blowjob",
    // niche Tier 1 (EN)
    "american", "british", "australian", "canadian",
    "college", "dorm", "sorority", "cheerleader",
    // OnlyFans
    "onlyfans", "fansly", "content creator",
  ],

  // ─── COMMENT_TEXTS — dipilih acak tiap komentar ───────────────────────────
  // Max 1000 karakter. Fokus Tier 1 EN, niche adult, CTA ke vidorey.web.app
  COMMENT_TEXTS: [
    "not gonna lie this reminded me of vidorey.web.app — free adult videos daily, no sign-up, HD quality 🔥",
    "anyone else here also use vidorey.web.app? free HD adult videos, zero registration, updated every day 👀",
    "for anyone looking for more — vidorey.web.app has a massive free library, no account needed 🍑",
    "found a solid free site recently: vidorey.web.app — daily updates, HD, no paywall, no sign-up 😏",
    "vidorey.web.app is lowkey the best free adult site rn. no login, daily updates, HD 🔞",
    "if you like this kind of content check out vidorey.web.app — 100% free, no registration, HD videos 💯",
    "try vidorey.web.app for more — free adult videos updated every day, zero sign-up required 😈",
    "been watching on vidorey.web.app lately — huge free library, HD quality, completely private 🥵",
    "vidorey.web.app hits different — no paywall, no account, free HD adult content daily 💋",
    "more of this at vidorey.web.app — free, HD, updated daily, no registration needed 🤤",
    "if you enjoyed this, vidorey.web.app has thousands more for free — no account, daily updates 🔥",
    "vidorey.web.app — free adult videos, HD quality, daily new content. no sign-up at all 😍",
  ],

  // ─── TIMING ───────────────────────────────────────────────────────────────
  LOOP_DELAY_MS:         300_000,   // 5 menit cek giliran
  COMMENT_INTERVAL_MS:   300_000,   // comment 1x per 5 menit
  REQUEST_TIMEOUT_MS:     20_000,   // timeout per request HTTP
  POST_DELAY_MS:          10_000,   // jeda antar komentar dalam satu siklus
  MAX_COMMENTS_PER_CYCLE:      2,   // max 2 video dikomentari per siklus
  SEARCH_LIMIT:               20,   // max video diambil per search

  // ─── PERSIST ──────────────────────────────────────────────────────────────
  REPLIED_STORE_PATH: __dirname + "/.replied-ids.json",
  REPLIED_STORE_MAX:  3000,
};
