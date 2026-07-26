/**
 * lib/platforms/quora/client.js
 * Wrapper untuk Quora internal GraphQL API.
 *
 * Quora menggunakan Cloudflare Managed Challenge — Node.js fetch diblokir
 * karena TLS fingerprint (JA3/JA4) berbeda dari browser/curl.
 * Solusi: gunakan curl sebagai HTTP transport via child_process.execSync.
 * curl menggunakan OpenSSL yang fingerprint-nya lolos Cloudflare.
 *
 * Formkey ada di inline script: ansFrontendGlobals.earlySettings = {"formkey":"..."}
 *
 * Queries yang dipakai:
 *   SearchResultsQuery  — search pertanyaan by keyword
 *   AddAnswerMutation   — posting jawaban ke pertanyaan
 */

"use strict";

const { spawnSync } = require("child_process");
const cfg           = require("./config");
const { log }       = require("../../core/logger");

// ── curl-based HTTP fetch ─────────────────────────────────────────────────────
// Node.js built-in fetch di-block Cloudflare (TLS fingerprint).
// curl menggunakan OpenSSL stack yang lolos.

/**
 * @param {string} url
 * @param {{ method?, headers?, body?, cookies? }} opts
 * @returns {{ status: number, text: () => string, json: () => any, ok: boolean }}
 */
