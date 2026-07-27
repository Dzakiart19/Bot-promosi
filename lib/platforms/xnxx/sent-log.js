/**
 * lib/platforms/xnxx/sent-log.js
 * Riwayat komentar yang sudah berhasil dikirim oleh XNXX Bot.
 * Disimpan in-memory (reset tiap restart), maksimal MAX entri terakhir.
 */

"use strict";

const MAX = 100;
const log = [];

function addEntry({ slug, videoId, videoTitle, sentAt }) {
  log.unshift({
    mode:       "comment",
    targetId:   String(videoId || slug || ""),
    targetText: String(videoTitle || "").slice(0, 120),
    targetUrl:  slug ? `https://www.xnxx.com${slug}` : null,
    sentId:     null,
    sentUrl:    null,
    sentAt:     sentAt || Date.now(),
  });
  if (log.length > MAX) log.pop();
}

function getLog() { return log; }

module.exports = { addEntry, getLog, log };
