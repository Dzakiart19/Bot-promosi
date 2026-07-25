/**
 * lib/platforms/threads/client.js
 * HTTP client untuk Threads GraphQL API.
 *
 * Threads menggunakan Meta's Relay-based GraphQL dengan persisted queries (doc_id).
 * Setiap request butuh:
 *   - Cookie: sessionid + csrftoken  (dari login Threads/Instagram)
 *   - LSD token: di-extract dari HTML halaman utama setiap startup
 *   - X-IG-App-Id: 238260118697367  (konstanta untuk semua klien web Threads)
 *
 * doc_id discovery:
 *   Dicoba otomatis dari JS bundle (download halaman → ambil link JS → scan pola).
 *   Fallback ke config.DOC_ID_FALLBACK jika discovery gagal.
 *   Jika keduanya gagal karena Threads update bundle → log warning jelas.
 */

"use strict";

const cfg = require("./config");
const { log } = require("../../core/logger");

let cachedLsd    = null;
let cachedFbDtsg = null;
let cachedDocIds = null;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Parse "sessionid=xxx; csrftoken=yyy" jadi object. */
function parseCookieString(raw) {
  const out = {};
  String(raw || "").split(";").map(p => p.trim()).filter(Boolean).forEach(pair => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  });
  return out;
}

function getCookies() {
  const raw = process.env.THREADS_COOKIES;
  if (!raw) throw new Error("THREADS_COOKIES belum diset (butuh 'sessionid=...; csrftoken=...')");
  const parsed = parseCookieString(raw);
  if (!parsed.sessionid || !parsed.csrftoken) {
    throw new Error("THREADS_COOKIES harus berisi sessionid dan csrftoken");
  }
  // Simpan raw string untuk dikirim utuh ke server (ig_did, mid, dll ikut)
  parsed._raw = raw;
  return parsed;
}

function cookieHeader(cookies) {
  // Kirim seluruh cookie string apa adanya agar ig_did, mid, ds_user_id, dll ikut terkirim
  return cookies._raw || Object.entries(cookies)
    .filter(([k]) => k !== "_raw")
    .map(([k, v]) => `${k}=${v}`).join("; ");
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
 * Ambil halaman Threads dengan cookie auth → kembalikan HTML string.
 * Dipakai untuk extract LSD token + verifikasi session.
 */
async function fetchPage(cookies) {
  const res = await fetchWithTimeout(cfg.PAGE_URL, {
    headers: {
      "User-Agent": cfg.USER_AGENT,
      "Accept":     "text/html,application/xhtml+xml",
      "Cookie":     cookieHeader(cookies),
    },
  });
  if (!res.ok) throw new Error(`Fetch halaman Threads gagal: HTTP ${res.status}`);
  return await res.text();
}

/**
 * Extract LSD token dari HTML halaman Threads.
 * Terdapat di script tag __eqmc: {"u":"...","l":"<TOKEN>","f":null}
 * Fallback: cari pattern "token":"<TOKEN>" di HTML.
 *
 * LSD token wajib disertakan di:
 *   - Field form: lsd=TOKEN
 *   - Header: X-FB-LSD: TOKEN
 */
function extractLsd(html) {
  // Metode 1: script id="__eqmc" — paling andal
  const eqmcMatch = html.match(/<script[^>]+id="__eqmc"[^>]*>(\{[^<]+\})<\/script>/);
  if (eqmcMatch) {
    try {
      const eqmc = JSON.parse(eqmcMatch[1]);
      if (eqmc.l) return eqmc.l;
    } catch { /* lanjut ke metode berikutnya */ }
  }

  // Metode 2: "token":"<value>" dalam inline JSON
  const tokenMatch = html.match(/"token"\s*:\s*"([a-zA-Z0-9_\-]{10,40})"/);
  if (tokenMatch) return tokenMatch[1];

  // Metode 3: cari nilai lsd di hidden input (kadang ada di form)
  const inputMatch = html.match(/name="lsd"\s+value="([^"]+)"/);
  if (inputMatch) return inputMatch[1];

  throw new Error("LSD token tidak ditemukan di HTML Threads — cek apakah sessionid valid");
}

