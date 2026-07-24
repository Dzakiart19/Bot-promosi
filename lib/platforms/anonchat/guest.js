/**
 * lib/platforms/anonchat/guest.js
 * Buat "guest" dari cookie yang disimpan di env ANONCHAT_COOKIES.
 *
 * Format env:
 *   ANONCHAT_COOKIES="auth_token=xxxxxx; user_id=123456"
 *
 * Tidak ada endpoint API untuk membuat akun baru — platform ini
 * membutuhkan akun terdaftar (auth_token + user_id dari browser).
 */

"use strict";

const cfg = require("./config");

/**
 * Parse cookie string → Map<key, value>
 * @param {string} cookieStr  "auth_token=xxx; user_id=yyy"
 */
function parseCookies(cookieStr) {
  const map = {};
  for (const part of cookieStr.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key) map[key] = val;
  }
  return map;
}

/**
 * Kembalikan objek guest dari env ANONCHAT_COOKIES.
 * @returns {{ cookie: string, userId: string, displayName: string }}
 */
async function createGuest() {
  const raw = (process.env.ANONCHAT_COOKIES || "").trim();
  if (!raw) {
    throw new Error(
      "ANONCHAT_COOKIES belum diset. " +
      'Isi dengan: auth_token=xxx; user_id=yyy'
    );
  }

  const cookies = parseCookies(raw);
  const authToken = cookies["auth_token"];
  const userId    = cookies["user_id"];

  if (!authToken || !userId) {
    throw new Error(
      "ANONCHAT_COOKIES tidak lengkap — harus ada auth_token dan user_id. " +
      `Ditemukan key: ${Object.keys(cookies).join(", ") || "(kosong)"}`
    );
  }

  return {
    cookie:      authToken,    // nilai auth_token cookie
    userId:      userId,       // nilai user_id cookie
    displayName: `user_${userId.slice(-6)}`,
  };
}

module.exports = { createGuest };
