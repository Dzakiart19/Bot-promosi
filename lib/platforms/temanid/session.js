/**
 * lib/platforms/temanid/session.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Wrapper tipis — bind config TemanID ke implementasi generik di shared-session.js.
 *
 * Perbedaan dari telegram: DELAY_SEND_MS = 0 (kirim promo langsung setelah match).
 * Semua yang lain identik — tidak ada duplikasi kode.
 *
 * Interface keluar sama persis:
 *   createMessageListener(client, botEntity) → { nextMsg }
 *   runSession(client, botEntity, nextMsg)    → Promise<string>
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const cfg    = require("./config");
const shared = require("../telegram/shared-session");

const { createMessageListener, runSession } = shared.makeSession(cfg);

module.exports = { createMessageListener, runSession };
