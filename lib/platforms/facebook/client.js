/**
 * lib/platforms/facebook/client.js
 * HTTP client untuk Facebook internal API.
 *
 * Auth: cookie session (FB_COOKIES) — c_user + xs + fr + datr dll.
 * API: POST https://www.facebook.com/api/graphql/
 *   Header wajib: X-FB-LSD (token dari HTML), Cookie, Content-Type
 *   Body: lsd, fb_dtsg, av (user_id), doc_id, variables (JSON)
 *
 * Token LSD + DTSG berumur ~beberapa jam, di-refresh tiap TOKEN_REFRESH_EVERY siklus.
 *
 * Recon notes:
 *   - LSD: dari "LSD",[],{"token":"XXX"} dalam HTML homepage
 *   - DTSG: dari "DTSGInitialData",[],{"token":"XXX"} dalam HTML homepage
 *   - Comment doc_id: dari bundle JS → a.exports="27829190080054105" (UFICreateCommentMutation)
 *   - feedback_id: base64("feedback:" + postId)
 *   - Post IDs: dari HTML /watch/ → "post_id":"NUMBER" pattern
 *   - Video IDs: dari HTML /watch/ → "video_id":"NUMBER" pattern
 *   - Search reels: /search/videos/?q=KEYWORD → extract post_id dari HTML
 */

"use strict";

const cfg = require("./config");
const { log } = require("../../core/logger");

let cachedDocId = cfg.COMMENT_DOC_ID;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, options = {}) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function basePageHeaders(referer = cfg.TOKEN_URL) {
  return {
    "User-Agent":        cfg.USER_AGENT,
    "Accept":            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language":   "en-US,en;q=0.9",
    "Sec-Fetch-Dest":    "document",
    "Sec-Fetch-Mode":    "navigate",
    "Sec-Fetch-Site":    "same-origin",
    "Referer":           referer,
  };
}

function baseApiHeaders(lsd, referer = cfg.TOKEN_URL) {
  return {
    "User-Agent":        cfg.USER_AGENT,
    "Content-Type":      "application/x-www-form-urlencoded",
    "X-FB-LSD":          lsd,
    "X-ASBD-ID":         "129477",
    "Origin":            cfg.ORIGIN,
    "Referer":           referer,
    "Accept":            "*/*",
    "Accept-Language":   "en-US,en;q=0.9",
    "Sec-Fetch-Dest":    "empty",
    "Sec-Fetch-Mode":    "cors",
    "Sec-Fetch-Site":    "same-origin",
  };
}

function extractTokens(html) {
  return {
    lsd:   html.match(/"LSD".*?\{.*?"token":"([^"]+)"/s)?.[1]   ?? null,
    dtsg:  html.match(/"DTSGInitialData".*?\{.*?"token":"([^"]+)"/s)?.[1] ?? null,
    uid:   html.match(/"USER_ID":"(\d+)"/)?.[1]                 ?? null,
    spinR: html.match(/"__spin_r":(\d+)/)?.[1]                  ?? null,
    spinB: html.match(/"__spin_b":"([^"]+)"/)?.[1]              ?? null,
    spinT: html.match(/"__spin_t":(\d+)/)?.[1]                  ?? null,
    hsi:   html.match(/"hsi":"([^"]+)"/)?.[1]                   ?? null,
  };
}

// ── Token management ──────────────────────────────────────────────────────────

/**
 * Ambil LSD + DTSG dari homepage Facebook.
 * Harus dipanggil dengan cookie valid agar dapat HTML login (bukan redirect).
 */
async function getTokens(cookieStr) {
  const res  = await fetchWithTimeout(cfg.TOKEN_URL, {
    headers: { ...basePageHeaders(), "Cookie": cookieStr },
  });
  const html = await res.text();
  const tok  = extractTokens(html);
  if (!tok.lsd || !tok.dtsg) {
    throw new Error(`Gagal extract LSD/DTSG dari homepage (size=${html.length}). Cookie mungkin expired.`);
  }
  return tok;
}

// ── Comment doc_id discovery ──────────────────────────────────────────────────

/**
 * Coba discover doc_id terbaru untuk CometUFICreateCommentMutation dari JS bundle.
 * Pattern: UFICreateCommentMutation_facebookRelayOperation → a.exports="DOCID"
 * Fallback ke cfg.COMMENT_DOC_ID jika gagal.
 */
