/**
 * lib/platforms/xnxx/client.js
 * HTTP client untuk XNXX.COM auto-comment.
 *
 * Recon Juli 2026:
 *   Auth      : ANONIM — tidak butuh akun (allow_anonymous: true ✓)
 *   Session   : cookie session_token (otomatis di-set server saat GET halaman)
 *   Captcha   : FriendlyCaptcha v1 SHA-256 PoW (solved server-side)
 *   CSRF token: dari GET /threads/video-comments/get-posts/{videoId}
 *
 * Alur comment:
 *   1. browseVideos()       → GET /search/{keyword}/{page} → slug[]
 *   2. fetchVideoDetail()   → GET /video-XXXX/title → { videoId, slug, title }
 *   3. getCommentForm()     → GET /threads/video-comments/get-posts/{videoId}
 *                             → { csrfToken, captchaField }
 *   4. solveFriendlyCaptcha() → GET puzzle → solve SHA-256 PoW → solution string
 *   5. postComment()        → POST /threads/video-comments/post/{videoId}/0
 */

"use strict";

const crypto = require("crypto");
const cfg    = require("./config");
const { log } = require("../../core/logger");

// ── Cookie jar (in-memory, shared across requests in a process) ───────────────
// session_token wajib dikirim ulang tiap request agar server mengenali sesi.
const cookieJar = new Map();   // domain → Map(name → value)

function storeCookies(domain, setCookieHeaders) {
  if (!setCookieHeaders) return;
  const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  if (!cookieJar.has(domain)) cookieJar.set(domain, new Map());
  const jar = cookieJar.get(domain);
  for (const hdr of arr) {
    // Tiap hdr bisa berisi satu Set-Cookie header value
    // Format: "name=value; Path=/; Domain=...; HttpOnly"
    const pair = hdr.split(";")[0].trim();
    const eq   = pair.indexOf("=");
    if (eq < 0) continue;
    const name  = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name) jar.set(name, value);
  }
}

