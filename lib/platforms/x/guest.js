/**
 * lib/platforms/x/guest.js
 * X tidak punya konsep "guest" — bot butuh akun login asli lewat cookie.
 * createGuest() di sini dipertahankan biar konsisten dengan pola arsitektur
 * platform lain, tapi isinya verifikasi cookie session + ambil identitas akun.
 */

"use strict";

const { getCookies, verifyLogin } = require("./client");

async function createGuest() {
  const cookies = getCookies();
  const account = await verifyLogin(cookies);
  return {
    cookies,
    userId:      account.userId,
    displayName: account.screenName || "unknown",
    anonId:      account.userId,
  };
}

module.exports = { createGuest };
