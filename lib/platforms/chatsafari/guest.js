/**
 * lib/platforms/chatsafari/guest.js
 * Buat akun anonymous di Chatsafari.
 *
 * Endpoint: POST https://chatsafari.sliplane.app/api/auth/anonymous
 * Body:     { "gender": "male", "username": "CoolFox8821", "age": 25 }
 * Response: { "success": true, "user": { id, username, gender, age, avatar, isAnonymous } }
 *
 * Catatan:
 *   - Tidak perlu token, captcha, atau email
 *   - username WAJIB dikirim (tidak auto-generate)
 *   - age WAJIB dikirim (integer 18+)
 *   - Tidak ada rate limit ketat — bisa bikin akun baru berkali-kali
 *   - Gender dipilih random dari GENDER_POOL di config.js
 */

"use strict";

const cfg = require("./config");

const ADJECTIVES = ["Cool","Smart","Bold","Chill","Quick","Sharp","Slick","Wild","Bright","Fast","Sweet","Happy","Lucky","Brave","Calm"];
const NOUNS      = ["Fox","Wolf","Bear","Hawk","Lion","Tiger","Eagle","Shark","Panda","Snake","Deer","Owl","Cat","Dog","Rabbit"];

function randomGender() {
  return cfg.GENDER_POOL[Math.floor(Math.random() * cfg.GENDER_POOL.length)];
}

function randomUsername() {
  const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num  = Math.floor(Math.random() * 9999);
  return `${adj}${noun}${num}`;
}

function randomAge() {
  return 20 + Math.floor(Math.random() * 15); // 20-34
}

/**
 * Buat akun anonymous baru dari server.
 * @returns {{ userId: string, username: string, gender: string, displayName: string }}
 */
async function createAccount() {
  const gender   = randomGender();
  const username = randomUsername();
  const age      = randomAge();

  const res = await fetch(`${cfg.API_BASE}${cfg.AUTH_ENDPOINT}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":   cfg.USER_AGENT,
      "Origin":       cfg.ORIGIN,
      "Referer":      cfg.REFERER,
    },
    body: JSON.stringify({ gender, username, age }),
  });

  const data = await res.json().catch(() => ({}));

  // API bisa return 200 tapi success:false (misal field baru yang belum kita ketahui)
  if (!res.ok || data.success === false) {
    const msg = data.message || data.error || `HTTP ${res.status}`;
    throw new Error(`Auth gagal: ${msg}`);
  }

  const user = data?.user;

  if (!user?.id) {
    throw new Error("Auth gagal: user.id tidak ada di response — " + JSON.stringify(data));
  }

  return {
    userId:      String(user.id),
    id:          String(user.id),
    username:    user.username,
    gender:      user.gender || gender,
    age:         user.age || age,
    avatar:      user.avatar || null,
    isAnonymous: user.isAnonymous !== undefined ? user.isAnonymous : true,
    displayName: user.username || `User_${String(user.id).slice(0, 8)}`,
  };
}

/**
 * Buat akun anonymous, dengan retry singkat.
 * @returns {Promise<{userId: string, username: string, gender: string, displayName: string}>}
 */
async function createGuest() {
  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await createAccount();
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
