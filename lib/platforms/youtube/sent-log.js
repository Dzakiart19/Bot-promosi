/**
 * lib/platforms/youtube/sent-log.js
 * Riwayat komentar yang sudah berhasil dikirim oleh YouTube Bot.
 * Disimpan in-memory (reset tiap restart), maksimal MAX entri terakhir.
 *
 * Format entry dinormalisasi agar kompatibel dengan renderSentLog di dashboard
 * (field yang sama dengan X Bot & GETTR Bot):
 *   mode      — selalu "comment"
 *   targetText — judul video yang dikomentari (max 100 char)
 *   targetUrl  — URL youtube.com/watch?v=...
 *   sentUrl    — null (YouTube tidak return URL langsung ke komentar)
 *   sentAt     — timestamp Unix ms
 *
 * Field tambahan YouTube-specific (disimpan, tidak dirender di dashboard):
 *   videoId   — ID video
 *   channel   — nama channel
 *   keyword   — keyword yang dipakai untuk menemukan video
 *   sentText  — potongan teks komentar yang dikirim (max 120 char)
 */

"use strict";

const MAX = 100;
const log = [];

function addEntry({ videoId, title, channel, videoUrl, keyword, sentText, sentAt }) {
  log.unshift({
    // Format standar dashboard (kompatibel dengan renderSentLog)
    mode:       "comment",
    targetText: String(title   || "").slice(0, 100),
    targetUrl:  videoUrl || `https://www.youtube.com/watch?v=${videoId}`,
    sentUrl:    null,
    sentAt:     sentAt || Date.now(),
    // Field tambahan YouTube-specific
    videoId,
    channel:    String(channel  || "").slice(0, 80),
    keyword:    String(keyword  || ""),
    sentText:   String(sentText || "").slice(0, 120),
  });
  if (log.length > MAX) log.pop();
}

function getLog() { return log; }

module.exports = { addEntry, getLog, log };
