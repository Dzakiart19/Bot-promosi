/**
 * lib/platforms/facebook/sent-log.js
 * Rolling in-memory log 100 komentar terakhir — ditampilkan di dashboard.
 * Pola identik dengan X bot / GETTR bot.
 */

"use strict";

const MAX = 100;
const log = [];

function addEntry({ mode, targetId, targetText, sentId }) {
  log.unshift({ mode, targetId, targetText: (targetText || "").slice(0, 120), sentId, at: Date.now() });
  if (log.length > MAX) log.length = MAX;
}

module.exports = { log, addEntry };
