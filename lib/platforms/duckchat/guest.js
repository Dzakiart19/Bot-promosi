/**
 * lib/platforms/duckchat/guest.js
 * Membuat identitas anonim untuk sesi DuckChat.
 *
 * Flow (reverse-engineered dari chunk 2096):
 *   1. Generate userId  = 15 karakter random alphanum + "_" + timestamp
 *   2. Generate userIdentifier = UUID (pengganti localStorage di browser)
 *   3. POST /api/user-account-sync { userIdentifier, profile, ... } → dapat jwtToken
 *   4. Decode JWT payload → dapat dbId (_id di MongoDB)
 *   5. Return semua field yang dibutuhkan socket auth
 *
 * Catatan: strangerGenderPreference WAJIB "all" (bukan "any" — server reject enum lain).
 */

"use strict";

const { v4: uuidv4 } = require("uuid");
const cfg = require("./config");

const USERNAMES = [
  "Alex","Jordan","Morgan","Casey","Riley","Taylor","Quinn","Avery",
  "Blake","Drew","Emery","Finley","Harper","Hayden","Jamie","Jessie",
  "Kendall","Lane","Logan","Mackenzie","Parker","Peyton","Reese","Rowan",
  "Ryan","Sage","Sawyer","Skyler","Spencer","Sydney",
];

function randomUsername() {
  return USERNAMES[Math.floor(Math.random() * USERNAMES.length)] +
    Math.floor(Math.random() * 9999);
}

/** Hasilkan userId sesuai format DuckChat: 15 char + "_" + timestamp */
function generateUserId() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 15; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${s}_${Date.now()}`;
}

/** Decode payload JWT (base64url) tanpa verifikasi signature */
function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    const padded  = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch (_) {
    return {};
  }
}

/**
 * Buat identitas guest baru dan sync ke server DuckChat.
 * @returns {{
 *   userId: string,
 *   userIdentifier: string,
 *   jwtToken: string,
 *   dbId: string,
 *   displayName: string,
 * }}
 */
async function createGuest() {
  const userId         = generateUserId();
  const userIdentifier = uuidv4();
  const username       = randomUsername();

  const res = await fetch(`${cfg.API_BASE}/api/user-account-sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin":       cfg.ORIGIN,
      "Referer":      cfg.REFERER,
      "User-Agent":   cfg.USER_AGENT,
    },
    body: JSON.stringify({
      ip:             "0.0.0.0",
      location:       {},
      network:        {},
      userIdentifier,
      profile: {
        avatarUrl:                "",
        username,
        occupation:               "👤 User",
        bio:                      "",
        gender:                   "male",
        strangerGenderPreference: "all",   // ← WAJIB "all", bukan "any"
      },
      token: null,
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} dari /api/user-account-sync`);

  const data = await res.json();
  if (data.message !== "OK") throw new Error("user-account-sync gagal: " + JSON.stringify(data));
  if (data.banned)            throw new Error("Akun dibanned: " + data.banReason);

  const jwtToken = data.jwtToken || "";
  const dbId     = decodeJwtPayload(jwtToken)._id || "";

  return { userId, userIdentifier, jwtToken, dbId, displayName: username };
}

module.exports = { createGuest };
