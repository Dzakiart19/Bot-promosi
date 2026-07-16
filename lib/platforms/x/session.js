/**
 * lib/platforms/x/session.js
 * Satu siklus: pilih keyword acak → cari tweet relevan → reply satu tweet
 * yang belum pernah dibalas → tandai selesai. Beda dari platform chat lain
 * (tidak ada socket/match/pesan berbalas), tapi statusnya dipetakan ke
 * stats.status yang sama biar dashboard tetap konsisten.
 */

"use strict";

const cfg = require("./config");
const { sleep, log } = require("../../core/logger");
const { stats, pushEvent } = require("../../core/stats");
const { searchTweets, postReply, fetchHomeTimeline } = require("./client");
const repliedStore = require("./replied-store");
const sentLog     = require("./sent-log");

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Mode 1: cari tweet by keyword → reply promo */
async function runReplySession(account) {
  stats.status = "searching";
  const keyword = pickRandom(cfg.KEYWORDS);
  log("BOT", `[REPLY] Cari tweet relevan: "${keyword}"`);

  let candidates;
  try {
    candidates = await searchTweets(account.cookies, keyword);
  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    pushEvent("error", `Search "${keyword}" gagal: ${err.message}`);
    return "search-error";
  }

  const target = candidates.find(
    (t) => !repliedStore.has(t.id) && t.userId !== account.userId
  );

  if (!target) {
    stats.totalNoMatch++;
    pushEvent("search", `Tidak ada tweet baru untuk "${keyword}" (${candidates.length} kandidat, semua sudah dibalas)`);
    return "no-target";
  }

  log("INFO", `[REPLY] Target: tweet ${target.id} — "${target.text.slice(0, 80)}"`);
  stats.status = "matched";
  stats.totalMatches++;
  stats.lastMatchAt = Date.now();
  pushEvent("match", `[REPLY] Target tweet ${target.id} dari keyword "${keyword}"`);

  try {
    const replyText = cfg.REPLY_TEXTS[Math.floor(Math.random() * cfg.REPLY_TEXTS.length)];
    const result = await postReply(account.cookies, target.id, replyText);
    repliedStore.add(target.id);
    stats.totalReplies++;
    stats.totalMsgSent++;
    stats.lastReplyAt = Date.now();
    sentLog.addEntry({ mode: "reply", targetId: target.id, targetText: target.text, sentId: result.id });
    log("SUCCESS", `[REPLY] Terkirim ke ${target.id} → id ${result.id || "?"}`);
    pushEvent("reply", `[REPLY] → https://x.com/i/web/status/${target.id}`);
    return "reply-sent";
  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    log("ERROR", `[REPLY] Ke ${target.id} gagal: ${err.message}`);
    pushEvent("error", `Reply ke ${target.id} gagal: ${err.message}`);
    return "reply-error";
  }
}

/** Mode 2: ambil postingan dari home timeline → comment promo */
async function runCommentSession(account) {
  stats.status = "searching";
  log("BOT", `[COMMENT] Ambil postingan dari home timeline...`);

  let candidates;
  try {
    candidates = await fetchHomeTimeline(account.cookies);
  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    pushEvent("error", `HomeTimeline gagal: ${err.message}`);
    return "timeline-error";
  }

  if (!candidates || candidates.length === 0) {
    stats.totalNoMatch++;
    pushEvent("search", `Home timeline kosong atau tidak ada postingan root`);
    return "no-target";
  }

  const target = candidates.find(
    (t) => !repliedStore.has(t.id) && t.userId !== account.userId
  );

  if (!target) {
    stats.totalNoMatch++;
    pushEvent("search", `Semua ${candidates.length} postingan home timeline sudah dikomentari`);
    return "no-target";
  }

  log("INFO", `[COMMENT] Target: tweet ${target.id} — "${target.text.slice(0, 80)}"`);
  stats.status = "matched";
  stats.totalMatches++;
  stats.lastMatchAt = Date.now();
  pushEvent("match", `[COMMENT] Target postingan ${target.id} dari home timeline`);

  try {
    const text = cfg.POST_TEXTS[Math.floor(Math.random() * cfg.POST_TEXTS.length)];
    const result = await postReply(account.cookies, target.id, text);
    repliedStore.add(target.id);
    stats.totalReplies++;
    stats.totalMsgSent++;
    stats.lastReplyAt = Date.now();
    sentLog.addEntry({ mode: "comment", targetId: target.id, targetText: target.text, sentId: result.id });
    log("SUCCESS", `[COMMENT] Terkirim ke postingan ${target.id} → id ${result.id || "?"}`);
    pushEvent("reply", `[COMMENT] → https://x.com/i/web/status/${target.id}`);
    return "comment-sent";
  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    log("ERROR", `[COMMENT] Ke ${target.id} gagal: ${err.message}`);
    pushEvent("error", `Comment ke ${target.id} gagal: ${err.message}`);
    return "comment-error";
  }
}

/** Mode 3: buat tweet baru (standalone post) dengan teks promo acak */
async function runPostSession(account) {
  stats.status = "posting";
  const text = cfg.POST_TEXTS[Math.floor(Math.random() * cfg.POST_TEXTS.length)];
  log("BOT", `[POST] Buat tweet baru...`);
  log("INFO", `[POST] Teks: "${text.slice(0, 80)}..."`);

  try {
    const { postTweet } = require("./client");
    const result = await postTweet(account.cookies, text);
    stats.totalReplies++;
    stats.totalMsgSent++;
    sentLog.addEntry({ mode: "post", targetId: result.id, targetText: text, sentId: result.id });
    log("SUCCESS", `[POST] Tweet terkirim → id ${result.id || "?"}`);
    pushEvent("reply", `[POST] → https://x.com/i/web/status/${result.id}`);
    return "post-sent";
  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    log("ERROR", `[POST] Gagal: ${err.message}`);
    pushEvent("error", `Auto-post gagal: ${err.message}`);
    return "post-error";
  }
}

module.exports = { runReplySession, runCommentSession, runPostSession };
