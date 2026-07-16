/**
 * lib/platforms/opentalk/guest.js
 * Membuat sesi guest (anonymous JWT) di OpenTalk.
 *
 * Endpoint: POST https://rtc.opentalk.club/web/auth
 * Body:     { fingerprint, turnstileToken, path, country }
 * Response: { token, anonId, expiresIn }
 *
 * Reverse-engineered dari /js/desktop/chat.js:
 *   - fingerprint: string bebas, unik per "device" — kita generate UUID.
 *   - turnstileToken: dikosongkan — backend verifyTurnstile menganggap
 *     token kosong sebagai lolos (captcha efektif nonaktif).
 *   - token: JWT, dipakai sebagai socket.io auth.token, umur 900 detik.
 */

"use strict";

const { v4: uuidv4 } = require("uuid");
const cfg = require("./config");

/**
 * Buat guest session baru dari server.
 * @returns {{ token: string, anonId: string, deviceId: string, expiresIn: number, createdAt: number }}
 */
async function createGuest() {
  const fingerprint = uuidv4();

  const res = await fetch(`${cfg.API_BASE}/web/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":   cfg.USER_AGENT,
      "Origin":       cfg.ORIGIN,
      "Referer":      cfg.REFERER,
    },
    body: JSON.stringify({
      fingerprint,
      turnstileToken: "",
      path:           "/text/",
      country:        "",
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`HTTP ${res.status} dari /web/auth: ${errBody.error || res.statusText}`);
  }

  const data = await res.json();
  if (!data.token) {
    throw new Error("Auth gagal: token tidak ada di response — " + JSON.stringify(data));
  }

  return {
    token:     data.token,
    anonId:    data.anonId,
    deviceId:  fingerprint,
    expiresIn: data.expiresIn || 900,
    createdAt: Date.now(),
    displayName: `Guest_${data.anonId ? data.anonId.slice(0, 8) : fingerprint.slice(0, 8)}`,
  };
}

module.exports = { createGuest };
