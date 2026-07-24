/**
 * lib/platforms/threads/session.js
 * Satu siklus bot Threads:
 *   Mode COMMENT — cari thread berdasarkan keyword → comment promo
 *   Mode POST    — buat thread mandiri tiap 1 jam
 *
 * Arsitektur mirip X Bot & GETTR Bot: tidak ada socket/match,
 * cuma siklus search → comment/post → sleep.
 */

"use strict";

const cfg = require("./config");
const { sleep, log } = require("../../core/logger");
const { stats, pushEvent } = require("../../core/stats");
const { getLsd, invalidateLsd, getRecommendedPosts, createPost, createReply } = require("./client");
const repliedStore = require("./replied-store");
const sentLog      = require("./sent-log");

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Mode COMMENT: cari thread via keyword → comment promo pada thread yang belum dikomentari.
 * @param {object} account — dari createGuest()
 */
async function runCommentSession(account) {
  stats.status = "searching";
  log("BOT", "[Threads] [COMMENT] Ambil thread kandidat...");

  // Pastikan LSD token segar
  let lsd;
  try {
    lsd = await getLsd(account.cookies, null);
  } catch (err) {
    // LSD stale → fetch ulang
    invalidateLsd();
    try {
      lsd = await getLsd(account.cookies, null);
    } catch (e2) {
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = e2.message;
      pushEvent("error", `LSD refresh gagal: ${e2.message}`);
      return "lsd-error";
    }
  }

  let candidates;
  try {
    candidates = await getRecommendedPosts(account.cookies, lsd);
  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    log("ERROR", `[Threads] [COMMENT] Fetch kandidat gagal: ${err.message}`);
    pushEvent("error", `Fetch thread gagal: ${err.message}`);
    return "fetch-error";
  }

  log("INFO", `[Threads] [COMMENT] ${candidates.length} thread ditemukan`);

  if (!candidates || candidates.length === 0) {
    stats.totalNoMatch++;
    pushEvent("search", "Tidak ada thread ditemukan dari keyword ini");
    return "no-target";
  }

  // Filter: belum dikomentari & bukan thread sendiri
  const target = candidates.find(
    (t) => !repliedStore.has(t.id) && t.authorId !== account.userId
  );

  if (!target) {
    stats.totalNoMatch++;
    pushEvent("search", `Semua ${candidates.length} thread sudah dikomentari`);
    return "no-target";
  }

  log("INFO", `[Threads] [COMMENT] Target: ${target.id} — "${target.text.slice(0, 80)}"`);
  stats.status    = "matched";
  stats.totalMatches++;
  stats.lastMatchAt = Date.now();
  pushEvent("match", `[Threads] Target thread ${target.id}`);

  try {
    const text   = pickRandom(cfg.COMMENT_TEXTS);
    const result = await createReply(account.cookies, lsd, target.id, text);

    repliedStore.add(target.id);
    stats.totalReplies++;
    stats.totalMsgSent++;
    stats.lastReplyAt = Date.now();
    sentLog.addEntry({
      mode:       "comment",
      targetId:   target.id,
      targetText: target.text,
      sentId:     result.id,
    });
    log("SUCCESS", `[Threads] [COMMENT] Terkirim ke ${target.id} → id ${result.id || "?"}`);
    pushEvent("reply", `[Threads] comment → https://www.threads.com/t/${target.id}`);
    return "comment-sent";
  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    log("ERROR", `[Threads] [COMMENT] Ke ${target.id} gagal: ${err.message}`);
    pushEvent("error", `Comment ke ${target.id} gagal: ${err.message}`);

    // Jika session expired → bust LSD cache
    if (/expired|invalid|sessionid|HTML bukan JSON/i.test(err.message)) {
      invalidateLsd();
    }
    return "comment-error";
  }
}

/**
 * Mode POST: buat thread baru dengan teks promo acak.
 * @param {object} account — dari createGuest()
 */
async function runPostSession(account) {
  stats.status = "posting";

  let lsd;
  try {
    lsd = await getLsd(account.cookies, null);
  } catch (err) {
    invalidateLsd();
    try { lsd = await getLsd(account.cookies, null); }
    catch (e2) {
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = e2.message;
      pushEvent("error", `LSD refresh gagal: ${e2.message}`);
      return "lsd-error";
    }
  }

  const text = pickRandom(cfg.POST_TEXTS);
  log("BOT",  "[Threads] [POST] Buat thread baru...");
  log("INFO", `[Threads] [POST] Teks: "${text.slice(0, 80)}..."`);

  try {
    const result = await createPost(account.cookies, lsd, text);
    stats.totalReplies++;
    stats.totalMsgSent++;
    sentLog.addEntry({ mode: "post", targetId: result.id, targetText: text, sentId: result.id });
    log("SUCCESS", `[Threads] [POST] Thread terkirim → id ${result.id || "?"}`);
    pushEvent("reply", `[Threads] post → https://www.threads.com/t/${result.id || ""}`);
    return "post-sent";
  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    log("ERROR", `[Threads] [POST] Gagal: ${err.message}`);
    pushEvent("error", `Auto-post gagal: ${err.message}`);
    if (/expired|invalid|sessionid|HTML bukan JSON/i.test(err.message)) invalidateLsd();
    return "post-error";
  }
}

module.exports = { runCommentSession, runPostSession };