function getCookieHeader(domain) {
  if (!cookieJar.has(domain)) return "";
  const jar = cookieJar.get(domain);
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, options = {}) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.REQUEST_TIMEOUT_MS);
  try {
    const domain = new URL(url).hostname;
    const cookieHdr = getCookieHeader(domain);
    const headers   = {
      "User-Agent":      cfg.USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
      ...(cookieHdr ? { "Cookie": cookieHdr } : {}),
      ...(options.headers || {}),
    };
    const res = await fetch(url, { ...options, headers, signal: ctrl.signal });
    // Save ALL cookies from response (getSetCookie returns array of all Set-Cookie headers)
    const allCookies = typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
    if (allCookies.length) storeCookies(domain, allCookies);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── FriendlyCaptcha v1 SHA-256 PoW solver ────────────────────────────────────
//
// Format puzzle dari API:
//   puzzleString = "{hex_state_id_32chars}.{base64_data_32bytes}"
//
// Decoded base64 (32 bytes):
//   data[0:8]   = signature (8 bytes) — input prefix untuk SHA-256
//   data[12]    = n (jumlah solusi dibutuhkan; 0 → anggap 1)
//   data[28:32] = threshold (uint32 big-endian)
//
// Algoritma solve (dari friendly-pow v1 source):
//   hash_input = signature (8 bytes) + nonce (uint64 big-endian, 8 bytes) = 16 bytes
//   condition : SHA256(hash_input)[0:4] as uint32 <= threshold
//   nonce     : mulai dari 0, increment sampai kondisi terpenuhi
//
// Final answer: "{puzzleString}.{base64(nonce1_uint64_be || ...)}"
//
// Ref: github.com/FriendlyCaptcha/friendly-pow — solvePuzzle()

async function solveFriendlyCaptcha() {
  // ── 1. Ambil puzzle dari API ───────────────────────────────────────────────
  const puzzleUrl = `${cfg.FC_PUZZLE_URL}?sitekey=${cfg.FC_SITEKEY}&accountid=empty`;
  const res = await fetchWithTimeout(puzzleUrl, {
    headers: {
      "Accept":  "application/json",
      "Origin":  cfg.ORIGIN,
      "Referer": cfg.REFERER,
    },
  });
  if (!res.ok) throw new Error(`FC puzzle API HTTP ${res.status}`);
  const data = await res.json();
  if (!data.success || !data.data?.puzzle) throw new Error("FC puzzle API: no puzzle in response");

  const puzzleString = data.data.puzzle;              // "hexId.base64data"
  const dotIdx       = puzzleString.indexOf(".");
  if (dotIdx < 0) throw new Error("FC puzzle: format tidak dikenali (tidak ada titik)");
  const base64Part   = puzzleString.slice(dotIdx + 1);
  const puzzleBuf    = Buffer.from(base64Part, "base64");

  if (puzzleBuf.length < 32) throw new Error(`FC puzzle terlalu pendek: ${puzzleBuf.length} bytes`);

  // Parse fields
  const signature    = puzzleBuf.slice(0, 8);         // 8 bytes — prefix untuk hash
  const n            = puzzleBuf[12] || 1;            // jumlah solusi (biasanya 1)
  const threshold    = puzzleBuf.readUInt32BE(28);    // max nilai 4 byte pertama SHA256

  log("INFO", `[XNXX] FC puzzle: n=${n} threshold=0x${threshold.toString(16).padStart(8,"0")} (~${(threshold/0xFFFFFFFF*100).toFixed(1)}% nonces pass)`);

  // ── 2. Solve: cari nonce untuk setiap solusi ───────────────────────────────
  // hash_input = signature (8 bytes) + nonce (uint64 BE, 8 bytes) = 16 bytes total
  const solutions = Buffer.alloc(n * 8);   // tiap solusi 8 bytes (uint64 BE)
  const hashInput = Buffer.alloc(16);
  signature.copy(hashInput, 0);            // bytes 0-7 = signature (tetap)

  for (let s = 0; s < n; s++) {
    let found = false;
    let nonce = 0;
    const MAX_NONCE = 0x7FFFFFFF;          // 2 miliar cukup

    while (nonce <= MAX_NONCE) {
      // Tulis nonce sebagai uint64 big-endian ke bytes 8-15
      hashInput.writeUInt32BE(0, 8);       // hi 32-bit = 0
      hashInput.writeUInt32BE(nonce, 12);  // lo 32-bit = nonce

      const hash   = crypto.createHash("sha256").update(hashInput).digest();
      const prefix = hash.readUInt32BE(0);

      if (prefix <= threshold) {
        hashInput.copy(solutions, s * 8, 8, 16);  // simpan nonce bytes 8-15 (8 bytes)
        log("INFO", `[XNXX] FC solution[${s}]: nonce=${nonce} (${nonce+1} tries)`);
        found = true;
        break;
      }
      nonce++;
      // Yield setiap 100k agar event loop tidak ter-block
      if (nonce % 100_000 === 0) await new Promise(r => setImmediate(r));
    }

    if (!found) throw new Error(`FC PoW: solusi tidak ditemukan setelah ${MAX_NONCE} iterasi`);
  }

  // ── 3. Encode solusi ────────────────────────────────────────────────────────
  // Dari friendly-pow source: getPuzzleSolution(puzzle, solutions)
  //   return puzzle.base64 + '.' + toBase64(allSolutions)
  // puzzle.base64 = hanya bagian base64 (TANPA hex stateId prefix!)
  // Format: "{base64Data}.{base64Solutions}"  — bukan "{stateId}.{base64Data}.{..."
  const solutionB64 = solutions.toString("base64");
  const finalToken  = `${base64Part}.${solutionB64}`;
  log("INFO", `[XNXX] FC solved → token length ${finalToken.length}`);
  return finalToken;
}

// ── Browse videos ─────────────────────────────────────────────────────────────

/**
 * Ambil daftar slug video dari halaman search.
 * Pattern slug: /video-XXXXX/judul (diambil dari href)
 *
 * @param {string} keyword
 * @param {number} page
 * @returns {{ slugs: string[], url: string }}
 */
async function browseVideos(keyword = "sexy", page = 1) {
  const url = `${cfg.BASE_URL}/search/${encodeURIComponent(keyword)}/${page}`;
  log("INFO", `[XNXX] Browse: ${url}`);

  const res = await fetchWithTimeout(url, {
    headers: {
      "Accept":  "text/html,application/xhtml+xml,*/*",
      "Referer": cfg.REFERER,
    },
  });

  if (!res.ok) throw new Error(`browseVideos HTTP ${res.status} (${url})`);

  const html  = await res.text();
  const seen  = new Set();
  const slugs = [];

  // Pattern: href="/video-XXXXX/judul"
  for (const m of html.matchAll(/href="(\/video-[a-z0-9]+\/[^"]{3,120})"/g)) {
    const slug = m[1];
    if (!seen.has(slug)) {
      seen.add(slug);
      slugs.push(slug);
    }
    if (slugs.length >= cfg.BROWSE_LIMIT) break;
  }

  return { slugs, url };
}

// ── Video detail ──────────────────────────────────────────────────────────────