async function discoverCommentDocId(cookieStr) {
  if (cachedDocId) return cachedDocId;
  try {
    // Ambil daftar JS bundles dari /watch/
    const res  = await fetchWithTimeout(cfg.WATCH_URL, {
      headers: { ...basePageHeaders(cfg.TOKEN_URL), "Cookie": cookieStr },
    });
    const html = await res.text();
    const bundles = [...html.matchAll(/src="(https:\/\/static\.xx\.fbcdn\.net\/rsrc\.php\/[^"]+\.js)"/g)]
      .map(m => m[1]);

    // Cek tiap bundle sampai ketemu UFICreateCommentMutation
    for (const url of bundles) {
      let js;
      try {
        const r = await fetchWithTimeout(url, { headers: { "User-Agent": cfg.USER_AGENT } });
        js = await r.text();
      } catch { continue; }

      // Pattern: UFICreateCommentMutation_facebookRelayOperation → a.exports="27829190080054105"
      const m = js.match(/UFICreateCommentMutation_facebookRelayOperation[^;]{0,200}a\.exports\s*=\s*"(\d{10,20})"/);
      if (m) {
        log("INFO", `[FB] Comment doc_id discovered: ${m[1]}`);
        cachedDocId = m[1];
        return cachedDocId;
      }
    }
    log("WARN", `[FB] Discovery gagal — pakai fallback doc_id: ${cfg.COMMENT_DOC_ID}`);
  } catch (err) {
    log("WARN", `[FB] discoverCommentDocId error: ${err.message} — pakai fallback`);
  }
  cachedDocId = cfg.COMMENT_DOC_ID;
  return cachedDocId;
}

// ── Fetch Reels / Video posts ─────────────────────────────────────────────────

/**
 * Ambil video_id dari halaman /watch/ dan /search/videos/.
 * Pakai beberapa pattern karena Facebook sering ubah struktur HTML-nya.
 * @returns {string[]} unique video IDs
 */
function parseVideoIdsFromHtml(html) {
  const ids = [];

  // Pattern 1 (klasik): "video_id":"1234567890"
  for (const m of html.matchAll(/"video_id"\s*:\s*"(\d{10,20})"/g)) ids.push(m[1]);

  // Pattern 2 (camelCase): "videoId":"1234567890"
  for (const m of html.matchAll(/"videoId"\s*:\s*"(\d{10,20})"/g)) ids.push(m[1]);

  // Pattern 3 (angka tanpa quote): "video_id":1234567890
  for (const m of html.matchAll(/"video_id"\s*:\s*(\d{10,20})/g)) ids.push(m[1]);

  // Pattern 4 (escaped JSON, umum di inline __data__): \"video_id\":\"1234567890\"
  for (const m of html.matchAll(/\\"video_id\\"\s*:\s*\\"(\d{10,20})\\"/g)) ids.push(m[1]);

  // Pattern 5: /watch/?v=1234567890 (URL di dalam HTML)
  for (const m of html.matchAll(/\/watch\/\?v=(\d{10,20})/g)) ids.push(m[1]);

  // Pattern 6: "targetFbid":"1234567890" atau "target_id":"1234567890" (kadang dipakai untuk video post)
  for (const m of html.matchAll(/"(?:targetFbid|target_fbid)"\s*:\s*"(\d{10,20})"/g)) ids.push(m[1]);

  return [...new Set(ids)];
}

/**
 * Ambil feedback_id asli dari halaman video individu.
 * Format feedback_id Facebook: base64("feedback:POST_ID")
 *
 * Recon notes (2026):
 *  - HTML Facebook sering berisi feedback_id sebagai value JSON di dalam
 *    __bbox atau __data__ JSON yang di-escape.
 *  - Kalau tidak ketemu feedback_id langsung, fallback: cari post_id / story_id
 *    lalu compute base64("feedback:POST_ID") sendiri.
 *
 * @param {string} cookieStr
 * @param {string} videoId
 * @returns {{ videoId, feedbackId, postId } | null}
 */
