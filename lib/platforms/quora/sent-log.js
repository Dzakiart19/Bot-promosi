/**
 * lib/platforms/quora/sent-log.js
 * Riwayat jawaban yang berhasil diposting oleh Quora Bot.
 * In-memory, max 100 entri terakhir. Di-expose ke dashboard via stats.sentLog.
 */

"use strict";

const MAX = 100;
const log = [];

function addEntry({ questionUrl, questionTitle, answerUrl, sentAt }) {
  log.unshift({
    questionUrl:   questionUrl   || null,
    questionTitle: String(questionTitle || "").slice(0, 120),
    answerUrl:     answerUrl     || null,
    sentAt:        sentAt        || Date.now(),
  });
  if (log.length > MAX) log.pop();
}

module.exports = { addEntry, log };
