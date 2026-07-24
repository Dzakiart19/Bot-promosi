/**
 * lib/platforms/threads/sent-log.js
 * Riwayat comment/post yang sudah berhasil dikirim oleh Threads Bot.
 * Disimpan in-memory (reset tiap restart), maksimal MAX entri terakhir.
 *
 * Setiap entri:
 *   mode        — "comment" | "post"
 *   targetId    — thread ID yang dikomentari
 *   targetText  — potongan teks thread target (max 120 char)
 *   targetUrl   — URL thread target di threads.com
 *   sentId      — thread ID hasil kiriman bot
 *   sentUrl     — URL komentar/post bot di threads.com
 *   sentAt      — timestamp Unix ms
 */

"use strict";

const MAX = 100;
const log = [];

function addEntry({ mode, targetId, targetText, sentId, sentAt }) {
  log.unshift({
    mode,
    targetId:   targetId || null,
    targetText: String(targetText || "").slice(0, 120),
    targetUrl:  targetId ? `https://www.threads.com/t/${targetId}` : null,
    sentId:     sentId   || null,
    sentUrl:    sentId   ? `https://www.threads.com/t/${sentId}` : null,
    sentAt:     sentAt   || Date.now(),
  });
  if (log.length > MAX) log.pop();
}

function getLog() { return log; }

module.exports = { addEntry, getLog, log };