/**
 * Extract fb_dtsg token dari HTML halaman Threads.
 * Diperlukan di request body bersama lsd untuk semua mutasi GraphQL.
 * Pola di halaman: DTSGInitData,[],{"token":"<TOKEN>"}
 *
 * Token Meta bisa mengandung: A-Z a-z 0-9 _ - : + / = (base64-like)
 */
function extractFbDtsg(html) {
  // Metode 1: DTSGInitData JSON — pakai [\s\S] agar bisa lintas baris
  const dtsgMatch = html.match(/DTSGInitData[\s\S]{0,200}?"token"\s*:\s*"([^"]{10,200})"/);
  if (dtsgMatch) return dtsgMatch[1];

  // Metode 2: "dtsg":{"token":"<value>"}
  const dtsgMatch2 = html.match(/"dtsg"\s*:\s*\{[\s\S]{0,100}?"token"\s*:\s*"([^"]{10,200})"/);
  if (dtsgMatch2) return dtsgMatch2[1];

  // Metode 3: fb_dtsg hidden input (form-based halaman lawas)
  const inputMatch = html.match(/name="fb_dtsg"\s+value="([^"]+)"/);
  if (inputMatch) return inputMatch[1];

  // Metode 4: pola token Meta yang lebih panjang (>= 20 char, bukan LSD yang pendek)
  // Karakter Meta token: alphanum + _ - : + / = (base64url / base64 extended)
  const tokenMatch = html.match(/"token"\s*:\s*"([A-Za-z0-9+/=:_\-]{20,200})"/);
  if (tokenMatch) return tokenMatch[1];

  return null; // akan ditangani sebagai warning di getLsd()
}

/**
 * Verifikasi apakah session Threads masih valid.
 * Hanya gagal jika server jelas-jelas mengembalikan halaman login (bukan konten).
 * Catatan: string "/login" bisa muncul di footer halaman manapun — jangan pakai itu.
 */
function verifySession(html) {
  // Tanda pasti redirect ke login: komponen React khusus halaman login
  const isLoginPage =
    html.includes("BarcelonaLoginPage") ||
    html.includes("ThreadsLoginPageRoot") ||
    html.includes('"loginPage"') ||
    // Halaman login meta biasanya sangat pendek (< 5000 char) dan tidak ada JSON besar
    (html.length < 3000 && html.includes("log in"));

  if (isLoginPage) {
    throw new Error("Session Threads tidak valid / expired — login ulang dan update THREADS_COOKIES");
  }

  // Extract userId kalau ada
  const uidMatch = html.match(/"userId":"(\d+)"/) || html.match(/"ig_user_id":"(\d+)"/);
  return { userId: uidMatch ? uidMatch[1] : null };
}

/**
 * Coba discover doc_ids dari JS bundle Threads.
 * Threads memuat queryId via bundle statis di CDN Instagram.
 * Pola di bundle: "doc_id":"<ID>" atau docID:"<ID>".
 *
 * Jika gagal → fallback ke config.DOC_ID_FALLBACK.
 */
async function discoverDocIds(cookies) {
  if (cachedDocIds) return cachedDocIds;

  try {
    const html = await fetchPage(cookies);

    // Ambil daftar link JS bundle dari HTML
    const jsLinks = [...html.matchAll(/src="(https:\/\/static\.cdninstagram\.com\/rsrc\.php\/[^"]+\.js)"/g)]
      .map(m => m[1]);

    for (const jsUrl of jsLinks.slice(0, 5)) {  // cek max 5 bundle
      try {
        const res  = await fetchWithTimeout(jsUrl, { headers: { "User-Agent": cfg.USER_AGENT } });
        if (!res.ok) continue;
        const text = await res.text();

        // Pola doc_id di bundle Meta
        const ids = [
          ...text.matchAll(/"doc_id":"(\d{10,20})"/g),
          ...text.matchAll(/doc_id:"(\d{10,20})"/g),
          ...text.matchAll(/docID:"(\d{10,20})"/g),
        ].map(m => m[1]);

        if (ids.length > 0) {
          // Petakan ke operasi berdasarkan konteks sekitar ID di bundle
          const discovered = {};
          for (const op of Object.keys(cfg.DOC_ID_FALLBACK)) {
            // Cari apakah nama operasi ada di sekitar ID dalam bundle
            const pattern = new RegExp(`${op}[^"]{0,50}"doc_id":"(\\d+)"`);
            const m = text.match(pattern);
            if (m) discovered[op] = m[1];
          }
          if (Object.keys(discovered).length > 0) {
            log("INFO", `[Threads] doc_id discovered: ${JSON.stringify(discovered)}`);
            cachedDocIds = { ...cfg.DOC_ID_FALLBACK, ...discovered };
            return cachedDocIds;
          }
        }
      } catch { /* bundle gagal diunduh, coba berikutnya */ }
    }
  } catch (err) {
    log("WARN", `[Threads] Discovery doc_id gagal (${err.message}), pakai fallback`);
  }

  log("WARN", "[Threads] Pakai doc_id fallback dari config — update jika 'Query not found'");
  cachedDocIds = { ...cfg.DOC_ID_FALLBACK };
  return cachedDocIds;
}

