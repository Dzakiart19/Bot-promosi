/**
 * lib/platforms/telegram/session.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Wrapper tipis — bind config Telegram ke implementasi generik di shared-session.js.
 *
 * Logika aktual ada di shared-session.js supaya tidak perlu duplikasi
 * di temanid/session.js dan randompacar/session.js.
 *
 * Interface keluar tidak berubah:
 *   createMessageListener(client, botEntity) → { nextMsg }
 *   runSession(client, botEntity, nextMsg)    → Promise<string>
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const cfg    = require("./config");
const shared = require("./shared-session");

const { createMessageListener, runSession } = shared.makeSession(cfg);

module.exports = { createMessageListener, runSession };
