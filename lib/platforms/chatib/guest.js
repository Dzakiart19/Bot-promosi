/**
 * lib/platforms/chatib/guest.js
 * "Login" anonim di Chatib — cukup GET /enter?handle=&gender=&age=&country=,
 * tanpa email/password sama sekali. Server langsung set cookie jwt+session
 * dan redirect ke /app/.
 *
 * Node fetch (undici) tidak punya cookie jar otomatis untuk redirect
 * berantai (301→302→301→200 di alur nyata Chatib), jadi kita ikuti redirect
 * secara manual sambil mengumpulkan Set-Cookie di tiap hop.
 */

"use strict";

const cfg = require("./config");

const ADJECTIVES = ["Cool","Smart","Bold","Chill","Quick","Sharp","Slick","Wild","Bright","Fast"];
const NOUNS      = ["Fox","Wolf","Bear","Hawk","Lion","Tiger","Eagle","Shark","Panda","Snake"];

function randomHandle() {
  const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num  = Math.floor(Math.random() * 9999);
  return `${adj}${noun}${num}`.toLowerCase();
}

function randomGender() {
  return cfg.GENDER_POOL[Math.floor(Math.random() * cfg.GENDER_POOL.length)];
}

function randomAge() {
  return cfg.AGE_MIN + Math.floor(Math.random() * (cfg.AGE_MAX - cfg.AGE_MIN + 1));
}

function decodeJwtPayload(jwt) {
  const parts = jwt.split(".");
  if (parts.length < 2) throw new Error("JWT tidak valid");
  const json = Buffer.from(parts[1], "base64").toString("utf8");
  return JSON.parse(json);
}

/** Parse semua `Set-Cookie` di satu response jadi map name→value (cookie jar sederhana). */
function collectCookies(res, jar) {
  const raw = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")] : []);
  for (const line of raw) {
    const [pair] = line.split(";");
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const name  = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    jar[name] = value;
  }
}

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function loginOnce() {
  const handle = randomHandle();
  const gender = randomGender();
  const age    = randomAge();
  const jar    = {};

  const qs = new URLSearchParams({ handle, gender, age: String(age), country: cfg.COUNTRY }).toString();
  let url = `${cfg.APP_ORIGIN}${cfg.ENTER_PATH}?${qs}`;

  // Ikuti redirect manual (server bisa redirect beberapa kali: trailing-slash
  // normalize → set-cookie jwt/session → /app) sambil bawa cookie tiap hop.
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(url, {
      method:   "GET",
      redirect: "manual",
      headers: {
        "User-Agent": cfg.USER_AGENT,
        "Origin":     cfg.ORIGIN,
        "Referer":    cfg.REFERER,
        "Cookie":     cookieHeader(jar),
      },
    });
    collectCookies(res, jar);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`Redirect ${res.status} tanpa Location header`);
      url = new URL(location, url).toString();
      continue;
    }

    // Bukan redirect lagi (biasanya 200 dari /app/) — proses selesai.
    break;
  }

  if (!jar.jwt) throw new Error("Login gagal — cookie jwt tidak ditemukan setelah /enter");

  const payload = decodeJwtPayload(jar.jwt);
  if (!payload.user_id) throw new Error("JWT tidak berisi user_id");

  return {
    userId:      String(payload.user_id),
    displayName: payload.username || handle,
    cookieHeader: cookieHeader(jar),
  };
}

/**
 * Login anonim, dengan retry singkat — kadang hop redirect pertama gagal set
 * cookie jwt karena hiccup jaringan sesaat (terutama saat proses baru start),
 * bukan penolakan dari server. 2 percobaan ulang dengan jeda kecil cukup untuk
 * membedakan hiccup transient dari kegagalan yang benar-benar persisten.
 */
async function createGuest() {
  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await loginOnce();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }
  throw lastErr;
}

module.exports = { createGuest };
