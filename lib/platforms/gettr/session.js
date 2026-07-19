/**
 * lib/platforms/gettr/session.js
 * Satu siklus bot GETTR:
 *   Mode COMMENT — ambil trending posts → comment promo
 *   Mode POST    — buat post mandiri tiap 1 jam
 *
 * Mirip arsitektur X Bot: tidak ada socket/match, cuma
 * siklus fetch-trending → comment → sleep.
 */

"use strict";

const cfg          = require("./config");
const { sleep, log } = require("../../core/logger");
const { stats, pushEvent } = require("../../core/stats");
const { fetchTrendingPosts, postComment, createPost } = require("./client");
const repliedStore = require("./replied-store");
const sentLog      = require("./sent-log");

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Mode COMMENT: ambil trending → comment pada post yang belum dikomentari */
async function runCommentSession(session) {
  stats.status = "searching";
  log("BOT", "[GETTR] Ambil trending posts...");

  let candidates;
  try {
    candidates = await fetchTrendingPosts(session);
  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    pushEvent("error", `fetchTrending gagal: ${err.message}`);
    return "fetch-error";
  }

  if (!candidates || candidates.length === 0) {
    stats.totalNoMatch++;
    pushEvent("search", "Trending GETTR kosong atau semua post tidak ada teks");
    return "no-target";
  }

  // Filter: belum dikomentari & bukan post sendiri
  const targets = candidates.filter(
    (p) => !repliedStore.has(p.id) && p.uid !== session.username
  );

  if (targets.length === 0) {
    stats.totalNoMatch++;
    pushEvent("search", `Semua ${candidates.length} trending post sudah dikomentari`);
    return "no-target";
  }

  // Ambil maksimal MAX_COMMENTS_PER_CYCLE target
  const toComment = targets.slice(0, cfg.MAX_COMMENTS_PER_CYCLE);
  let commented = 0;

  for (const target of toComment) {
    log("INFO", `[GETTR] Target: ${target.id} (${target.uid}) — "${target.txt.slice(0, 80)}"`);
    stats.status = "matched";
    stats.totalMatches++;
    stats.lastMatchAt = Date.now();
    pushEvent("match", `[GETTR] Post ${target.id} dari @${target.uid}`);

    try {
      const text   = pickRandom(cfg.COMMENT_TEXTS);
      const result = await postComment(session, target.id, text);

      repliedStore.add(target.id);
      stats.totalReplies++;
      stats.totalMsgSent++;
      stats.lastReplyAt = Date.now();
      sentLog.addEntry({
        mode:       "comment",
        targetId:   target.id,
        targetText: target.txt,
        sentId:     result.id,
      });
      log("SUCCESS", `[GETTR] Komentar terkirim ke ${target.id} → id ${result.id || "?"}`);
      pushEvent("reply", `[GETTR] → https://gettr.com/post/${target.id}`);
      commented++;
    } catch (err) {
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = err.message;
      log("ERROR", `[GETTR] Komentar ke ${target.id} gagal: ${err.message}`);
      pushEvent("error", `Komentar ke ${target.id} gagal: ${err.message}`);

      // Kalau akun banned/suspended, hentikan siklus ini
      if (/ban|suspend|not_allow|E_NOT_ALLOWED/i.test(err.message)) {
        log("WARN", "[GETTR] Akun terdeteksi banned/suspended — hentikan siklus");
        return "banned";
      }
    }

    // Jeda antar komentar supaya tidak keliatan spam
    if (commented < toComment.length - 1) {
      await sleep(cfg.POST_DELAY_MS);
    }
  }

  return commented > 0 ? "comments-sent" : "all-failed";
}

/** Mode POST: buat post mandiri dengan teks promo */
async function runPostSession(session) {
  stats.status = "posting";
  const text = pickRandom(cfg.POST_TEXTS);
  log("BOT", "[GETTR] Buat post mandiri...");
  log("INFO", `[GETTR] Teks: "${text.slice(0, 80)}..."`);

  try {
    const result = await createPost(session, text);
    stats.totalReplies++;
    stats.totalMsgSent++;
    sentLog.addEntry({ mode: "post", targetId: result.id, targetText: text, sentId: result.id });
    log("SUCCESS", `[GETTR] Post terkirim → id ${result.id || "?"}`);
    pushEvent("reply", `[GETTR] Post mandiri → https://gettr.com/post/${result.id || ""}`);
    return "post-sent";
  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    log("ERROR", `[GETTR] Post gagal: ${err.message}`);
    pushEvent("error", `Auto-post gagal: ${err.message}`);
    return "post-error";
  }
}

module.exports = { runCommentSession, runPostSession };
