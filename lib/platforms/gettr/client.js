/**
 * lib/platforms/gettr/client.js
 * HTTP client untuk GETTR REST API.
 *
 * Auth flow:
 *   POST /api/u/user/v2/login → dapat {token, userinfo}
 *   Semua request berikutnya pakai header:
 *     x-app-auth: {"user":"username","token":"token"}
 *
 * Endpoint kunci:
 *   GET  /api/u/posts/trends   — trending posts (list ID)
 *   GET  /api/u/post/{id}      — detail satu post
 *   POST /api/u/post           — buat post/komentar (multipart, field "content")
 */

"use strict";

const cfg = require("./config");
const { log } = require("../../core/logger");

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

function baseHeaders(session) {
  const authValue = session
    ? JSON.stringify({ user: session.username, token: session.token })
    : JSON.stringify({ user: null, token: null });

  return {
    "User-Agent":   cfg.USER_AGENT,
    "Origin":       cfg.ORIGIN,
    "Referer":      cfg.REFERER,
    "x-app-auth":   authValue,
    "Content-Type": "application/json",
  };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Login ke GETTR.
 * Prioritas:
 *   1. GETTR_TOKEN + GETTR_USER_ID → bypass login, pakai token langsung (hindari Imperva)
 *   2. GETTR_USERNAME + GETTR_PASSWORD → login via API (mungkin diblokir Imperva dari server)
 * @returns {{ username, token, userId, handle }} session object
 */
async function login() {
  // ── Mode 1: token langsung dari browser (GETTR_TOKEN + GETTR_USER_ID) ────────
  const envToken  = process.env.GETTR_TOKEN;
  const envUserId = process.env.GETTR_USER_ID;
  if (envToken && envUserId) {
    log("INFO", `[GETTR] Pakai token langsung (GETTR_TOKEN) — userId: ${envUserId}`);
    const session = { username: envUserId, token: envToken, userId: envUserId, handle: envUserId };
    // Verifikasi token masih valid dengan hit endpoint profil diri sendiri
    try {
      const res = await fetchWithTimeout(`${cfg.API_BASE}/u/user/${envUserId}?incl=userinfo`, {
        headers: baseHeaders(session),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      log("SUCCESS", `[GETTR] Token valid — @${envUserId}`);
    } catch (err) {
      throw new Error(`Token GETTR tidak valid: ${err.message}`);
    }
    return session;
  }

  // ── Mode 2: login via username + password ─────────────────────────────────────
  const username = process.env.GETTR_USERNAME;
  const password = process.env.GETTR_PASSWORD;
  if (!username || !password) {
    throw new Error("Set GETTR_TOKEN+GETTR_USER_ID atau GETTR_USERNAME+GETTR_PASSWORD di environment");
  }

  const url  = `${cfg.API_BASE}/u/user/v2/login`;
  const body = JSON.stringify({ content: { username: username.toLowerCase(), pwd: password } });

  const res = await fetchWithTimeout(url, {
    method:  "POST",
    headers: {
      "User-Agent":   cfg.USER_AGENT,
      "Origin":       cfg.ORIGIN,
      "Referer":      cfg.REFERER,
      "Content-Type": "application/json",
      "x-app-auth":   '{"user":null,"token":null}',
    },
    body,
  });

  const bodyText = await res.text();
  let data;
  try { data = JSON.parse(bodyText); }
  catch { throw new Error(`Login: respons bukan JSON — ${bodyText.slice(0, 200)}`); }

  if (data?.rc !== "OK" || !data?.result) {
    const emsg = data?.error?.emsg || data?.rc || "unknown";
    throw new Error(`Login GETTR gagal: ${emsg}`);
  }

  const result   = data.result;
  const token    = result.token;
  const userinfo = result.user || result.userinfo || {};
  const userId   = userinfo._id || String(userinfo.uid || "") || username;

  if (!token) throw new Error("Login GETTR: tidak ada token di respons");

  log("INFO", `[GETTR] Login OK — userId: ${userId} (${username})`);
  return { username: userId, token, userId, handle: username };
}

// ── Fetch posts ───────────────────────────────────────────────────────────────

/**
 * Ambil daftar trending posts GETTR.
 * @returns {string[]} array of post IDs
 */
async function fetchTrending(session) {
  const url = `${cfg.API_BASE}/u/posts/trends?max=${cfg.TRENDING_MAX}&offset=0`;
  const res = await fetchWithTimeout(url, { headers: baseHeaders(session) });

  if (!res.ok) throw new Error(`fetchTrending HTTP ${res.status}`);

  const data = await res.json();
  if (data?.rc !== "OK") throw new Error(`fetchTrending API error: ${data?.error?.emsg || data?.rc}`);

  const list = data?.result?.data?.list || [];
  // Tiap item punya activity.pstid = post ID
  const ids = list
    .map((item) => item?.activity?.pstid)
    .filter(Boolean);

  return [...new Set(ids)]; // deduplicate
}

/**
 * Ambil detail satu post dari GETTR.
 * @returns {{ id, uid, txt, cm, lkbpst }} atau null kalau gagal/tidak ada teks
 */
async function fetchPost(session, postId) {
  const url = `${cfg.API_BASE}/u/post/${postId}?incl=poststats%7Cuserinfo`;
  const res = await fetchWithTimeout(url, { headers: baseHeaders(session) });

  if (!res.ok) return null;

  let data;
  try { data = await res.json(); }
  catch { return null; }

  if (data?.rc !== "OK") return null;
  const post = data?.result?.data;
  if (!post) return null;

  return {
    id:      post._id,
    uid:     post.uid,
    txt:     (post.txt || "").trim(),
    cm:      post.cm  || 0,
    lkbpst:  post.lkbpst || 0,
  };
}

/**
 * Ambil beberapa post sekaligus, filter yang punya text.
 * @returns {Array<{id,uid,txt,cm,lkbpst}>}
 */
async function fetchTrendingPosts(session) {
  const ids = await fetchTrending(session);
  log("INFO", `[GETTR] ${ids.length} trending post IDs ditemukan`);

  const posts = [];
  for (const id of ids.slice(0, 30)) { // ambil max 30 untuk dicek
    const post = await fetchPost(session, id);
    if (post && post.txt && post.uid !== session.username) {
      posts.push(post);
    }
  }

  log("INFO", `[GETTR] ${posts.length} post dengan teks berhasil diambil`);
  return posts;
}

// ── Comment ───────────────────────────────────────────────────────────────────

/**
 * Post komentar ke post GETTR.
 * GETTR pakai multipart/form-data, field "content" berisi JSON string.
 * Komentar = post biasa dengan field pid (parent ID).
 *
 * @returns {{ id }} ID komentar baru
 */
async function postComment(session, postId, text) {
  const url = `${cfg.API_BASE}/u/post`;

  // GETTR API butuh JSON body (bukan FormData), field "txt" (bukan "rich_txt"),
  // _t:"cmt" untuk comment, dan uid = userId milik akun kita.
  // Ref recon: Test 2 sukses 200 OK, Test 1 (FormData) dan Test 3 (rich_txt) gagal.
  const body = JSON.stringify({
    content: {
      txt: text,
      pid: postId,
      uid: session.userId,
      _t:  "cmt",
    },
  });

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "User-Agent":   cfg.USER_AGENT,
      "Origin":       cfg.ORIGIN,
      "Referer":      `https://gettr.com/post/${postId}`,
      "x-app-auth":   JSON.stringify({ user: session.username, token: session.token }),
      "Content-Type": "application/json",
    },
    body,
  });

  const bodyText = await res.text();
  let data;
  try { data = JSON.parse(bodyText); }
  catch { throw new Error(`postComment: respons bukan JSON — ${bodyText.slice(0, 200)}`); }

  if (data?.rc !== "OK") {
    const emsg = data?.error?.emsg || data?.error?.code || data?.rc || "unknown";
    throw new Error(`postComment API error: ${emsg}`);
  }

  const newId = data?.result?.data?._id || data?.result?._id || null;
  return { id: newId };
}

/**
 * Buat post mandiri (tanpa reply/komentar) — untuk auto-post.
 */
async function createPost(session, text) {
  const url = `${cfg.API_BASE}/u/post`;

  // Sama seperti postComment — pakai JSON body, uid wajib ada.
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "User-Agent":   cfg.USER_AGENT,
      "Origin":       cfg.ORIGIN,
      "Referer":      cfg.REFERER,
      "x-app-auth":   JSON.stringify({ user: session.username, token: session.token }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: { txt: text, uid: session.userId, _t: "post" } }),
  });

  const bodyText = await res.text();
  let data;
  try { data = JSON.parse(bodyText); }
  catch { throw new Error(`createPost: respons bukan JSON — ${bodyText.slice(0, 200)}`); }

  if (data?.rc !== "OK") {
    const emsg = data?.error?.emsg || data?.error?.code || data?.rc || "unknown";
    throw new Error(`createPost API error: ${emsg}`);
  }

  const newId = data?.result?.data?._id || data?.result?._id || null;
  return { id: newId };
}

module.exports = { login, fetchTrending, fetchPost, fetchTrendingPosts, postComment, createPost };