/**
 * Ambil LSD token yang fresh (sekali per proses, atau kalau expired).
 * Sekaligus cache fb_dtsg yang wajib disertakan di semua GraphQL mutation.
 * @param {object} cookies
 * @param {string|null} [htmlCache] — kalau HTML sudah diambil sebelumnya, pakai kembali
 */
async function getLsd(cookies, htmlCache) {
  if (cachedLsd) return cachedLsd;
  const html   = htmlCache || await fetchPage(cookies);
  cachedLsd    = extractLsd(html);
  cachedFbDtsg = extractFbDtsg(html);
  if (cachedFbDtsg) {
    log("INFO", `[Threads] fb_dtsg: ${cachedFbDtsg.slice(0, 20)}… (ok)`);
  } else {
    log("WARN", "[Threads] fb_dtsg tidak ditemukan di HTML — GraphQL mutation mungkin gagal. Pastikan sessionid valid dan cookies lengkap.");
  }
  return cachedLsd;
}

/** Invalidate LSD + fb_dtsg cache (kalau API return HTML / 401 / 403). */
function invalidateLsd() {
  cachedLsd    = null;
  cachedFbDtsg = null;
}

// ── Base headers untuk semua request API ──────────────────────────────────────

function baseHeaders(cookies, lsd) {
  return {
    "Content-Type":      "application/x-www-form-urlencoded",
    "Accept":            "*/*",
    "Accept-Language":   "en-US,en;q=0.9",
    "User-Agent":        cfg.USER_AGENT,
    "Origin":            cfg.ORIGIN,
    "Referer":           cfg.REFERER,
    "Cookie":            cookieHeader(cookies),
    "X-FB-LSD":          lsd,
    "X-CSRFToken":       cookies.csrftoken,
    "X-IG-App-Id":       cfg.APP_ID,
    "X-ASBD-Id":         cfg.ASBD_ID,
    "X-Requested-With":  "XMLHttpRequest",
    "Sec-Fetch-Site":    "same-origin",
    "Sec-Fetch-Mode":    "cors",
    "Sec-Fetch-Dest":    "empty",
  };
}