/**
 * Fetch halaman video, extract numeric video ID dari window.xv.conf.dyn.id
 *
 * @param {string} slug  — e.g. "/video-ym89l60/title"
 * @returns {{ videoId: string, slug: string, title: string }}
 */
async function fetchVideoDetail(slug) {
  const url = `${cfg.BASE_URL}${slug}`;

  const res = await fetchWithTimeout(url, {
    headers: {
      "Accept":  "text/html,application/xhtml+xml,*/*",
      "Referer": cfg.BASE_URL + "/",
    },
  });

  if (!res.ok) throw new Error(`fetchVideoDetail HTTP ${res.status} — ${slug}`);

  const html = await res.text();

  // Extract numeric video ID dari xv.conf.dyn.id
  const idMatch = html.match(/"id"\s*:\s*(\d{6,12})/);
  if (!idMatch) throw new Error(`video_id tidak ditemukan di halaman ${slug}`);
  const videoId = idMatch[1];

  // Extract judul
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch
    ? titleMatch[1].replace(/\s*-\s*XNXX\.COM\s*$/i, "").trim()
    : slug;

  return { videoId, slug, title };
}

// ── Comment form (CSRF token + captcha field) ─────────────────────────────────

/**
 * Ambil CSRF token + nama field captcha dengan cara POST ke endpoint komentar
 * (tanpa body yang valid). Server akan mengembalikan form dengan CSRF yang
 * valid untuk session saat ini.
 *
 * Dua tahap:
 *  1. GET /threads/video-comments/get-posts/{videoId}  — validasi can_post + ambil captcha field
 *  2. POST /threads/video-comments/post/{videoId}/0    — ambil CSRF token yang sah
 *
 * @param {string} videoId
 * @param {string} slug   — untuk Referer
 * @returns {{ csrfToken: string, captchaField: string }}
 */
async function getCommentForm(videoId, slug) {
  const referer = `${cfg.BASE_URL}${slug}`;

  // ── Tahap 1: GET get-posts → validasi can_post + captcha field name ─────────
  const getUrl = `${cfg.BASE_URL}/threads/video-comments/get-posts/${videoId}`;
  const getRes = await fetchWithTimeout(getUrl, {
    headers: {
      "Accept":           "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      "Referer":          referer,
      "Origin":           cfg.ORIGIN,
    },
  });

  if (!getRes.ok) throw new Error(`getCommentForm GET HTTP ${getRes.status}`);

  let getParsed;
  try { getParsed = await getRes.json(); } catch { throw new Error("getCommentForm GET: bukan JSON"); }

  if (getParsed.allow_anonymous === false) {
    throw new Error(`allow_anonymous=false untuk videoId=${videoId}`);
  }
  if (getParsed.can_post === false) {
    throw new Error(`can_post=false untuk videoId=${videoId}`);
  }

  // Extract captcha field name dari form
  const getForm = getParsed.form || "";
  let captchaField = null;
  const captchaNameMatch = getForm.match(/name="(post\[fc-[a-z0-9-]+\])"/);
  if (captchaNameMatch) {
    captchaField = captchaNameMatch[1];
  } else {
    const captchaIdMatch = getForm.match(/id="(post_fc-[a-z0-9-]+)"/);
    if (captchaIdMatch) {
      captchaField = `post[${captchaIdMatch[1].replace(/^post_/, "")}]`;
    }
  }
  if (!captchaField) throw new Error(`captcha field tidak ditemukan di form videoId=${videoId}`);

  // ── Tahap 2: POST ke comment endpoint → ambil CSRF yang sah untuk session ───
  // Kirim body minimal tanpa csrf agar server return form dengan CSRF segar.
  const postUrl = `${cfg.BASE_URL}/threads/video-comments/post/${videoId}/0`;
  const initBody = new URLSearchParams({ "post[text]": "." }).toString();

  const initRes = await fetchWithTimeout(postUrl, {
    method:  "POST",
    headers: {
      "Content-Type":     "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Accept":           "application/json, text/javascript, */*; q=0.01",
      "Referer":          referer,
      "Origin":           cfg.ORIGIN,
      "sec-fetch-site":   "same-origin",
      "sec-fetch-mode":   "cors",
      "sec-fetch-dest":   "empty",
    },
    body: initBody,
  });

  const initText = await initRes.text();
  let initParsed = null;
  try { initParsed = JSON.parse(initText); } catch { /* ignore */ }

  const initForm = initParsed?.form || "";

  // Extract csrf_token dari form yang dikembalikan
  let csrfToken = null;
  // Pattern 1: value="..." name="post[csrf_token]"
  const cm1 = initForm.match(/value="([^"]{20,})"[^>]*name="post\[csrf_token\]"/);
  // Pattern 2: name="post[csrf_token]" ... value="..."
  const cm2 = initForm.match(/name="post\[csrf_token\]"[^>]*value="([^"]+)"/);
  // Pattern 3: id="post_csrf_token" ... value="..."
  const cm3 = initForm.match(/id="post_csrf_token"[^>]*value="([^"]+)"/);
  csrfToken = (cm1 && cm1[1]) || (cm2 && cm2[1]) || (cm3 && cm3[1]) || null;

  // Jika CSRF dari POST initRes kosong / tidak ada, coba dari GET form
  if (!csrfToken) {
    const gc1 = getForm.match(/value="([^"]{20,})"[^>]*name="post\[csrf_token\]"/);
    const gc2 = getForm.match(/name="post\[csrf_token\]"[^>]*value="([^"]+)"/);
    csrfToken = (gc1 && gc1[1]) || (gc2 && gc2[1]) || null;
  }

  if (!csrfToken) {
    throw new Error(`csrf_token tidak ditemukan (videoId=${videoId}). initForm: ${initForm.slice(0, 300)}`);
  }

  // Update captcha field jika form POST memberikan nama baru
  const postCaptchaMatch = initForm.match(/name="(post\[fc-[a-z0-9-]+\])"/);
  if (postCaptchaMatch) captchaField = postCaptchaMatch[1];

  return { csrfToken, captchaField };
}

