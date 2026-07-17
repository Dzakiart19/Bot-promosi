/**
 * lib/platforms/randompacar/session.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Wrapper tipis — bind config RandomPacar ke implementasi generik di shared-session.js.
 *
 * Perbedaan dari telegram: DELAY_SEND_MS = 3000 (delay 3 detik sebelum promo),
 * DELAY_NEXT_MS = 5000, pesan promo Bahasa Indonesia + link dramain.
 * Semua logika alur identik — tidak ada duplikasi kode.
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
