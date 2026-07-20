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
 *   - Post IDs (video): dari HTML /watch/ → "post_id":"NUMBER" pattern
 *   - Post IDs (feed): dari homepage HTML → "top_level_post_id":"NUMBER"
 *   - Video IDs: dari HTML /watch/ → "video_id":"NUMBER" pattern
 *   - Search reels: /search/videos/?q=KEYWORD → extract post_id dari HTML
 *   - Trending: /watch/trending/ → video IDs dari halaman trending
 *   - Comments disabled: "can_viewer_comment":false atau "comments_disabled":true dalam HTML
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

async function discoverCommentDocId(cookieStr) {
  if (cachedDocId) return cachedDocId;
  try {
    const res  = await fetchWithTimeout(cfg.WATCH_URL, {
      headers: { ...basePageHeaders(cfg.TOKEN_URL), "Cookie": cookieStr },
    });
    const html = await res.text();
    const bundles = [...html.matchAll(/src="(https:\/\/static\.xx\.fbcdn\.net\/rsrc\.php\/[^"]+\.js)"/g)]
      .map(m => m[1]);

    for (const url of bundles) {
      let js;
      try {
        const r = await fetchWithTimeout(url, { headers: { "User-Agent": cfg.USER_AGENT } });
        js = await r.text();
      } catch { continue; }

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

// ── Video ID extraction ───────────────────────────────────────────────────────

/**
 * Extract video IDs dari HTML (berbagai format Facebook).
 */
function parseVideoIdsFromHtml(html) {
  const ids = [];

  // Pattern 1 (klasik): "video_id":"1234567890"
  for (const m of html.matchAll(/"video_id"\s*:\s*"(\d{10,20})"/g)) ids.push(m[1]);

  // Pattern 2 (camelCase): "videoId":"1234567890"
  for (const m of html.matchAll(/"videoId"\s*:\s*"(\d{10,20})"/g)) ids.push(m[1]);

  // Pattern 3 (angka tanpa quote): "video_id":1234567890
  for (const m of html.matchAll(/"video_id"\s*:\s*(\d{10,20})/g)) ids.push(m[1]);

  // Pattern 4 (escaped JSON): \"video_id\":\"1234567890\"
  for (const m of html.matchAll(/\\"video_id\\"\s*:\s*\\"(\d{10,20})\\"/g)) ids.push(m[1]);

  // Pattern 5: /watch/?v=1234567890
  for (const m of html.matchAll(/\/watch\/\?v=(\d{10,20})/g)) ids.push(m[1]);

  // Pattern 6: "targetFbid":"1234567890"
  for (const m of html.matchAll(/"(?:targetFbid|target_fbid)"\s*:\s*"(\d{10,20})"/g)) ids.push(m[1]);

  return [...new Set(ids)];
}

/**
 * Extract post IDs langsung dari homepage news feed.
 * Untuk mendapat post non-video (text, foto, link) dari beranda.
 * Feedback_id dihitung langsung: base64("feedback:" + postId).
 *
 * commentsEnabled = null → unknown, dicek saat mencoba komentar.
 *
 * @param {string} html - HTML homepage Facebook
 * @returns {Array<{postId, videoId, feedbackId, commentsEnabled, source}>}
 */
function parsePostIdsFromHtml(html) {
  const ids = new Set();

  // top_level_post_id — paling reliabel untuk post di news feed
  for (const m of html.matchAll(/"top_level_post_id"\s*:\s*"(\d{10,20})"/g)) ids.add(m[1]);
  for (const m of html.matchAll(/"top_level_post_id"\s*:\s*(\d{10,20})(?!\d)/g)) ids.add(m[1]);
  for (const m of html.matchAll(/\\"top_level_post_id\\"\s*:\s*\\"(\d{10,20})\\"/g)) ids.add(m[1]);

  // story_fbid sebagai fallback
  for (const m of html.matchAll(/"story_fbid"\s*:\s*"(\d{10,20})"/g)) ids.add(m[1]);
  for (const m of html.matchAll(/"story_fbid"\s*:\s*(\d{10,20})(?!\d)/g)) ids.add(m[1]);

  return [...ids].map(postId => ({
    postId,
    videoId:         null,
    feedbackId:      Buffer.from(`feedback:${postId}`).toString("base64"),
    commentsEnabled: null,   // unknown — dicek saat mencoba comment
    source:          "feed",
  }));
}

// ── Fetch feedback_id untuk video ─────────────────────────────────────────────

/**
 * Ambil feedback_id dari halaman video individu.
 * Sekaligus cek apakah komentar dinonaktifkan (commentsEnabled).
 *
 * @param {string} cookieStr
 * @param {string} videoId
 * @returns {{ videoId, feedbackId, postId, commentsEnabled } | null}
 */
async function fetchVideoFeedbackId(cookieStr, videoId) {
  try {
    const url = `${cfg.API_BASE}/watch/?v=${videoId}`;
    const res  = await fetchWithTimeout(url, {
      headers: { ...basePageHeaders(cfg.WATCH_URL), "Cookie": cookieStr },
    });
    const html = await res.text();

    // ── Pre-check: apakah komentar dinonaktifkan? ─────────────────────────────
    // Sinyal langsung di HTML:
    //   "can_viewer_comment":false  → viewer tidak bisa komentar (disabled)
    //   "comments_disabled":true    → format lama
    //   "comment_policy":"NONE"     → policy disable
    const commentsDisabled =
      html.includes('"can_viewer_comment":false') ||
      html.includes('"comments_disabled":true')   ||
      /"comment_policy"\s*:\s*"(?:NONE|DISABLED|DISALLOW_ALL)"/i.test(html);

    // ── Strategi 1: cari feedback_id langsung ────────────────────────────────
    const fbIdPatterns = [
      /"feedback_id"\s*:\s*"([A-Za-z0-9+/=]{20,})"/g,
      /"feedbackId"\s*:\s*"([A-Za-z0-9+/=]{20,})"/g,
      /\\"feedback_id\\"\s*:\s*\\"([A-Za-z0-9+/=]{20,})\\"/g,
      /\\"feedbackId\\"\s*:\s*\\"([A-Za-z0-9+/=]{20,})\\"/g,
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
            return { videoId, feedbackId, postId, commentsEnabled: !commentsDisabled, source: "video" };
          }
        } catch { /* ignore */ }
      }
    }

    // ── Strategi 2: cari post_id / story_id, compute feedback_id ────────────
    const postIdPatterns = [
      /"post_id"\s*:\s*"(\d{10,20})"/g,
      /"post_id"\s*:\s*(\d{10,20})/g,
      /\\"post_id\\"\s*:\s*\\"(\d{10,20})\\"/g,
      /"story_id"\s*:\s*"(\d{10,20})"/g,
      /"story_id"\s*:\s*(\d{10,20})/g,
      /"top_level_post_id"\s*:\s*"(\d{10,20})"/g,
      /"top_level_post_id"\s*:\s*(\d{10,20})/g,
    ];

    for (const pattern of postIdPatterns) {
      for (const m of html.matchAll(pattern)) {
        const postId     = m[1];
        const feedbackId = Buffer.from(`feedback:${postId}`).toString("base64");
        log("INFO", `[FB] video ${videoId} → post ${postId} (via post_id pattern)`);
        return { videoId, feedbackId, postId, commentsEnabled: !commentsDisabled, source: "video" };
      }
    }

    // ── Strategi 3 (fallback): gunakan videoId sendiri ───────────────────────
    const feedbackIdFallback = Buffer.from(`feedback:${videoId}`).toString("base64");
    log("INFO", `[FB] video ${videoId} → fallback feedback_id dari videoId`);
    return { videoId, feedbackId: feedbackIdFallback, postId: videoId, commentsEnabled: !commentsDisabled, source: "video" };

  } catch (err) {
    log("WARN", `[FB] fetchVideoFeedbackId(${videoId}) error: ${err.message}`);
    return null;
  }
}

