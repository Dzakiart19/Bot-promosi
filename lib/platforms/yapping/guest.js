/**
 * lib/platforms/yapping/guest.js
 * Membuat sesi guest di Yapping.
 *
 * Flow (reverse-engineered dari yapping.me/chat):
 *   1. GET /chat  → server otomatis set cookie: device_token, token (JWT),
 *      userd (JWT). Username sudah ada di JWT — tidak perlu registrasi.
 *   2. POST /api/user/gender { gender } → wajib, atau join_match_queue
 *      ditolak dengan error GENDER_REQUIRED. Response set cookie baru
 *      (token & userd) dengan field gender terisi — cookie ini yang harus
 *      dipakai untuk koneksi socket.io berikutnya.
 */

"use strict";

const cfg = require("./config");

/** Decode payload JWT tanpa verifikasi signature (kita hanya butuh baca field). */
function decodeJwtPayload(jwt) {
  const part = jwt.split(".")[1];
  const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(part.length + ((4 - (part.length % 4)) % 4), "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

/** Gabungkan Set-Cookie[] jadi satu Cookie header, override nama yang sama. */
function mergeCookies(jar, setCookieHeaders) {
  for (const raw of setCookieHeaders || []) {
    const pair = raw.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeaderFrom(jar) {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function createGuest() {
  const jar = new Map();

  // ── 1. Ambil cookie sesi awal (device_token, token, userd) ─────────────────
  const pageRes = await fetch(`${cfg.BASE_URL}${cfg.CHAT_PAGE_PATH}`, {
    headers: {
      "User-Agent": cfg.USER_AGENT,
    },
  });
  if (!pageRes.ok) {
    throw new Error(`HTTP ${pageRes.status} saat GET ${cfg.CHAT_PAGE_PATH}`);
  }
  mergeCookies(jar, pageRes.headers.getSetCookie());

  const tokenCookie = jar.get("token");
  if (!tokenCookie) {
    throw new Error("Cookie 'token' tidak ada di response — server mungkin berubah");
  }
  const payload = decodeJwtPayload(tokenCookie);
  const username = payload.username;
  if (!username) {
    throw new Error("Username tidak ada di JWT payload");
  }

  // ── 2. Set gender (wajib sebelum join_match_queue) ──────────────────────────
  const genderRes = await fetch(`${cfg.BASE_URL}${cfg.GENDER_API_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":   cfg.USER_AGENT,
      "Origin":       cfg.ORIGIN,
      "Referer":      cfg.REFERER,
      "Cookie":       cookieHeaderFrom(jar),
    },
    body: JSON.stringify({ gender: cfg.MY_GENDER }),
  });
  if (!genderRes.ok) {
    const errBody = await genderRes.json().catch(() => ({}));
    throw new Error(`HTTP ${genderRes.status} dari ${cfg.GENDER_API_PATH}: ${errBody.error || genderRes.statusText}`);
  }
  mergeCookies(jar, genderRes.headers.getSetCookie());

  return {
    username,
    cookieHeader: cookieHeaderFrom(jar),
    createdAt: Date.now(),
    displayName: username,
  };
}

module.exports = { createGuest };
