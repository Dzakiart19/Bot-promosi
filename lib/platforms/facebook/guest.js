/**
 * lib/platforms/facebook/guest.js
 * Facebook tidak punya guest session — bot pakai cookie akun login asli.
 * createGuest() verifikasi cookie valid + ambil identitas akun.
 *
 * Cookie yang dibutuhkan (dari FB_COOKIES env var):
 *   c_user = user ID numerik
 *   xs     = session token
 *   fr     = auth token
 *   datr   = device token
 * Semua disalin dari DevTools → Application → Cookies → facebook.com
 */

"use strict";

const { getTokens } = require("./client");
const { log } = require("../../core/logger");
const cfg = require("./config");

function parseCookies(raw) {
  const out = {};
  String(raw || "").split(";").map(p => p.trim()).filter(Boolean).forEach(pair => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  });
  return out;
}

async function createGuest() {
  const raw = process.env.FB_COOKIES;
  if (!raw) throw new Error("FB_COOKIES belum diset di environment");

  const cookies = parseCookies(raw);
  const cUser   = decodeURIComponent(cookies.c_user || "");
  const xs      = cookies.xs;

  if (!cUser) throw new Error("FB_COOKIES harus berisi c_user (user ID)");
  if (!xs)    throw new Error("FB_COOKIES harus berisi xs (session token)");

  log("BOT", `[FB] Verifikasi cookie session (c_user=${cUser})...`);

  // Fetch homepage untuk verifikasi login + ambil token LSD/DTSG
  const tokens = await getTokens(raw);
  if (!tokens.lsd || !tokens.dtsg) {
    throw new Error("Cookie FB tidak valid / expired — tidak bisa ambil LSD/DTSG dari homepage");
  }
  if (tokens.uid && tokens.uid !== cUser) {
    log("WARN", `[FB] USER_ID dari HTML (${tokens.uid}) beda dengan c_user (${cUser})`);
  }

  log("SUCCESS", `[FB] Login OK — userId=${cUser}`);
  return {
    cookieStr: raw,
    userId:    cUser,
    displayName: `fb:${cUser}`,
    tokens,    // { lsd, dtsg, uid, spinR, spinB, spinT, hsi }
  };
}

module.exports = { createGuest };
