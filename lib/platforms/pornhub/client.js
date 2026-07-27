/**
 * lib/platforms/pornhub/client.js
 * HTTP client untuk PornHub REST API.
 *
 * Recon Juli 2026:
 *   Auth     : cookie session dari browser (PORNHUB_COOKIES env var)
 *   Token    : XSRF token di-inject per halaman di HTML → id="xsrfToken"
 *              Format: base64url(unix_timestamp + random_32_bytes)
 *              Harus fresh per sesi — tidak bisa di-reuse antar request
 *   User ID  : header __m = PORNHUB_USER_ID (dari browser DevTools)
 *
 * Alur comment (dikonfirmasi via recon):
 *   1. GET /video?search=<keyword>&o=mr&hd=1
 *        → parse viewkey dari HTML (pattern: viewkey=<hex>)
 *   2. GET /view_video.php?viewkey=<vk>
 *        → extract video_id (numeric) dari var pageConfig
 *        → extract fresh XSRF token dari id="xsrfToken"
 *   3. POST /api/v1/comment/add
 *        body: token=<xsrf>&video_id=<id>&comment=<text>
 *        → 401 tanpa cookies, 200 dengan cookies valid
 *
 * Domain: pornhub.org (pornhub.com redirect ke sini)
 */

"use strict";

const cfg = require("./config");
const { log } = require("../../core/logger");

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCookies() {
  const cookies = process.env.PORNHUB_COOKIES;
  if (!cookies) throw new Error("PORNHUB_COOKIES belum diset di environment");
  return cookies;
}

/**
 * Cookie versi desktop — ganti platform=mobile → platform=pc.
 * Diperlukan agar search/video endpoint di pornhub.com tidak di-redirect
 * ke pornhub.org mobile yang URL-nya berbeda dan return 404.
 */
function getPcCookies() {
  return getCookies()
    .replace(/\bplatform=mobile\b/g, "platform=pc")
    .replace(/\bhtjf-mobile=\d+\b/g, "");
}

function getUserId() {
  return process.env.PORNHUB_USER_ID || "";
}

function baseHeaders(extraHeaders = {}) {
  const userId = getUserId();
  return {
    "User-Agent":      cfg.USER_AGENT,
    "Origin":          cfg.ORIGIN,
    "Referer":         cfg.REFERER,
    "Cookie":          getCookies(),
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    ...(userId ? { "__m": userId } : {}),
    ...extraHeaders,
  };
}

async function fetchWithTimeout(url, options = {}) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch yang mengikuti redirect secara manual sambil tetap mengirim Cookie.
 * Diperlukan karena Node.js fetch (& browser) membuang header Cookie
 * saat redirect lintas domain (pornhub.com → pornhub.org) demi keamanan.
 * Kita harus explicit carry cookies ke domain tujuan redirect.
 * Max 5 hop untuk cegah infinite redirect.
 */
