/**
 * lib/platforms/gettr/sent-log.js
 * Riwayat komentar/post yang sudah berhasil dikirim oleh GETTR Bot.
 * Disimpan in-memory (reset tiap restart), maksimal MAX entri terakhir.
 */

"use strict";

const MAX = 100;
const log = [];

function addEntry({ mode, targetId, targetText, sentId, sentAt }) {
  log.unshift({
    mode,
    targetId,
    targetText: String(targetText || "").slice(0, 120),
    targetUrl:  `https://gettr.com/post/${targetId}`,
    sentId:     sentId || null,
    sentUrl:    sentId ? `https://gettr.com/post/${sentId}` : null,
    sentAt:     sentAt || Date.now(),
  });
  if (log.length > MAX) log.pop();
}

function getLog() { return log; }

module.exports = { addEntry, getLog, log };
