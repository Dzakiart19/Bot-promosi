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

const { getCookies, fetchPage, extractLsd, verifySession } = require("./client");
const { log } = require("../../core/logger");

async function createGuest() {
  const cookies = getCookies();

  log("BOT", "[Threads] Verifikasi cookie session (sessionid/csrftoken)...");

  // Ambil halaman + verify session + extract LSD sekaligus
  const html    = await fetchPage(cookies);
  const lsd     = extractLsd(html);
  const session = verifySession(html);

  return {
    cookies,
    lsd,
    userId:      session.userId || "unknown",
    displayName: session.userId ? `@threads:${session.userId}` : "@threads:unknown",
  };
}

module.exports = { createGuest };
