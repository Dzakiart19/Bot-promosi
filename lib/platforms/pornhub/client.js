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

// ── Video Search ──────────────────────────────────────────────────────────────

/**
 * Cari video PornHub berdasarkan keyword.
 * GET /video?search=<keyword>&o=mr&hd=1
 * Parse viewkey dari HTML (pattern: viewkey=<hex>)
 *
 * @param {string} keyword
 * @returns {string[]} array of viewkeys (max SEARCH_LIMIT)
 */
async function searchVideos(keyword) {
  const url = `${cfg.BASE_URL}/video?search=${encodeURIComponent(keyword)}&o=mr&hd=1`;

  // Paksa platform=pc dan gunakan fetchWithCookies agar Cookie header tetap
  // dikirim saat terjadi cross-domain redirect pornhub.com → pornhub.org.
  // Node.js fetch (redirect:"follow") membuang Cookie di lintas domain.
  const res = await fetchWithCookies(url, {
    headers: {
      ...baseHeaders({ "Accept": "text/html,application/xhtml+xml,*/*" }),
      "Cookie": getPcCookies(),
    },
  });

  if (!res.ok) throw new Error(`searchVideos HTTP ${res.status}`);

  const html = await res.text();

  // Extract viewkeys — muncul sebagai viewkey=<hex> atau data-video-vkey="<hex>"
  const seen = new Set();
  const viewkeys = [];

  // Pattern 1: viewkey=6a4be0b7d243d (hex string dalam URL atau JS)
  for (const m of html.matchAll(/viewkey=([a-z0-9]{8,20})/g)) {
    const vk = m[1];
    if (!seen.has(vk)) { seen.add(vk); viewkeys.push(vk); }
    if (viewkeys.length >= cfg.SEARCH_LIMIT) break;
  }

  // Pattern 2: data-video-vkey="<vk>" (HTML attribute)
  if (viewkeys.length < 5) {
    for (const m of html.matchAll(/data-video-vkey="([a-z0-9]{8,20})"/g)) {
      const vk = m[1];
      if (!seen.has(vk)) { seen.add(vk); viewkeys.push(vk); }
      if (viewkeys.length >= cfg.SEARCH_LIMIT) break;
    }
  }

  return viewkeys;
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
  const url = `${cfg.BASE_URL}/view_video.php?viewkey=${viewkey}`;

  const res = await fetchWithCookies(url, {
    headers: {
      ...baseHeaders({ "Accept": "text/html,application/xhtml+xml,*/*" }),
      "Cookie": getPcCookies(),
    },
  });

  if (!res.ok) throw new Error(`fetchVideoDetail HTTP ${res.status} — viewkey ${viewkey}`);

  const html = await res.text();

  // ── Extract XSRF token ─────────────────────────────────────────────────────
  // Pattern: id="xsrfToken" value="<token>"
  let xsrfToken = null;
  const tokenMatch = html.match(/id="xsrfToken"\s+value="([^"]+)"/);
  if (!tokenMatch) {
    // Fallback: token = "<value>" (JS variable di halaman)
    const tokVar = html.match(/token\s*=\s*"(MTc[^"]{20,})"/);
    if (tokVar) xsrfToken = tokVar[1];
  } else {
    xsrfToken = tokenMatch[1];
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

  return { videoId, xsrfToken, title };
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
async function postComment({ videoId, xsrfToken }, viewkey, commentText) {
  const url  = `${cfg.BASE_URL}/api/v1/comment/add`;
  const body = new URLSearchParams({
    token:    xsrfToken,
    video_id: videoId,
    comment:  commentText,
  }).toString();

  const res = await fetchWithTimeout(url, {
    method:  "POST",
    headers: {
      ...baseHeaders({
        "Content-Type":     "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Accept":           "application/json, text/javascript, */*; q=0.01",
        "Referer":          `${cfg.BASE_URL}/view_video.php?viewkey=${viewkey}`,
      }),
    },
    body,
  });

  const bodyText = await res.text();

  if (res.status === 401) {
    throw new Error("Komentar ditolak — cookies expired atau akun tidak valid (401)");
  }

  if (!res.ok) {
    throw new Error(`postComment HTTP ${res.status} — ${bodyText.slice(0, 200)}`);
  }

  let data = null;
  try { data = JSON.parse(bodyText); } catch { /* non-JSON response */ }

  // Response sukses: {success:1,...} atau {comment_id:"..."}
  const isSuccess = data &&
    (data.success === 1 || data.success === true || data.comment_id);

  if (!isSuccess) {
    // Cek pesan error dari response
    const msg = data?.message || data?.error || bodyText.slice(0, 200);
    throw new Error(`postComment API error: ${msg}`);
  }

  const commentId = data?.comment_id || data?.id || null;
  return { success: true, commentId };
}

module.exports = { verifySession, searchVideos, fetchVideoDetail, postComment };
