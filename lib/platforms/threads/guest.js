/**
 * lib/platforms/threads/guest.js
 * Threads tidak punya konsep "guest" — bot pakai akun login asli via cookie.
 * createGuest() di sini memverifikasi cookie dan menyiapkan object account
 * yang dipakai oleh session.js, konsisten dengan pola arsitektur platform lain.
 *
 * Diperlukan:
 *   THREADS_COOKIES = "sessionid=<val>; csrftoken=<val>"
 *
 * Cara dapat cookie:
 *   1. Buka threads.com di browser → login
 *   2. DevTools → Application → Cookies → threads.com
 *   3. Copy sessionid dan csrftoken → gabungkan: "sessionid=X; csrftoken=Y"
 */

"use strict";

const { getCookies, fetchPage, verifySession, getLsd, invalidateLsd } = require("./client");
const { log } = require("../../core/logger");

async function createGuest() {
  const cookies = getCookies();

  log("BOT", "[Threads] Verifikasi cookie session (sessionid/csrftoken)...");

  // Satu fetch untuk semua: verify session + seed LSD cache + seed fb_dtsg cache
  invalidateLsd(); // reset agar getLsd fetch ulang dengan cookies terbaru
  const html    = await fetchPage(cookies);
  const session = verifySession(html);         // throw kalau halaman login
  const lsd     = await getLsd(cookies, html); // seed cache (pakai html yang sudah ada)

  return {
    cookies,
    lsd,
    userId:      session.userId || "unknown",
    displayName: session.userId ? `@threads:${session.userId}` : "@threads:unknown",
  };
}

module.exports = { createGuest };