function _curlFetch(url, opts = {}) {
  const { method = "GET", headers = {}, body, cookies } = opts;

  // spawnSync dengan array args — tidak melalui shell, aman untuk semua karakter
  const curlArgs = [
    "--silent", "--show-error", "--location",
    "--max-time", String(Math.ceil(cfg.REQUEST_TIMEOUT_MS / 1000)),
    "--compressed",
    "--http1.1",
    "-w", "\nHTTP_STATUS:%{http_code}",
    "-X", method,
  ];

  const defaultHeaders = {
    "User-Agent":                  cfg.USER_AGENT,
    "Accept":                      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language":             "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    "sec-ch-ua":                   '"Chromium";v="137", "Not/A)Brand";v="24"',
    "sec-ch-ua-mobile":            "?1",
    "sec-ch-ua-platform":          '"Android"',
    "Upgrade-Insecure-Requests":   "1",
  };

  const allHeaders = { ...defaultHeaders, ...headers };
  for (const [k, v] of Object.entries(allHeaders)) {
    curlArgs.push("-H", `${k}: ${v}`);
  }

  if (cookies) {
    curlArgs.push("-H", `Cookie: ${cookies}`);
  }

  if (body) {
    curlArgs.push("-H", "Content-Type: application/json");
    curlArgs.push("--data-raw", JSON.stringify(body));
  }

  curlArgs.push(url);

  const result = spawnSync("curl", curlArgs, {
    timeout: cfg.REQUEST_TIMEOUT_MS + 5000,
    maxBuffer: 10 * 1024 * 1024,
    encoding: "buffer",
  });

  if (result.error) {
    throw new Error(`curl error: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const errMsg = result.stderr ? result.stderr.toString().trim() : `curl exit ${result.status}`;
    throw new Error(`curl error: ${errMsg}`);
  }

  const raw = result.stdout.toString("utf8");

  // Parse "HTTP_STATUS:NNN" yang diappend curl
  const statusMatch = raw.match(/\nHTTP_STATUS:(\d+)$/);
  const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;
  const responseBody = statusMatch ? raw.slice(0, raw.lastIndexOf("\nHTTP_STATUS:")) : raw;

  return {
    status,
    ok: status >= 200 && status < 300,
    text: () => responseBody,
    json: () => {
      try { return JSON.parse(responseBody); }
      catch { return {}; }
    },
  };
}

// ── GraphQL helper ────────────────────────────────────────────────────────────
function _gql(cookies, formkey, queryName, variables) {
  const res = _curlFetch(cfg.GQL_URL, {
    method: "POST",
    cookies,
    headers: {
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

  const data = res.json();

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
 * Fetch halaman utama quora dan extract formkey dari HTML.
 * Pattern: ansFrontendGlobals.earlySettings = {"formkey":"<value>", ...}
 * @param {string} cookies
 * @returns {string}
 */
function getFormkey(cookies) {
  const res = _curlFetch(cfg.BASE_URL, {
    cookies,
    headers: {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (res.status === 403) {
    throw new Error("Quora 403 — cookie tidak valid atau sudah expired. Refresh QUORA_COOKIES dari browser.");
  }

  if (!res.ok) {
    throw new Error(`Quora HTTP ${res.status} saat fetch homepage.`);
  }

  const html = res.text();

  // Pattern 1: ansFrontendGlobals.earlySettings = {"formkey":"..."}
  let m = html.match(/earlySettings\s*=\s*\{[^}]*"formkey"\s*:\s*"([a-zA-Z0-9_\-]+)"/);
  if (m) { log("SUCCESS", `[Quora] Formkey OK (earlySettings): ${m[1].slice(0,8)}...`); return m[1]; }

  // Pattern 2: "formkey":"xxxx" bare JSON
  m = html.match(/"formkey"\s*:\s*"([a-zA-Z0-9_\-]+)"/);
  if (m) { log("SUCCESS", `[Quora] Formkey OK (pattern 2): ${m[1].slice(0,8)}...`); return m[1]; }

  // Pattern 3: formkey='xxxx' atau formkey="xxxx" dalam JS assignment
  m = html.match(/formkey\s*[=:]\s*['"]([a-zA-Z0-9_\-]+)['"]/);
  if (m) { log("SUCCESS", `[Quora] Formkey OK (pattern 3): ${m[1].slice(0,8)}...`); return m[1]; }

  throw new Error("Formkey tidak ditemukan di HTML — kemungkinan cookie tidak valid atau Cloudflare challenge aktif.");
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Cari pertanyaan Quora berdasarkan keyword via GraphQL SearchResultsQuery.
 * Fallback ke HTML search jika GraphQL gagal.
 * @param {string} cookies
 * @param {string} formkey
 * @param {string} keyword
 * @returns {Array<{ qid: string|null, slug: string, url: string, title: string }>}
 */
function searchQuestions(cookies, formkey, keyword) {
  // Coba GraphQL SearchResultsQuery dulu
  try {
    const data = _gql(cookies, formkey, "SearchResultsListQuery", {
      query:           keyword,
      resultType:      "question",
      after:           null,
      first:           cfg.SEARCH_RESULT_COUNT,
    });

    const edges = data?.searchResults?.edges ?? [];
    const results = [];
    for (const edge of edges) {
      const node = edge?.node?.question ?? edge?.node;
      if (!node) continue;
      const slug  = node.questionUrl || node.url || "";
      const title = node.questionText || node.title || slug;
      const qid   = node.qid ? String(node.qid) : null;
      if (!slug) continue;
      const cleanSlug = slug.replace(/^\//, "").replace(/^https?:\/\/[^/]+\//, "");
      results.push({ qid, slug: cleanSlug, url: cfg.BASE_URL + "/" + cleanSlug, title });
    }
    if (results.length > 0) {
      log("INFO", `[Quora] GraphQL search → ${results.length} pertanyaan`);
      return results;
    }
  } catch (err) {
    log("WARN", `[Quora] GraphQL search gagal (${err.message}) — fallback HTML`);
  }

  // Fallback: HTML search page
  const url = `${cfg.SEARCH_URL}?q=${encodeURIComponent(keyword)}&type=question`;
  const res = _curlFetch(url, {
    cookies,
    headers: {
      "Accept":   "text/html,application/xhtml+xml",
      "Referer":  cfg.BASE_URL + "/",
    },
  });

  if (res.status === 403) throw new Error("403 saat search — cookie mungkin expired");
  if (res.status === 302 || res.status === 301) throw new Error("Redirect ke login — cookie tidak valid");

  const html = res.text();

  // Extract question URLs dari HTML
  const questionPattern = /href="(\/[A-Za-z0-9][A-Za-z0-9\-]{10,200})"/g;
  const seen  = new Set();
  const found = [];
  let match;

  while ((match = questionPattern.exec(html)) !== null) {
    const slug = match[1];
    if (
      seen.has(slug) ||
      /^\/(profile|topic|search|login|signup|about|sitemap|policy|help|static|tag)/.test(slug)
    ) continue;
    seen.add(slug);
    found.push({
      qid:   null,
      slug:  slug.replace(/^\//, ""),
      url:   cfg.BASE_URL + slug,
      title: slug.replace(/^\//, "").replace(/-/g, " "),
    });
    if (found.length >= cfg.SEARCH_RESULT_COUNT) break;
  }

  return found;
}

/**
 * Fetch halaman pertanyaan dan extract qid dari HTML/JSON.
 * @param {string} cookies
 * @param {string} questionUrl
 * @returns {string|null}
 */
function getQuestionId(cookies, questionUrl) {
  const res = _curlFetch(questionUrl, { cookies });
  if (!res.ok) return null;
  const html = res.text();
  const m = html.match(/"qid"\s*:\s*"?(\d+)"?/);
  return m ? m[1] : null;
}

// ── Answer ────────────────────────────────────────────────────────────────────

/**
 * Posting jawaban ke pertanyaan Quora via GraphQL AddAnswerMutation.
 * @param {string} cookies
 * @param {string} formkey
 * @param {string} qid
 * @param {string} text
 * @returns {{ aid: string }}
 */
function postAnswer(cookies, formkey, qid, text) {
  const body = {
    sections: [{
      header:  null,
      content: text.split("\n\n").map((para) => ({
        type:  "paragraph",
        spans: [{ text: para.trim(), modifiers: {} }],
      })).filter((p) => p.spans[0].text.length > 0),
    }],
  };

  const data = _gql(cookies, formkey, "AddAnswerMutation", {
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
    log("WARN", "[Quora] Jawaban mungkin terkirim tapi aid tidak di-return. Cek akun manual.");
    return { aid: null };
  }

  return { aid: String(aid) };
}

module.exports = { getFormkey, searchQuestions, getQuestionId, postAnswer };