async function fetchVideoFeedbackId(cookieStr, videoId) {
  try {
    const url = `${cfg.API_BASE}/watch/?v=${videoId}`;
    const res  = await fetchWithTimeout(url, {
      headers: { ...basePageHeaders(cfg.WATCH_URL), "Cookie": cookieStr },
    });
    const html = await res.text();

    // ── Strategi 1: cari feedback_id langsung dalam berbagai format ──────────

    const fbIdPatterns = [
      // "feedback_id":"BASE64"
      /"feedback_id"\s*:\s*"([A-Za-z0-9+/=]{20,})"/g,
      // "feedbackId":"BASE64"
      /"feedbackId"\s*:\s*"([A-Za-z0-9+/=]{20,})"/g,
      // escaped: \"feedback_id\":\"BASE64\"
      /\\"feedback_id\\"\s*:\s*\\"([A-Za-z0-9+/=]{20,})\\"/g,
      /\\"feedbackId\\"\s*:\s*\\"([A-Za-z0-9+/=]{20,})\\"/g,
      // ufeedback_id (unicode escape kadang di-serve FB)
      /feedback_id[^"]{0,10}"([A-Za-z0-9+/=]{20,})"/g,
    ];

    for (const pattern of fbIdPatterns) {
      for (const m of html.matchAll(pattern)) {
        const raw = m[1];
        try {
          const decoded = Buffer.from(raw, "base64").toString("utf8");
          if (decoded.startsWith("feedback:")) {
            const postId     = decoded.replace(/^feedback:/, "").split("_")[0];
            const feedbackId = Buffer.from(`feedback:${postId}`).toString("base64");
            log("INFO", `[FB] video ${videoId} → post ${postId} (via feedback_id pattern)`);
            return { videoId, feedbackId, postId };
          }
        } catch { /* ignore decode error */ }
      }
    }

    // ── Strategi 2: cari post_id / story_id di HTML, compute feedback_id ─────
    //   Pattern yang umum di HTML Facebook: "post_id":"NUMBER" atau "story_id":"NUMBER"

    const postIdPatterns = [
      /"post_id"\s*:\s*"(\d{10,20})"/g,
      /"post_id"\s*:\s*(\d{10,20})/g,
      /\\"post_id\\"\s*:\s*\\"(\d{10,20})\\"/g,
      /"story_id"\s*:\s*"(\d{10,20})"/g,
      /"story_id"\s*:\s*(\d{10,20})/g,
      // top-level_post_id atau top_level_post_id
      /"top_level_post_id"\s*:\s*"(\d{10,20})"/g,
      /"top_level_post_id"\s*:\s*(\d{10,20})/g,
    ];

    for (const pattern of postIdPatterns) {
      for (const m of html.matchAll(pattern)) {
        const postId     = m[1];
        const feedbackId = Buffer.from(`feedback:${postId}`).toString("base64");
        log("INFO", `[FB] video ${videoId} → post ${postId} (via post_id pattern)`);
        return { videoId, feedbackId, postId };
      }
    }

    // ── Strategi 3 (fallback): gunakan videoId sendiri sebagai postId ─────────
    //   Beberapa video Facebook menggunakan video_id = post_id.
    //   Ini heuristik — tidak selalu benar, tapi lebih baik dari tidak ada.
    const feedbackIdFallback = Buffer.from(`feedback:${videoId}`).toString("base64");
    log("INFO", `[FB] video ${videoId} → fallback feedback_id dari videoId`);
    return { videoId, feedbackId: feedbackIdFallback, postId: videoId };

  } catch (err) {
    log("WARN", `[FB] fetchVideoFeedbackId(${videoId}) error: ${err.message}`);
    return null;
  }
}

/**
 * Ambil daftar reel/post dari berbagai sumber Facebook.
 * Untuk setiap video_id yang ditemukan, fetch halaman video-nya
 * untuk dapat feedback_id yang valid.
 *
 * Sumber (dari yang paling kaya konten):
 *   1. Video search dengan keyword (paling banyak video_ids)
 *   2. /watch/ (rekomendasi video)
 *   3. /reels/ (reels khusus)
 *   4. Homepage (news feed — personal)
 *
 * @returns {Array<{postId, videoId, feedbackId}>}
 */
async function fetchReelPosts(cookieStr, keyword = null) {
  const videoIds = [];

  const kw = keyword ?? cfg.SEARCH_KEYWORDS[Math.floor(Math.random() * cfg.SEARCH_KEYWORDS.length)];

  // Fetch semua sumber secara paralel untuk efisiensi
  const sources = [
    { name: "search",   url: `${cfg.API_BASE}/search/videos/?q=${encodeURIComponent(kw)}`, ref: cfg.WATCH_URL },
    { name: "/watch/",  url: cfg.WATCH_URL,                                                 ref: cfg.TOKEN_URL },
    { name: "/reels/",  url: `${cfg.API_BASE}/reels/`,                                     ref: cfg.WATCH_URL },
    { name: "homepage", url: cfg.TOKEN_URL,                                                 ref: cfg.TOKEN_URL },
  ];

  const htmlResults = await Promise.allSettled(
    sources.map(({ url, ref }) =>
      fetchWithTimeout(url, { headers: { ...basePageHeaders(ref), "Cookie": cookieStr } })
        .then(r => r.text())
    )
  );

  for (let i = 0; i < sources.length; i++) {
    const res = htmlResults[i];
    if (res.status !== "fulfilled") {
      log("WARN", `[FB] Fetch ${sources[i].name} error: ${res.reason?.message}`);
      continue;
    }
    const ids = parseVideoIdsFromHtml(res.value);
    if (ids.length) {
      log("INFO", `[FB] ${sources[i].name} → ${ids.length} video_id`);
      videoIds.push(...ids);
    }
  }

  // Deduplicate video IDs
  const uniqueIds = [...new Set(videoIds)].slice(0, 20); // max 20 per batch
  if (!uniqueIds.length) return [];

  log("INFO", `[FB] Fetch feedback_id untuk ${uniqueIds.length} video...`);

  // Fetch feedback_id untuk setiap video (paralel, max 4 sekaligus)
  const results = [];
  for (let i = 0; i < uniqueIds.length; i += 4) {
    const batch   = uniqueIds.slice(i, i + 4);
    const fetched = await Promise.all(
      batch.map(vid => fetchVideoFeedbackId(cookieStr, vid))
    );
    for (const r of fetched) {
      if (r) results.push(r);
    }
  }

  log("INFO", `[FB] ${results.length}/${uniqueIds.length} video punya feedback_id valid`);
  return results;
}

// ── Comment ───────────────────────────────────────────────────────────────────

/**
 * Post komentar ke post/reel Facebook via CometUFICreateCommentMutation.
 *
 * @param {string} cookieStr  - raw cookie string dari FB_COOKIES
 * @param {object} tokens     - { lsd, dtsg, uid }
 * @param {string} docId      - doc_id untuk CometUFICreateCommentMutation
 * @param {string} feedbackId - base64 encoded feedback ID
 * @param {string} text       - teks komentar
 * @returns {{ commentId, success, error? }}
 */
async function postComment(cookieStr, tokens, docId, feedbackId, text) {
  const { lsd, dtsg, uid } = tokens;

  const body = new URLSearchParams({
    lsd,
    fb_dtsg:    dtsg,
    av:         uid,
    __user:     uid,
    __a:        "1",
    __req:      "a",
    server_timestamps: "true",
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "CometUFICreateCommentMutation",
    variables:  JSON.stringify({
      input: {
        actor_id:            uid,
        feedback_id:         feedbackId,
        message:             { text, ranges: [] },
        feedback_source:     "NEWS_FEED",
        is_tracking_checked: true,
        is_final_action:     false,
        source:              "www",
        idempotence_token:   crypto.randomUUID(),
        session_id:          crypto.randomUUID(),
      },
      feedbackSource:     0,
      scale:              1,
      useFilledInValue:   false,
      focusCommentID:     null,
    }),
    doc_id: String(docId),
  });

  const res      = await fetchWithTimeout(`${cfg.API_BASE}/api/graphql/`, {
    method:  "POST",
    headers: { ...baseApiHeaders(lsd, cfg.WATCH_URL), "Cookie": cookieStr },
    body:    body.toString(),
  });

  const bodyText = await res.text();
  let data;
  try { data = JSON.parse(bodyText.replace(/^for\s*\(;;\);\s*/, "")); }
  catch { throw new Error(`postComment: respons bukan JSON — ${bodyText.slice(0, 200)}`); }

  // Cek error level CRITICAL
  if (data?.errors?.length) {
    const criticals = data.errors.filter(e => (e.severity ?? "CRITICAL") !== "WARNING");
    if (criticals.length) {
      // Deteksi rate-limit / spam block Facebook (api_error_code 368)
      const rateLimitErr = criticals.find(e => e.api_error_code === 368 || e.code === 1390008);
      if (rateLimitErr) {
        const err = new Error("FB_RATE_LIMITED: " + (rateLimitErr.summary ?? "Rate limited by Facebook"));
        err.isFbRateLimit = true;
        throw err;
      }
      const msg = criticals.map(e => e.summary ?? e.message).join("; ");
      throw new Error(`GraphQL error: ${msg}`);
    }
  }

  // Kalau comment_create null/tidak ada — komentar tidak terposting (meski hanya WARNING errors)
  const cc = data?.data?.comment_create;
  if (!cc) {
    const errMsg = data?.errors?.length
      ? data.errors.map(e => e.message).join("; ")
      : "comment_create null — komentar tidak terposting";
    throw new Error(`GraphQL: ${errMsg}`);
  }

  // Cek komentar dinonaktifkan
  const disabled = cc.feedback?.comments_disabled_notice_renderer;
  if (disabled) {
    return { commentId: null, success: false, error: "comments_disabled" };
  }

  // Ambil ID komentar baru (coba beberapa field)
  const commentId = cc.comment?.id
    ?? cc.comment?.legacy_api_id
    ?? cc.comment?.legacy_fbid
    ?? null;
  return { commentId, success: true };
}

module.exports = { getTokens, discoverCommentDocId, fetchReelPosts, postComment };