// ── Fetch all posts (video + feed + trending) ─────────────────────────────────

/**
 * Ambil daftar post dari berbagai sumber Facebook.
 *
 * Sumber:
 *   1. Video search dengan keyword (postingan video populer)
 *   2. /watch/ (rekomendasi video Watch)
 *   3. /reels/ (Reels khusus)
 *   4. /watch/trending/ (video trending global — NEW)
 *   5. Homepage news feed — video IDs DAN post IDs langsung (feed posts)
 *
 * Post yang commentsEnabled=false (pre-check dari HTML) dibuang sebelum return,
 * sehingga bot tidak buang waktu mencoba post yang pasti gagal.
 *
 * @returns {Array<{postId, videoId, feedbackId, commentsEnabled, source}>}
 */
async function fetchReelPosts(cookieStr, keyword = null) {
  const videoIds = [];
  let homepageHtml = null;

  const kw = keyword ?? cfg.SEARCH_KEYWORDS[Math.floor(Math.random() * cfg.SEARCH_KEYWORDS.length)];

  // Semua sumber diambil paralel
  const sources = [
    { name: "search",    url: `${cfg.API_BASE}/search/videos/?q=${encodeURIComponent(kw)}`, ref: cfg.WATCH_URL },
    { name: "/watch/",   url: cfg.WATCH_URL,                                                 ref: cfg.TOKEN_URL },
    { name: "/reels/",   url: cfg.REELS_URL ?? `${cfg.API_BASE}/reels/`,                    ref: cfg.WATCH_URL },
    { name: "trending",  url: cfg.TRENDING_URL,                                              ref: cfg.WATCH_URL },
    { name: "homepage",  url: cfg.TOKEN_URL,                                                 ref: cfg.TOKEN_URL },
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
    if (sources[i].name === "homepage") homepageHtml = res.value;
  }

  // Deduplicate video IDs, max 20 per batch
  const uniqueVideoIds = [...new Set(videoIds)].slice(0, 20);

  if (uniqueVideoIds.length) {
    log("INFO", `[FB] Fetch feedback_id untuk ${uniqueVideoIds.length} video...`);
  }

  // Fetch feedback_id + commentsEnabled untuk tiap video (max 4 paralel)
  const videoResults = [];
  for (let i = 0; i < uniqueVideoIds.length; i += 4) {
    const batch   = uniqueVideoIds.slice(i, i + 4);
    const fetched = await Promise.all(
      batch.map(vid => fetchVideoFeedbackId(cookieStr, vid))
    );
    for (const r of fetched) {
      if (r) videoResults.push(r);
    }
  }

  // Extract post IDs langsung dari homepage news feed (non-video posts)
  const feedPosts = homepageHtml ? parsePostIdsFromHtml(homepageHtml) : [];
  if (feedPosts.length) {
    log("INFO", `[FB] homepage feed → ${feedPosts.length} post_id (non-video)`);
  }

  // Gabung semua hasil
  const allPosts = [...videoResults, ...feedPosts];

  // Filter: buang post yang PASTI disabled (commentsEnabled === false)
  const disabledCount = allPosts.filter(r => r.commentsEnabled === false).length;
  const candidates    = allPosts.filter(r => r.commentsEnabled !== false);

  if (disabledCount > 0) {
    log("INFO", `[FB] Pre-filter: buang ${disabledCount} post (komentar nonaktif), sisa ${candidates.length} post`);
  } else {
    log("INFO", `[FB] ${candidates.length}/${allPosts.length} post tersedia untuk dikomentari`);
  }

  // Deduplicate by postId (video + feed bisa overlap)
  const seen   = new Set();
  const unique = candidates.filter(r => {
    if (seen.has(r.postId)) return false;
    seen.add(r.postId);
    return true;
  });

  return unique;
}

// ── Post comment ──────────────────────────────────────────────────────────────

/**
 * Post komentar via CometUFICreateCommentMutation.
 *
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

  const res = await fetchWithTimeout(`${cfg.API_BASE}/api/graphql/`, {
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

  const cc = data?.data?.comment_create;
  if (!cc) {
    const errMsg = data?.errors?.length
      ? data.errors.map(e => e.message).join("; ")
      : "comment_create null — komentar tidak terposting";
    throw new Error(`GraphQL: ${errMsg}`);
  }

  // Cek komentar dinonaktifkan (respons dari API)
  const disabled = cc.feedback?.comments_disabled_notice_renderer;
  if (disabled) {
    return { commentId: null, success: false, error: "comments_disabled" };
  }

  const commentId = cc.comment?.id
    ?? cc.comment?.legacy_api_id
    ?? cc.comment?.legacy_fbid
    ?? null;
  return { commentId, success: true };
}

module.exports = { getTokens, discoverCommentDocId, fetchReelPosts, postComment };
