/**
 * lib/platforms/xnxx/config.js
 * Konfigurasi bot auto-comment XNXX.COM.
 *
 * Recon Juli 2026:
 *   Domain    : www.xnxx.com (accessible dari Replit datacenter IP ✓)
 *   Auth      : ANONIM — tidak butuh akun/login (allow_anonymous: true)
 *   Session   : cookie session_token (auto-set oleh server saat GET halaman)
 *   Captcha   : FriendlyCaptcha v1 (SHA-256 PoW) — bisa solved server-side
 *   CSRF token: di-extract dari GET /threads/video-comments/get-posts/{videoId}
 *
 * Alur comment:
 *   1. GET /search/{keyword}/{page}
 *        → parse slug video (/video-XXXXX/judul)
 *   2. GET /video-XXXXX/judul
 *        → extract numeric video_id dari window.xv.conf.dyn.id
 *   3. GET /threads/video-comments/get-posts/{videoId}
 *        → extract csrf_token + captcha field name dari form HTML
 *   4. GET https://api.friendlycaptcha.com/api/v1/puzzle?sitekey=FCMMLC5H1NSE2GHE
 *        → solve SHA-256 PoW
 *   5. POST /threads/video-comments/post/{videoId}/0
 *        body: post[csrf_token] + post[user] + post[text] + post[fc-XXXX]
 *
 * Endpoint konfirmasi:
 *   GET  /search/sexy/1        → 200 (search accessible dari Replit ✓)
 *   POST /threads/video-comments/post/{id}/0 → form response (allow_anonymous=true ✓)
 *   FriendlyCaptcha puzzle API → {"success":true,"data":{"puzzle":"..."}} ✓
 */

"use strict";

module.exports = {
  // ─── Endpoint ─────────────────────────────────────────────────────────────
  BASE_URL:          "https://www.xnxx.com",
  ORIGIN:            "https://www.xnxx.com",
  REFERER:           "https://www.xnxx.com/",
  USER_AGENT:        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",

  // FriendlyCaptcha v1
  FC_PUZZLE_URL:     "https://api.friendlycaptcha.com/api/v1/puzzle",
  FC_SITEKEY:        "FCMMLC5H1NSE2GHE",

  // ─── Keyword search (dipakai /search/{keyword}/{page}) ────────────────────
  SEARCH_KEYWORDS: [
    "sexy", "teen", "milf", "amateur", "hot girl",
    "asian", "latina", "ebony", "babe", "beautiful",
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
  LOOP_DELAY_MS:         300_000,   // 5 menit antar siklus
  COMMENT_INTERVAL_MS:   300_000,   // comment 1x per 5 menit
  REQUEST_TIMEOUT_MS:     20_000,   // timeout per request HTTP
  POST_DELAY_MS:          12_000,   // jeda antar komentar dalam satu siklus
  MAX_COMMENTS_PER_CYCLE:      2,   // max video dikomentari per siklus
  BROWSE_LIMIT:               30,   // max slug video diambil per browse

  // ─── PERSIST ──────────────────────────────────────────────────────────────
  REPLIED_STORE_PATH: __dirname + "/.replied-ids.json",
  REPLIED_STORE_MAX:  3000,
};
