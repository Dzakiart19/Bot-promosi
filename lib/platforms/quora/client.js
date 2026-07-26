/**
 * lib/platforms/quora/client.js
 * Wrapper untuk Quora internal GraphQL API.
 *
 * Quora menggunakan GraphQL di /graphql/gql_para_public dengan dua header kritis:
 *   quora-formkey         : nilai formkey yang di-embed di HTML halaman quora.com
 *   quora-page-creation-time : Unix timestamp (seconds) saat halaman dimuat
 *
 * Formkey di-extract dari HTML dengan getFormkey(cookies):
 *   Pattern: "formkey":"<value>" di dalam window.anon_page_data atau inline script.
 *
 * Queries yang dipakai:
 *   SearchResultsQuery  — search pertanyaan by keyword
 *   AddAnswerMutation   — posting jawaban ke pertanyaan
 *
 * Seluruh request wajib membawa header Cookie dari sesi browser yang valid
 * (env var QUORA_COOKIES). Tanpa cookies valid, Cloudflare menolak request.
 */

"use strict";

const cfg     = require("./config");
const { log } = require("../../core/logger");

// ── Helper fetch ──────────────────────────────────────────────────────────────
async function _fetch(url, opts = {}) {
  const { method = "GET", headers = {}, body, cookies } = opts;

  const reqHeaders = {
    "User-Agent":         cfg.USER_AGENT,
    "Accept":             "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language":    "en-US,en;q=0.9",
    "Accept-Encoding":    "gzip, deflate, br",
    "Connection":         "keep-alive",
    "Sec-Fetch-Dest":     "document",
    "Sec-Fetch-Mode":     "navigate",
    "Sec-Fetch-Site":     "none",
    ...headers,
  };
  if (cookies) reqHeaders["Cookie"] = cookies;

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: reqHeaders,
      body:    body ? JSON.stringify(body) : undefined,
      signal:  ctrl.signal,
      redirect: "follow",
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── GraphQL helper ────────────────────────────────────────────────────────────
async function _gql(cookies, formkey, queryName, variables) {
  const res = await _fetch(cfg.GQL_URL, {
    method:  "POST",
    cookies,
    headers: {
      "Content-Type":             "application/json",
      "Accept":                   "*/*",
      "Origin":                   cfg.BASE_URL,
      "Referer":                  cfg.BASE_URL + "/",
      "Sec-Fetch-Dest":           "empty",
      "Sec-Fetch-Mode":           "cors",
      "Sec-Fetch-Site":           "same-origin",
      "quora-formkey":            formkey,
      "quora-page-creation-time": String(Math.floor(Date.now() / 1000)),
    },
    body: { queryName, variables, extensions: {} },
  });

  let data;
  try { data = await res.json(); } catch { data = {}; }

  if (!res.ok) {
    const msg = data?.errors?.[0]?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  if (data?.errors?.length) {
    throw new Error(data.errors[0].message || "GraphQL error");
  }

  return data?.data ?? data;
}

// ── Formkey ───────────────────────────────────────────────────────────────────

/**
 * Fetch halaman utama quora.com dan extract formkey dari HTML.
 * Formkey ada di beberapa tempat: window.anon_page_data, window.page_data, atau inline script.
 * @param {string} cookies
 * @returns {Promise<string>}
 */
async function getFormkey(cookies) {
  const res = await _fetch(cfg.BASE_URL, {
    cookies,
    headers: {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (res.status === 403) {
    throw new Error("Quora 403 — cookie tidak valid atau sudah expired. Refresh QUORA_COOKIES dari browser.");
  }

  const html = await res.text();

  // Pattern 1: "formkey":"xxxx"
  let m = html.match(/"formkey"\s*:\s*"([a-zA-Z0-9_\-]+)"/);
  if (m) { log("SUCCESS", `[Quora] Formkey OK (pattern 1): ${m[1].slice(0,8)}...`); return m[1]; }

  // Pattern 2: formkey=xxxx dalam inline assignment
  m = html.match(/formkey\s*[=:]\s*['"]([a-zA-Z0-9_\-]+)['"]/);
  if (m) { log("SUCCESS", `[Quora] Formkey OK (pattern 2): ${m[1].slice(0,8)}...`); return m[1]; }

  // Pattern 3: cari di window.__data atau window.anon_page_data
  m = html.match(/window\.(?:anon_page_data|page_data)\s*=\s*({[^<]{0,2000}})/);
  if (m) {
    try {
      const obj = JSON.parse(m[1]);
      if (obj.formkey) {
        log("SUCCESS", `[Quora] Formkey OK (pattern 3): ${obj.formkey.slice(0,8)}...`);
        return obj.formkey;
      }
    } catch {}
  }

  throw new Error("Formkey tidak ditemukan di HTML — kemungkinan cookie tidak valid atau Cloudflare challenge aktif.");
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Cari pertanyaan Quora berdasarkan keyword via HTML search page.
 * Quora search page berisi pertanyaan dalam format HTML — parse URL dan slug.
 * @param {string} cookies
 * @param {string} keyword
 * @returns {Promise<Array<{ qid: string|null, slug: string, url: string, title: string }>>}
 */
async function searchQuestions(cookies, keyword) {
  const url = `${cfg.SEARCH_URL}?q=${encodeURIComponent(keyword)}&type=question`;
  const res  = await _fetch(url, {
    cookies,
    headers: {
      "Accept": "text/html,application/xhtml+xml",
      "Referer": cfg.BASE_URL + "/",
    },
  });

  if (res.status === 403) throw new Error("403 saat search — cookie mungkin expired");
  if (res.status === 302) throw new Error("Redirect ke login — cookie tidak valid");

  const html = await res.text();

  // Extract question URLs dari HTML: href="/What-is-the-best-..."
  const questionPattern = /href="(\/[A-Za-z0-9][A-Za-z0-9\-]{10,200})"/g;
  const seen  = new Set();
  const found = [];

  let match;
  while ((match = questionPattern.exec(html)) !== null) {
    const slug = match[1];
    // Filter: URL harus panjang (pertanyaan Quora), bukan path sistem
    if (
      seen.has(slug) ||
      /^\/(profile|topic|search|login|signup|about|sitemap|policy|help|static)/.test(slug)
    ) continue;

    seen.add(slug);
    found.push({
      qid:   null,                            // akan di-fetch dari halaman pertanyaan
      slug:  slug.replace(/^\//, ""),
      url:   cfg.BASE_URL + slug,
      title: slug.replace(/^\//, "").replace(/-/g, " "),
    });

    if (found.length >= cfg.SEARCH_RESULT_COUNT) break;
  }

  return found;
}

/**
 * Fetch halaman pertanyaan dan extract qid (numeric ID) dari HTML/JSON.
 * @param {string} cookies
 * @param {string} questionUrl
 * @returns {Promise<string|null>} qid sebagai string, atau null jika tidak ditemukan
 */
async function getQuestionId(cookies, questionUrl) {
  const res  = await _fetch(questionUrl, { cookies });
  if (!res.ok) return null;
  const html = await res.text();

  // Pattern: "qid":12345 atau "qid":"12345"
  const m = html.match(/"qid"\s*:\s*"?(\d+)"?/);
  return m ? m[1] : null;
}

// ── Answer ────────────────────────────────────────────────────────────────────

/**
 * Posting jawaban ke pertanyaan Quora via GraphQL AddAnswerMutation.
 * @param {string} cookies
 * @param {string} formkey
 * @param {string} qid       — numeric ID pertanyaan sebagai string
 * @param {string} text      — teks jawaban (markdown)
 * @returns {Promise<{ aid: string }>}
 */
async function postAnswer(cookies, formkey, qid, text) {
  // Quora answer body — format pastedraft (sections + spans)
  const body = {
    sections: [{
      header:  null,
      content: text.split("\n\n").map((para) => ({
        type:  "paragraph",
        spans: [{ text: para.trim(), modifiers: {} }],
      })).filter((p) => p.spans[0].text.length > 0),
    }],
  };

  const data = await _gql(cookies, formkey, "AddAnswerMutation", {
    qid:        parseInt(qid, 10),
    body,
    sourceInfo: null,
    credentialsOrCredentialId: null,
  });

  const aid = data?.addAnswer?.answer?.aid
           ?? data?.answer?.aid
           ?? data?.aid
           ?? null;

  if (!aid) {
    // Kalau mutation berhasil tapi aid tidak ada di response — anggap OK
    log("WARN", "[Quora] Jawaban mungkin terkirim tapi aid tidak di-return. Cek akun manual.");
    return { aid: null };
  }

  return { aid: String(aid) };
}

module.exports = { getFormkey, searchQuestions, getQuestionId, postAnswer };
