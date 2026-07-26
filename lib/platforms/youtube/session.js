/**
 * lib/platforms/youtube/session.js
 * Satu siklus bot YouTube:
 *   1. Pilih keyword acak
 *   2. Search video via InnerTube (youtubei.js)
 *   3. Cari video yang belum pernah dikomentari
 *   4. Post komentar promo
 *   5. Tandai video agar tidak dikomentari ulang
 *
 * Arsitektur sama dengan X Bot (search → act → sleep, tanpa socket/match).
 */

"use strict";

const cfg           = require("./config");
const { log }       = require("../../core/logger");
const { stats, pushEvent } = require("../../core/stats");
const { searchVideos, postComment, resetInnertube } = require("./client");
const repliedStore  = require("./replied-store");
const sentLog       = require("./sent-log");

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Jalankan satu siklus comment YouTube:
 * pilih keyword → cari video → komentari satu video baru.
 */
async function runCommentSession() {
  stats.status = "searching";

  const keyword = pickRandom(cfg.SEARCH_KEYWORDS);
  log("BOT", `[YT] Cari video: "${keyword}"`);
  pushEvent("search", `Cari video: "${keyword}"`);

  // ── 1. Search video ────────────────────────────────────────────────────────
  let candidates;
  try {
    candidates = await searchVideos(keyword);
  } catch (err) {
    // Cookie mungkin expired — reset singleton supaya siklus berikutnya reinit
    resetInnertube();
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    pushEvent("error", `Search gagal: ${err.message}`);
    log("ERROR", `[YT] Search "${keyword}" gagal: ${err.message}`);
    return "search-error";
  }

  log("INFO", `[YT] ${candidates.length} video ditemukan untuk "${keyword}"`);

  // ── 2. Pilih video yang belum dikomentari ──────────────────────────────────
  const target = candidates.find((v) => !repliedStore.has(v.videoId));

  if (!target) {
    stats.totalNoMatch++;
    log("INFO", `[YT] Semua ${candidates.length} video untuk "${keyword}" sudah dikomentari`);
    pushEvent("search", `Semua ${candidates.length} video sudah dikomentari ("${keyword}")`);
    return "no-target";
  }

  log("INFO", `[YT] Target: ${target.videoId} — "${target.title.slice(0, 70)}" (${target.channel})`);
  stats.status = "matched";
  stats.totalMatches++;
  stats.lastMatchAt = Date.now();
  pushEvent("match", `Video: ${target.url}`);

  // ── 3. Post komentar ───────────────────────────────────────────────────────
  const commentText = pickRandom(cfg.COMMENT_TEXTS);
  log("BOT", `[YT] → Komentar: "${commentText.slice(0, 80)}..."`);

  try {
    await postComment(target.videoId, commentText);

    // Tandai sudah dikomentari
    repliedStore.add(target.videoId);
    stats.totalReplies++;
    stats.totalMsgSent++;
    stats.lastReplyAt = Date.now();

    sentLog.addEntry({
      videoId:  target.videoId,
      title:    target.title,
      channel:  target.channel,
      videoUrl: target.url,
      keyword,
      sentText: commentText,
    });

    log("SUCCESS", `[YT] Komentar terkirim ke ${target.videoId} — ${target.url}`);
    pushEvent("reply", `[YT] → ${target.url}`);
    return "comment-sent";

  } catch (err) {
    // Kalau gagal karena auth, reset supaya reinit siklus berikutnya
    if (/signed in|logged_in|expired|cookie/i.test(err.message)) {
      resetInnertube();
    }
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    log("ERROR", `[YT] Komentar ke ${target.videoId} gagal: ${err.message}`);
    pushEvent("error", `Komentar ke ${target.videoId} gagal: ${err.message}`);
    return "comment-error";
  }
}

module.exports = { runCommentSession };