async function fetchWithCookies(url, options = {}, hops = 0) {
  if (hops > 5) throw new Error("Too many redirects");
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { ...options, redirect: "manual", signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if ((res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308)) {
    const location = res.headers.get("location");
    if (!location) throw new Error("Redirect tanpa Location header");
    const nextUrl = new URL(location, url).toString();
    log("INFO", `[PH] Redirect ${res.status} → ${nextUrl}`);
    return fetchWithCookies(nextUrl, options, hops + 1);
  }
  return res;
}

// ── Auth / Session ────────────────────────────────────────────────────────────

/**
 * Verifikasi cookies masih valid dengan GET halaman utama.
 * Cek: apakah cookies `il` (identity/login) ada dan tidak di-clear oleh server.
 * @returns {{ userId, handle }} info session
 */
async function verifySession() {
  if (!process.env.PORNHUB_COOKIES) {
    throw new Error("PORNHUB_COOKIES belum diset di environment");
  }

  const res = await fetchWithTimeout(`${cfg.BASE_URL}/`, {
    headers: baseHeaders({ "Accept": "text/html,application/xhtml+xml,*/*" }),
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Verifikasi session gagal: HTTP ${res.status}`);
  }

  const html    = await res.text();
  const userId  = getUserId();

  // Cek apakah kita logged in: halaman user punya data spesifik saat login
  const isLoggedIn = html.includes("id=\"userAvatarNavBar\"") ||
                     html.includes("\"isLogged\":true") ||
                     html.includes("isLogged = true") ||
                     // Fallback: cookies 'il' ada (identity/login cookie)
                     (process.env.PORNHUB_COOKIES || "").includes("; il=") ||
                     (process.env.PORNHUB_COOKIES || "").startsWith("il=");

  if (!isLoggedIn) {
    log("WARN", "[PH] Cookies mungkin sudah expired — lanjut coba comment");
  }

  const handleMatch = html.match(/"username"\s*:\s*"([^"]+)"/);
  const handle = handleMatch ? handleMatch[1] : (userId || "unknown");

  return { userId, handle };
}

// ── Video Browse (tanpa keyword/search) ──────────────────────────────────────

/**
 * Ambil video dari halaman browse PornHub tanpa keyword search.
 *
 * Recon Juli 2026:
 *   GET /video?search=... → 404 dari IP datacenter Replit
 *   GET /video?o=mv       → OK (most viewed, tidak pakai search)
 *   GET /video?o=mr       → OK (most recent, tidak pakai search)
 *   GET /recommended      → OK
 *   GET /                 → OK (homepage)
 *
 * Dipilih acak dari 4 URL browse supaya viewkey yang didapat bervariasi.
 *
 * @returns {{ viewkeys: string[], url: string }}
 */
async function browseVideos() {
  // ── Pre-warm: kunjungi homepage pornhub.org sebelum browse/comment ──────────
  // Diperlukan agar reCAPTCHA v3 score cukup tinggi saat POST comment.
  // Tanpa warm-up, server langsung memberi 422 "CAPTCHA Score" karena
  // session terlihat terlalu baru/bot-like.
  // Recon Juli 2026: homepage visit + video page visit → score OK → comment 200.
  try {
    await fetchWithCookies("https://www.pornhub.org/", {
      headers: {
        ...baseHeaders({ "Accept": "text/html,application/xhtml+xml,*/*" }),
        "Cookie": getCookies(),
      },
    });
    log("INFO", "[PH] Pre-warm homepage OK");
  } catch (e) {
    log("WARN", `[PH] Pre-warm homepage gagal (lanjut): ${e.message}`);
  }

  const BROWSE_URLS = [
    `https://www.pornhub.org/video?o=mv`,     // most viewed
    `https://www.pornhub.org/video?o=mr`,     // most recent
    `https://www.pornhub.org/recommended`,    // recommended (butuh login)
    `https://www.pornhub.org/`,               // homepage
  ];

  const url = BROWSE_URLS[Math.floor(Math.random() * BROWSE_URLS.length)];
  log("INFO", `[PH] Browse: ${url}`);

  // Langsung ke pornhub.org — tidak perlu manual redirect dari pornhub.com
  const res = await fetchWithTimeout(url, {
    headers: {
      ...baseHeaders({ "Accept": "text/html,application/xhtml+xml,*/*" }),
      "Cookie": getCookies(),
      "Referer": "https://www.pornhub.org/",
    },
    redirect: "follow",
  });

  if (!res.ok) throw new Error(`browseVideos HTTP ${res.status} (${url})`);

  const html = await res.text();

  const seen     = new Set();
  const viewkeys = [];

  // Pattern 1: viewkey=<hex> dalam URL atau JS
  for (const m of html.matchAll(/viewkey=([a-z0-9]{8,20})/g)) {
    const vk = m[1];
    if (!seen.has(vk)) { seen.add(vk); viewkeys.push(vk); }
    if (viewkeys.length >= cfg.BROWSE_LIMIT) break;
  }

  // Pattern 2: data-video-vkey="<vk>" (HTML attribute)
  if (viewkeys.length < 5) {
    for (const m of html.matchAll(/data-video-vkey="([a-z0-9]{8,20})"/g)) {
      const vk = m[1];
      if (!seen.has(vk)) { seen.add(vk); viewkeys.push(vk); }
      if (viewkeys.length >= cfg.BROWSE_LIMIT) break;
    }
  }

  return { viewkeys, url };
}

// ── Video Detail ──────────────────────────────────────────────────────────────

/**
 * Ambil detail video dari halaman video — extract video_id (numeric) + XSRF token.
 *
 * Recon: video_id muncul sebagai `video_id":487532715` di pageConfig JS,
 * dan sebagai `data-id="487532715"` di elemen DOM.
 * XSRF token muncul sebagai `id="xsrfToken" value="<token>"`.
 *
 * @param {string} viewkey
 * @returns {{ videoId: string, xsrfToken: string, title: string }}
 */
async function fetchVideoDetail(viewkey) {
  // Langsung ke pornhub.org (aktual domain setelah redirect) — konsisten
  // dengan pre-warm dan browse yang juga ke pornhub.org.
  // Ini menghindari redirect pornhub.com→pornhub.org yang bisa membuat
  // reCAPTCHA score turun karena Referer chain tidak konsisten.
  const videoUrl = `https://www.pornhub.org/view_video.php?viewkey=${viewkey}`;

  const res = await fetchWithTimeout(videoUrl, {
    headers: {
      ...baseHeaders({ "Accept": "text/html,application/xhtml+xml,*/*" }),
      "Cookie":   getCookies(),
      "Referer":  "https://www.pornhub.org/",
    },
    redirect: "follow",
  });

  if (!res.ok) throw new Error(`fetchVideoDetail HTTP ${res.status} — viewkey ${viewkey}`);

  const html = await res.text();

  // ── Extract XSRF token ─────────────────────────────────────────────────────
  // pornhub.com: id="xsrfToken" value="<token>"
  // pornhub.org: token ada di query string FORM action dan dalam JSON pageConfig
  //              Form: action="/api/v1/comment/add?id=...&token=<xsrf>"
  //              JSON: "token":"MTc..."
  let xsrfToken = null;

  // Prioritas 1: form action di pornhub.org (paling reliable)
  const formActionMatch = html.match(/action="\/api\/v1\/comment\/add\?[^"]*?token=([^&"]+)/);
  if (formActionMatch) xsrfToken = decodeURIComponent(formActionMatch[1]);

  // Prioritas 2: JSON "token":"MTc..." (pornhub.org pageConfig)
  if (!xsrfToken) {
    const jsonTok = html.match(/"token"\s*:\s*"(MTc[^"]{10,})"/);
    if (jsonTok) xsrfToken = jsonTok[1];
  }

  // Prioritas 3: id="xsrfToken" value="..." (pornhub.com)
  if (!xsrfToken) {
    const hiddenInput = html.match(/id="xsrfToken"\s+value="([^"]+)"/);
    if (hiddenInput) xsrfToken = hiddenInput[1];
  }

  // Prioritas 4: token = "MTc..." (JS variable)
  if (!xsrfToken) {
    const jsVar = html.match(/token\s*=\s*"(MTc[^"]{10,})"/);
    if (jsVar) xsrfToken = jsVar[1];
  }

  if (!xsrfToken) throw new Error(`XSRF token tidak ditemukan di halaman viewkey=${viewkey}`);

  // ── Extract video_id (numeric) ─────────────────────────────────────────────
  // Pattern 1: "video_id":487532715 (dari pageConfig / JS)
  let videoId = null;
  const vidMatch = html.match(/"video_id"\s*:\s*(\d{6,12})/);
  if (vidMatch) videoId = vidMatch[1];

  // Pattern 2: video_id%22%3A487532715 (URL-encoded dalam ad param)
  if (!videoId) {
    const vidEnc = html.match(/video_id%22%3A(\d{6,12})/);
    if (vidEnc) videoId = vidEnc[1];
  }

  if (!videoId) throw new Error(`video_id tidak ditemukan di halaman viewkey=${viewkey}`);

  // ── Extract judul video (untuk log) ───────────────────────────────────────
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1].replace(/ \| Pornhub.*$/i, "").trim() : viewkey;

  return { videoId, xsrfToken, title, pageUrl: videoUrl };
}