// ── Post comment ──────────────────────────────────────────────────────────────

/**
 * POST komentar ke video XNXX secara anonymous.
 *
 * Endpoint: POST /threads/video-comments/post/{videoId}/0
 * Body (form-encoded):
 *   post[csrf_token]     = csrfToken (dari getCommentForm)
 *   post[user]           = "" (anonymous — opsional, kosongkan)
 *   post[text]           = commentText
 *   post[fc-XXXX]        = FC PoW solution (dari solveFriendlyCaptcha)
 *
 * Response sukses: { result: true, ... }
 * Response gagal captcha: { result: false, code: 50, form: "..." }
 *
 * @param {object} detail — { videoId, slug, title }
 * @param {string} commentText
 * @returns {{ success: boolean, commentId: string|null }}
 */
async function postComment(detail, commentText) {
  const { videoId, slug } = detail;
  const referer = `${cfg.BASE_URL}${slug}`;

  // ── 1. Ambil CSRF token + nama field captcha ──────────────────────────────
  log("INFO", `[XNXX] Ambil comment form untuk video ${videoId}...`);
  const { csrfToken, captchaField } = await getCommentForm(videoId, slug);
  log("INFO", `[XNXX] CSRF OK | captcha field: ${captchaField}`);

  // ── 2. Solve FriendlyCaptcha PoW ──────────────────────────────────────────
  log("INFO", `[XNXX] Solving FriendlyCaptcha PoW...`);
  const fcSolution = await solveFriendlyCaptcha();

  // ── 3. POST comment ────────────────────────────────────────────────────────
  const endpoint = `${cfg.BASE_URL}/threads/video-comments/post/${videoId}/0`;

  const body = new URLSearchParams({
    "post[csrf_token]": csrfToken,
    "post[user]":       "",             // anonymous
    "post[text]":       commentText,
    [captchaField]:     fcSolution,
  }).toString();

  const res = await fetchWithTimeout(endpoint, {
    method:  "POST",
    headers: {
      "Content-Type":     "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Accept":           "application/json, text/javascript, */*; q=0.01",
      "Referer":          referer,
      "Origin":           cfg.ORIGIN,
      "sec-fetch-site":   "same-origin",
      "sec-fetch-mode":   "cors",
      "sec-fetch-dest":   "empty",
    },
    body,
  });

  const bodyText = await res.text();

  if (!res.ok) throw new Error(`postComment HTTP ${res.status} — ${bodyText.slice(0, 200)}`);

  let data = null;
  try { data = JSON.parse(bodyText); } catch { /* non-JSON */ }

  if (!data) throw new Error(`postComment: respons bukan JSON — ${bodyText.slice(0, 200)}`);

  if (data.result === true) {
    const commentId = data.id || data.post_id || data.comment_id || null;
    return { success: true, commentId };
  }

  // Gagal — cek pesan error
  const errMsg = data.message || data.error || data.statusMessage || JSON.stringify(data).slice(0, 200);

  // Captcha gagal (code 50)
  if (data.code === 50 || /captcha/i.test(errMsg)) {
    throw new Error(`captcha-failed — ${errMsg}`);
  }

  throw new Error(`postComment API error: ${errMsg}`);
}

module.exports = { browseVideos, fetchVideoDetail, getCommentForm, postComment };