/** Encode body sebagai application/x-www-form-urlencoded */
function encodeBody(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === "object" ? JSON.stringify(v) : v)}`)
    .join("&");
}

/**
 * Kirim satu GraphQL request ke Threads.
 * @param {object} cookies
 * @param {string} lsd
 * @param {string} docId
 * @param {object} variables
 * @returns {Promise<object>} parsed JSON response
 */
async function graphqlRequest(cookies, lsd, docId, variables) {
  const bodyParams = { lsd, doc_id: docId, variables };
  if (cachedFbDtsg) bodyParams.fb_dtsg = cachedFbDtsg;
  const body = encodeBody(bodyParams);

  const res = await fetchWithTimeout(cfg.API_BASE, {
    method:  "POST",
    headers: baseHeaders(cookies, lsd),
    body,
  });

  const text = await res.text();

  // Kalau response bukan JSON (misal HTML redirect), session mungkin expired
  if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
    invalidateLsd();
    throw new Error(`Response HTML bukan JSON — sessionid mungkin expired. HTTP ${res.status}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Response bukan JSON valid: ${text.slice(0, 200)}`);
  }

  // Tangani error GraphQL
  if (data.errors && data.errors.length > 0) {
    const msgs = data.errors.map(e => e.message).join("; ");
    const isQueryNotFound = /Query not found|not_found/i.test(msgs);
    if (isQueryNotFound) {
      cachedDocIds = null; // reset cache supaya re-discover berikutnya
    }
    throw new Error(`GraphQL error: ${msgs}`);
  }

  return data;
}

// ── API Calls ─────────────────────────────────────────────────────────────────

/**
 * Cari thread berdasarkan keyword.
 * @returns {Promise<Array<{id, text, authorId}>>}
 */
async function searchThreads(cookies, lsd, keyword) {
  const docIds = await discoverDocIds(cookies);
  const variables = {
    query:       keyword,
    first:       cfg.SEARCH_COUNT,
    filter:      "top",
  };

  const data = await graphqlRequest(cookies, lsd, docIds.SearchThreads, variables);

  const results = [];
  // Coba berbagai path response — Threads API bisa berubah struktur
  const edges =
    data?.data?.xdt_api__v1__search__topsearch_connection?.edges ||
    data?.data?.search_results?.edges ||
    data?.data?.edges ||
    [];

  for (const edge of edges) {
    const node = edge?.node;
    if (!node) continue;

    // Thread post
    const postId   = node?.id || node?.pk || node?.thread_id;
    const caption  = node?.thread_items?.[0]?.post?.caption?.text ||
                     node?.caption?.text ||
                     node?.text;
    const authorId = node?.thread_items?.[0]?.post?.user?.id ||
                     node?.user?.id ||
                     node?.author_id;

    if (postId && caption) results.push({ id: String(postId), text: caption, authorId: String(authorId || "") });
  }

  return results;
}

/**
 * Ambil thread dari feed/explore sebagai kandidat komentar.
 * @returns {Promise<Array<{id, text, authorId}>>}
 */
async function getRecommendedPosts(cookies, lsd) {
  const keyword = cfg.SEARCH_KEYWORDS[Math.floor(Math.random() * cfg.SEARCH_KEYWORDS.length)];
  log("INFO", `[Threads] [COMMENT] Cari thread: "${keyword}"`);
  return await searchThreads(cookies, lsd, keyword);
}

/**
 * Buat thread baru (standalone post).
 * @returns {Promise<{id: string}>}
 */
async function createPost(cookies, lsd, text) {
  const docIds = await discoverDocIds(cookies);
  const variables = {
    text,
    media_type:    "TEXT",
    reply_control: "everyone",
    audience:      "EVERYONE",
  };

  const data = await graphqlRequest(cookies, lsd, docIds.CreatePost, variables);

  const postId =
    data?.data?.barcelona_act_on_post?.media?.pk ||
    data?.data?.create_post?.pk ||
    data?.data?.create_thread?.pk ||
    data?.data?.media?.pk ||
    null;

  return { id: postId ? String(postId) : null, raw: data };
}

/**
 * Buat reply/komentar ke thread yang sudah ada.
 * @param {string} parentPostId  — ID thread yang akan dikomentari
 * @returns {Promise<{id: string}>}
 */
async function createReply(cookies, lsd, parentPostId, text) {
  const docIds = await discoverDocIds(cookies);
  const variables = {
    text,
    media_type:        "TEXT",
    reply_control:     "everyone",
    parent_post_id:    parentPostId,
    replied_to_post_id: parentPostId,
  };

  const data = await graphqlRequest(cookies, lsd, docIds.CreateReply, variables);

  const replyId =
    data?.data?.barcelona_act_on_post?.media?.pk ||
    data?.data?.create_reply?.pk ||
    data?.data?.create_thread?.pk ||
    data?.data?.media?.pk ||
    null;

  return { id: replyId ? String(replyId) : null, raw: data };
}

module.exports = {
  getCookies,
  fetchPage,
  extractLsd,
  verifySession,
  getLsd,
  invalidateLsd,
  discoverDocIds,
  searchThreads,
  getRecommendedPosts,
  createPost,
  createReply,
};
