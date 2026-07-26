/**
 * lib/platforms/bluesky/client.js
 * Wrapper tipis di atas AT Protocol XRPC Bluesky.
 *
 * Endpoint yang dipakai (semua ke https://bsky.social/xrpc/):
 *   POST com.atproto.server.createSession  — login, dapat did + accessJwt + refreshJwt
 *   POST com.atproto.server.refreshSession — refresh accessJwt (expired ~2 jam)
 *   GET  app.bsky.feed.searchPosts         — cari post by keyword (butuh Bearer)
 *   POST com.atproto.repo.createRecord     — buat post baru / reply ke post
 *
 * Struktur session object yang dipakai di session.js:
 *   { did, handle, accessJwt, refreshJwt, refreshedAt }
 *
 * Reply membutuhkan `reply.root` dan `reply.parent` dengan { uri, cid } dari post target.
 */

"use strict";

const cfg        = require("./config");
const { log }    = require("../../core/logger");

const BASE = cfg.API_BASE;

// ── Helper request ────────────────────────────────────────────────────────────
async function _request(method, lexicon, opts = {}) {
  const { auth, body, params } = opts;

  const headers = {
    "User-Agent":   cfg.USER_AGENT,
    "Accept":       "application/json",
    "Content-Type": "application/json",
    "Origin":       cfg.ORIGIN,
  };
  if (auth) headers["Authorization"] = `Bearer ${auth}`;

  let url = `${BASE}/${lexicon}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    url += `?${qs}`;
  }

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });

    let data;
    try { data = await res.json(); } catch { data = {}; }

    if (!res.ok) {
      const msg = data?.message || data?.error || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.code   = data?.error || "";
      throw err;
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Login ke Bluesky.
 * @param {string} identifier  handle (user.bsky.social) atau email
 * @param {string} password    password atau app password
 * @returns {Promise<{ did, handle, accessJwt, refreshJwt, refreshedAt }>}
 */
async function login(identifier, password) {
  const data = await _request("POST", "com.atproto.server.createSession", {
    body: { identifier, password },
  });
  log("SUCCESS", `[BSky] Login OK — @${data.handle} (${data.did})`);
  return {
    did:         data.did,
    handle:      data.handle,
    accessJwt:   data.accessJwt,
    refreshJwt:  data.refreshJwt,
    refreshedAt: Date.now(),
  };
}

/**
 * Refresh accessJwt sebelum expired (~2 jam).
 * Mutates dan kembalikan session yang diperbarui.
 * @param {{ refreshJwt: string }} session
 * @returns {Promise<session>}
 */
async function refreshSession(session) {
  const data = await _request("POST", "com.atproto.server.refreshSession", {
    auth: session.refreshJwt,
  });
  log("SUCCESS", "[BSky] Token di-refresh ✓");
  session.accessJwt   = data.accessJwt;
  session.refreshJwt  = data.refreshJwt;
  session.refreshedAt = Date.now();
  return session;
}

// ── Feed ──────────────────────────────────────────────────────────────────────

/**
 * Cari post Bluesky berdasarkan keyword.
 * @param {string} accessJwt
 * @param {string} query
 * @returns {Promise<Array<{ uri, cid, authorDid, authorHandle, text }>>}
 */
async function searchPosts(accessJwt, query) {
  const data = await _request("GET", "app.bsky.feed.searchPosts", {
    auth:   accessJwt,
    params: {
      q:     query,
      limit: String(cfg.SEARCH_LIMIT),
      lang:  "en",
      sort:  "latest",
    },
  });

  return (data.posts || []).map((p) => ({
    uri:          p.uri,
    cid:          p.cid,
    authorDid:    p.author?.did    || "",
    authorHandle: p.author?.handle || "",
    text:         p.record?.text   || "",
  }));
}

// ── Create ────────────────────────────────────────────────────────────────────

/**
 * Buat post baru (standalone, tanpa reply).
 * @param {{ did, accessJwt }} session
 * @param {string} text  — maks 300 grapheme
 * @returns {Promise<{ uri, cid }>}
 */
async function createPost(session, text) {
  // Potong di 300 grapheme (safe limit)
  const safeText = [...text].slice(0, 300).join("");

  const record = {
    "$type":     "app.bsky.feed.post",
    text:        safeText,
    createdAt:   new Date().toISOString(),
    // Label konten dewasa agar Bluesky tidak flag sebagai spam tanpa konteks
    labels: {
      "$type": "com.atproto.label.defs#selfLabels",
      values:  [{ val: "sexual" }],
    },
  };

  const data = await _request("POST", "com.atproto.repo.createRecord", {
    auth: session.accessJwt,
    body: {
      repo:       session.did,
      collection: "app.bsky.feed.post",
      record,
    },
  });

  return { uri: data.uri, cid: data.cid };
}

/**
 * Reply ke post target.
 * @param {{ did, accessJwt }} session
 * @param {{ uri: string, cid: string }} target   — post yang mau di-reply
 * @param {string} text  — maks 300 grapheme
 * @returns {Promise<{ uri, cid }>}
 */
async function createReply(session, target, text) {
  const safeText = [...text].slice(0, 300).join("");

  const ref    = { uri: target.uri, cid: target.cid };
  const record = {
    "$type":   "app.bsky.feed.post",
    text:      safeText,
    createdAt: new Date().toISOString(),
    reply: {
      root:   ref,   // root = post asal (bukan reply chain)
      parent: ref,   // parent = post langsung yang di-reply
    },
    labels: {
      "$type": "com.atproto.label.defs#selfLabels",
      values:  [{ val: "sexual" }],
    },
  };

  const data = await _request("POST", "com.atproto.repo.createRecord", {
    auth: session.accessJwt,
    body: {
      repo:       session.did,
      collection: "app.bsky.feed.post",
      record,
    },
  });

  return { uri: data.uri, cid: data.cid };
}

module.exports = { login, refreshSession, searchPosts, createPost, createReply };
