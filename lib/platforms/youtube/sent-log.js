/**
 * lib/platforms/youtube/sent-log.js
 * Riwayat komentar yang sudah berhasil dikirim oleh YouTube Bot.
 * Disimpan in-memory (reset tiap restart), maksimal MAX entri terakhir.
 *
 * Setiap entri:
 *   videoId   — ID video yang dikomentari
 *   title     — judul video (max 100 char)
 *   channel   — nama channel
 *   videoUrl  — URL youtube.com/watch?v=...
 *   keyword   — keyword yang dipakai untuk menemukan video
 *   sentText  — potongan teks komentar yang dikirim (max 120 char)
 *   sentAt    — timestamp Unix ms
 */

"use strict";

const MAX = 100;
const log = [];

function addEntry({ videoId, title, channel, videoUrl, keyword, sentText, sentAt }) {
  log.unshift({
    videoId,
    title:    String(title   || "").slice(0, 100),
    channel:  String(channel || "").slice(0, 80),
    videoUrl: videoUrl || `https://www.youtube.com/watch?v=${videoId}`,
    keyword:  String(keyword  || ""),
    sentText: String(sentText || "").slice(0, 120),
    sentAt:   sentAt || Date.now(),
  });
  if (log.length > MAX) log.pop();
}

function getLog() { return log; }

module.exports = { addEntry, getLog, log };
