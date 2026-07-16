/**
 * lib/platforms/x/sent-log.js
 * Riwayat comment/reply yang sudah berhasil dikirim oleh X Bot.
 * Disimpan in-memory (reset tiap restart), maksimal MAX entri terakhir.
 *
 * Setiap entri:
 *   mode        — "comment" | "reply"
 *   targetId    — tweet ID yang dikomentari/direply
 *   targetText  — potongan teks tweet target (max 120 char)
 *   targetUrl   — URL langsung ke tweet target di x.com
 *   sentId      — tweet ID hasil kiriman bot (komentar/reply baru)
 *   sentUrl     — URL langsung ke komentar/reply bot di x.com
 *   sentAt      — timestamp Unix ms
 */

"use strict";

const MAX = 100;
const log = [];

function addEntry({ mode, targetId, targetText, sentId, sentAt }) {
  log.unshift({
    mode,
    targetId,
    targetText: String(targetText || "").slice(0, 120),
    targetUrl:  `https://x.com/i/web/status/${targetId}`,
    sentId:     sentId || null,
    sentUrl:    sentId ? `https://x.com/i/web/status/${sentId}` : null,
    sentAt:     sentAt || Date.now(),
  });
  if (log.length > MAX) log.pop();
}

function getLog() { return log; }

module.exports = { addEntry, getLog, log };
