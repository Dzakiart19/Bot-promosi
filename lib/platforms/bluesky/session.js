/**
 * lib/platforms/bluesky/session.js
 * Dua mode sesi Bluesky Bot:
 *
 *   runReplySession(session)  — search keyword → reply promo ke post relevan
 *   runPostSession(session)   — buat post promo mandiri
 *
 * Pola sama dengan X Bot dan GETTR Bot: tidak ada socket/match,
 * hanya siklus search → act → sleep.
 */

"use strict";

const cfg          = require("./config");
const { log }      = require("../../core/logger");
const { stats, pushEvent } = require("../../core/stats");
const { searchPosts, createPost, createReply } = require("./client");
const repliedStore = require("./replied-store");
const sentLog      = require("./sent-log");

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Mode 1: search keyword → reply promo ─────────────────────────────────────

/**
 * @param {{ did, accessJwt, handle }} session
 * @returns {Promise<string>} reason
 */
async function runReplySession(session) {
  stats.status = "searching";

  const keyword = pick(cfg.SEARCH_KEYWORDS);
  log("BOT", `[BSky REPLY] Cari post: "${keyword}"`);
  pushEvent("search", `Cari post: "${keyword}"`);

  // 1. Search
  let candidates;
  try {
    candidates = await searchPosts(session.accessJwt, keyword);
  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    pushEvent("error", `Search gagal: ${err.message}`);
    log("ERROR", `[BSky REPLY] Search "${keyword}" gagal: ${err.message}`);
    return "search-error";
  }

  log("INFO", `[BSky REPLY] ${candidates.length} post ditemukan untuk "${keyword}"`);

  // 2. Pilih post yang belum di-reply dan bukan milik akun sendiri
  const target = candidates.find(
    (p) => !repliedStore.has(p.uri) && p.authorDid !== session.did
  );

  if (!target) {
    stats.totalNoMatch++;
    log("INFO", `[BSky REPLY] Semua ${candidates.length} post sudah di-reply atau milik sendiri`);
    pushEvent("search", `Semua post sudah di-reply untuk "${keyword}"`);
    return "no-target";
  }

  log("INFO", `[BSky REPLY] Target: @${target.authorHandle} — "${target.text.slice(0, 80)}"`);
  stats.status = "matched";
  stats.totalMatches++;
  stats.lastMatchAt = Date.now();
  pushEvent("match", `[REPLY] @${target.authorHandle}: "${target.text.slice(0, 60)}"`);

  // 3. Reply
  const replyText = pick(cfg.REPLY_TEXTS);
  log("BOT", `[BSky REPLY] → "${replyText.slice(0, 80)}..."`);

  try {
    const result = await createReply(session, target, replyText);
    repliedStore.add(target.uri);
    stats.totalReplies++;
    stats.totalMsgSent++;
    stats.lastReplyAt = Date.now();

    sentLog.addEntry({
      mode:       "reply",
      targetUri:  target.uri,
      targetText: target.text,
      sentUri:    result.uri,
    });

    log("SUCCESS", `[BSky REPLY] Terkirim → ${result.uri}`);
    pushEvent("reply", `[REPLY] → @${target.authorHandle}`);
    return "reply-sent";

  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    log("ERROR", `[BSky REPLY] Gagal: ${err.message}`);
    pushEvent("error", `Reply gagal: ${err.message}`);
    return "reply-error";
  }
}

// ── Mode 2: auto-post mandiri ─────────────────────────────────────────────────

/**
 * @param {{ did, accessJwt, handle }} session
 * @returns {Promise<string>} reason
 */
async function runPostSession(session) {
  stats.status = "searching";

  const postText = pick(cfg.POST_TEXTS);
  log("BOT", `[BSky POST] → "${postText.slice(0, 80)}..."`);
  pushEvent("search", "[POST] Membuat post promo...");

  try {
    const result = await createPost(session, postText);
    stats.totalMsgSent++;
    stats.lastReplyAt = Date.now();

    sentLog.addEntry({
      mode:      "post",
      targetUri: null,
      targetText: "",
      sentUri:   result.uri,
    });

    log("SUCCESS", `[BSky POST] Terkirim → ${result.uri}`);
    pushEvent("send", `[POST] → ${result.uri}`);
    return "post-sent";

  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    log("ERROR", `[BSky POST] Gagal: ${err.message}`);
    pushEvent("error", `Post gagal: ${err.message}`);
    return "post-error";
  }
}

module.exports = { runReplySession, runPostSession };
