/**
 * lib/platforms/pornhub/sent-log.js
 * Riwayat komentar yang sudah berhasil dikirim oleh PornHub Bot.
 * Disimpan in-memory (reset tiap restart), maksimal MAX entri terakhir.
 */

"use strict";

const MAX = 100;
const log = [];

function addEntry({ viewkey, videoId, videoTitle, sentAt }) {
  log.unshift({
    mode:       "comment",
    targetId:   String(videoId || viewkey || ""),
    targetText: String(videoTitle || "").slice(0, 120),
    targetUrl:  viewkey ? `https://www.pornhub.org/view_video.php?viewkey=${viewkey}` : null,
    sentId:     null,
    sentUrl:    null,
    sentAt:     sentAt || Date.now(),
  });
  if (log.length > MAX) log.pop();
}

function getLog() { return log; }

module.exports = { addEntry, getLog, log };