// ── Comment ───────────────────────────────────────────────────────────────────

/**
 * Post komentar ke video PornHub.
 *
 * Endpoint: POST /api/v1/comment/add
 * Body (form-encoded): token=<xsrf>&video_id=<id>&comment=<text>
 * Headers: X-Requested-With: XMLHttpRequest (wajib — tanpa ini server jawab HTML)
 *
 * Response saat berhasil: JSON {success: 1, ...} atau {comment_id: ...}
 * Response gagal auth:    JSON [] (array kosong) dengan HTTP 401
 *
 * @param {{ videoId, xsrfToken }} detail — dari fetchVideoDetail()
 * @param {string} viewkey — untuk Referer
 * @param {string} commentText
 * @returns {{ success: boolean, commentId: string|null }}
 */
async function postComment({ videoId, xsrfToken, pageUrl }, viewkey, commentText) {
  // pornhub.com selalu redirect ke pornhub.org.
  // Format API pornhub.org: parameter id/type/vkey/token di QUERY STRING URL,
  // body hanya berisi field "comment".
  // Format pornhub.com lama (video_id+token di body) menghasilkan 401.
  //
  // Recon Juli 2026 dari HTML form action pornhub.org:
  //   POST /api/v1/comment/add?id=<video_id>&type=Video&vkey=<viewkey>&token=<xsrf>
  //   Body: comment=<text>
  //   Origin/Referer: https://www.pornhub.org

  // Deteksi domain dari pageUrl (default ke pornhub.org karena selalu redirect ke sini)
  let baseOrigin = "https://www.pornhub.org";
  if (pageUrl) {
    try {
      const u = new URL(pageUrl);
      baseOrigin = u.origin;
    } catch { /* pakai default */ }
  }
  const videoPageUrl = pageUrl || `${baseOrigin}/view_video.php?viewkey=${viewkey}`;

  const commentApiUrl = `${baseOrigin}/api/v1/comment/add?` + new URLSearchParams({
    id:    videoId,
    type:  "Video",
    vkey:  viewkey,
    token: xsrfToken,
  }).toString();

  const body = new URLSearchParams({ comment: commentText }).toString();

  const res = await fetchWithTimeout(commentApiUrl, {
    method:  "POST",
    headers: {
      ...baseHeaders({
        "Content-Type":     "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Accept":           "application/json, text/javascript, */*; q=0.01",
        "Referer":          videoPageUrl,
        "Origin":           baseOrigin,
        "sec-fetch-site":   "same-origin",
        "sec-fetch-mode":   "cors",
        "sec-fetch-dest":   "empty",
        "sec-ch-ua":        "\"Chromium\";v=\"137\", \"Not/A)Brand\";v=\"24\"",
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": "\"Android\"",
      }),
      "Cookie": getCookies(),
    },
    body,
  });

  const bodyText = await res.text();

  if (res.status === 401) {
    throw new Error("Komentar ditolak — cookies expired atau akun tidak valid (401)");
  }

  if (res.status === 422) {
    // CAPTCHA Score — server deteksi bot. Biasanya terjadi setelah banyak request
    // gagal (401) yang men-flag session. Perlu cooldown panjang agar flag hilang.
    throw new Error("captcha-score — server menolak karena skor bot terlalu rendah (422)");
  }

  if (!res.ok) {
    throw new Error(`postComment HTTP ${res.status} — ${bodyText.slice(0, 200)}`);
  }

  let data = null;
  try { data = JSON.parse(bodyText); } catch { /* non-JSON response */ }

  // Response sukses pornhub.org: {"status":"PASS","statusMessage":"...","id":"<uuid>"}
  // Response sukses pornhub.com lama: {success:1,...} atau {comment_id:"..."}
  const isSuccess = data && (
    data.status === "PASS" ||
    data.success === 1 ||
    data.success === true ||
    data.comment_id ||
    (data.id && typeof data.id === "string" && data.id.includes("-"))  // UUID format
  );

  if (!isSuccess) {
    const msg = data?.statusMessage || data?.message || data?.error || bodyText.slice(0, 200);
    throw new Error(`postComment API error: ${msg}`);
  }

  const commentId = data?.id || data?.comment_id || null;
  return { success: true, commentId };
}

module.exports = { verifySession, browseVideos, fetchVideoDetail, postComment };
