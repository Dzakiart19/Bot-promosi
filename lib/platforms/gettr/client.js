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

/** Decode JWT payload (base64url) tanpa verifikasi signature. */
function decodeJwtPayload(token) {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch { return null; }
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
    // Decode JWT untuk dapat username (handle string), bukan numeric userId
    const jwtPayload = decodeJwtPayload(envToken);
    const handle = jwtPayload?.username || envUserId;
    log("INFO", `[GETTR] Pakai token langsung (GETTR_TOKEN) — userId: ${envUserId}, handle: @${handle}`);
    // username di x-app-auth pakai numeric userId (sesuai request browser asli)
    const session = { username: envUserId, token: envToken, userId: envUserId, handle };
    // Verifikasi ringan: pastikan API GETTR dapat dijangkau (endpoint publik)
    try {
      const res = await fetchWithTimeout(`${cfg.API_BASE}/u/posts/trends?max=1&offset=0`, {
        headers: baseHeaders(session),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      log("SUCCESS", `[GETTR] Token diterima — @${handle}, API OK`);
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
    cm:      post.cm     || 0,
    lkbpst:  post.lkbpst || 0,
    pid:     post.pid    || null,   // null = root post; non-null = reply (jangan dikomentari)
  };
}

/**
 * Ambil trending posts dengan strategi dua-lapis mirip X Bot:
 *
 *   Lapis 1 (PRIORITAS): post yang mengandung SEARCH_KEYWORDS → dikomentari duluan.
 *   Lapis 2 (FALLBACK):  post mana saja di trending yang bukan dari BLOCKED_ACCOUNTS
 *                        → dikomentari jika lapis 1 kosong, mirip COMMENT mode X Bot
 *                        yang mengambil home timeline tanpa filter keyword.
 *
 * Bug fix: perbandingan uid memakai session.handle (handle alfanumerik "celadini"),
 * bukan session.username (numeric "278750417826824192") yang tidak pernah cocok.
 *
 * Search API GETTR tidak berfungsi server-side (selalu "Content Not Found"),
 * sehingga source-nya adalah trending posts, bukan SearchTimeline seperti X Bot.
 *
 * @returns {Array<{id,uid,txt,cm,lkbpst,_priority}>}
 */
async function fetchTrendingPosts(session) {
  const ids = await fetchTrending(session);
  log("INFO", `[GETTR] ${ids.length} trending post IDs ditemukan`);

  // Ambil semua post dengan teks (bukan milik akun sendiri, bukan dari blocked accounts)
  const blockedSet = new Set((cfg.BLOCKED_ACCOUNTS || []).map((a) => a.toLowerCase()));
  const posts = [];
  for (const id of ids) {
    const post = await fetchPost(session, id);
    if (
      post &&
      post.txt &&
      post.pid === null &&                                     // hanya root post (bukan reply)
      !/^\d+$/.test(String(post.uid || "")) &&                // uid bukan pure-numeric (repost/corrupt)
      post.uid !== session.handle &&                          // bukan akun bot sendiri
      !blockedSet.has((post.uid || "").toLowerCase())         // bukan akun politik/blocked
    ) {
      posts.push(post);
    }
  }

  log("INFO", `[GETTR] ${posts.length} post kandidat (setelah filter blocked accounts)`);

  // ── Lapis 1: keyword match (prioritas) ────────────────────────────────────
  const keywords = cfg.SEARCH_KEYWORDS.map((k) => k.toLowerCase());
  const relevant = posts.filter((p) => {
    const txt = p.txt.toLowerCase();
    return keywords.some((kw) => txt.includes(kw));
  });

  if (relevant.length > 0) {
    log("INFO", `[GETTR] ✓ ${relevant.length} post cocok keyword — komentar prioritas`);
    return relevant.map((p) => ({ ...p, _priority: true }));
  }

  // ── Lapis 2: fallback — komentar ke post umum non-politik (mirip COMMENT X Bot) ──
  if (posts.length > 0) {
    log("INFO", `[GETTR] Tidak ada keyword match — fallback ke ${posts.length} post umum non-politik`);
    return posts.map((p) => ({ ...p, _priority: false }));
  }

  log("INFO", `[GETTR] Trending GETTR kosong atau semua post dari akun blocked`);
  return [];
}

// ── Comment ───────────────────────────────────────────────────────────────────

/**
 * Ambil komentar pertama (format c37p...) dari sebuah post.
 * Dipakai sebagai "pintu masuk" untuk membuat komentar yang benar-benar
 * muncul di thread post tersebut.
 *
 * @returns {string|null} ID komentar pertama (c37p...), atau null jika tidak ada
 */
async function fetchFirstComment(session, postId) {
  const url = `${cfg.API_BASE}/u/post/${postId}/comments?max=5&offset=0`;
  try {
    const res = await fetchWithTimeout(url, { headers: baseHeaders(session) });
    if (!res.ok) return null;
    const data = await res.json();
    const list = data?.result?.data?.list || [];
    // Hanya ambil comment format c37p... (bukan p426... / post biasa)
    const first = list.find((c) => c._id && c._id.startsWith("c37p"));
    return first?._id || null;
  } catch { return null; }
}

/**
 * Post komentar yang BENAR-BENAR muncul di thread sebuah post GETTR.
 *
 * Penemuan kritis:
 *   - POST /api/u/post/{postId}/comment → selalu 400 "parent postId != null"
 *     untuk semua post (p426... format), bahkan post root tanpa pid.
 *     GETTR tidak mengizinkan endpoint ini pada post langsung.
 *   - POST /api/u/post/{commentId}/comment → BERHASIL (HTTP 200) ketika
 *     target adalah komentar bestawi (c37p... format). Menghasilkan c37p...
 *     ID baru yang muncul sebagai reply di thread.
 *
 * Strategi dua-lapis:
 *   1. (PRIORITAS) Ambil komentar pertama (c37p...) dari post target,
 *      lalu reply ke komentar itu → comment muncul di thread post asli ✓
 *   2. (FALLBACK) Jika post belum punya komentar, pakai /u/post + pid di body
 *      → hanya muncul di tab Replies profil, tidak di bawah post target.
 *
 * @returns {{ id, strategy }} ID komentar baru dan strategi yang dipakai
 */
async function postComment(session, postId, text) {
  // ── Strategi 1: reply ke komentar pertama yang ada ────────────────────────
  const firstCommentId = await fetchFirstComment(session, postId);

  if (firstCommentId) {
    const url  = `${cfg.API_BASE}/u/post/${firstCommentId}/comment`;
    const body = JSON.stringify({
      content: {
        txt: text,
        uid: session.username,
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
    const data = await res.json().catch(() => null);
    if (data?.rc === "OK") {
      const newId = data?.result?.data?._id || null;
      return { id: newId, strategy: "thread-reply" };
    }
    // Jika gagal, lanjut ke fallback
  }

  // ── Strategi 2 (fallback): /u/post + pid di body ─────────────────────────
  // Muncul di tab Replies profil akun bot, tapi tidak di bawah post target.
  const url  = `${cfg.API_BASE}/u/post`;
  const body = JSON.stringify({
    content: {
      txt: text,
      uid: session.username,
      _t:  "cmt",
      pid: postId,
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
  return { id: newId, strategy: "profile-reply" };
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
