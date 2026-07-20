/**
 * lib/platforms/facebook/session.js
 * Satu siklus bot Facebook Reels: ambil reel → comment → sleep 30 detik.
 *
 * Tidak ada socket/match — mirip arsitektur X Bot dan GETTR Bot.
 * Daftar Reels di-refresh tiap REEL_REFRESH_EVERY siklus.
 * Token LSD/DTSG di-refresh tiap TOKEN_REFRESH_EVERY siklus.
 */

"use strict";

const cfg          = require("./config");
const { log, sleep } = require("../../core/logger");
const { stats, pushEvent } = require("../../core/stats");
const { getTokens, discoverCommentDocId, fetchReelPosts, postComment } = require("./client");
const repliedStore = require("./replied-store");
const sentLog      = require("./sent-log");

let _reelCache = [];
let _docId     = null;
let _cycleCount = 0;
let _keywordIdx = 0;

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function nextKeyword() {
  const kw = cfg.SEARCH_KEYWORDS[_keywordIdx % cfg.SEARCH_KEYWORDS.length];
  _keywordIdx++;
  return kw;
}

async function runCommentSession(account) {
  _cycleCount++;
  stats.totalSessions++;
  stats.currentSession = stats.totalSessions;
  stats.status = "searching";

  // Refresh token LSD/DTSG secara berkala
  if (_cycleCount % cfg.TOKEN_REFRESH_EVERY === 1 || !account.tokens?.lsd) {
    try {
      log("INFO", "[FB] Refresh token LSD/DTSG...");
      account.tokens = await getTokens(account.cookieStr);
      log("SUCCESS", `[FB] Token refreshed — LSD: ${account.tokens.lsd?.slice(0, 8)}...`);
    } catch (err) {
      log("WARN", `[FB] Refresh token gagal: ${err.message} — pakai token lama`);
    }
  }

  // Discover/cache doc_id
  if (!_docId) {
    _docId = await discoverCommentDocId(account.cookieStr);
    log("INFO", `[FB] Comment doc_id: ${_docId}`);
  }

  // Refresh daftar reel secara berkala
  if (_cycleCount % cfg.REEL_REFRESH_EVERY === 1 || _reelCache.length === 0) {
    const kw = nextKeyword();
    log("BOT", `[FB] Refresh daftar reel (keyword: "${kw}")...`);
    try {
      const fresh = await fetchReelPosts(account.cookieStr, kw);
      if (fresh.length > 0) {
        _reelCache = fresh;
        log("INFO", `[FB] ${_reelCache.length} reel/post tersedia`);
      } else {
        log("WARN", "[FB] Tidak ada reel ditemukan — pakai cache lama");
      }
    } catch (err) {
      log("WARN", `[FB] fetchReelPosts error: ${err.message}`);
    }
  }

  if (_reelCache.length === 0) {
    stats.totalNoMatch++;
    pushEvent("search", "[FB] Tidak ada reel tersedia untuk dikomentari");
    return "no-reels";
  }

  // Pilih target yang belum dikomentari
  const target = _reelCache.find(r => !repliedStore.has(r.postId));
  if (!target) {
    stats.totalNoMatch++;
    pushEvent("search", `[FB] Semua ${_reelCache.length} reel sudah dikomentari — menunggu refresh`);
    _reelCache = []; // force refresh siklus berikutnya
    return "all-commented";
  }

  log("INFO", `[FB] Target: post ${target.postId} (video: ${target.videoId ?? "?"})`);
  stats.status = "matched";
  stats.totalMatches++;
  stats.lastMatchAt = Date.now();
  pushEvent("match", `[FB] Post ${target.postId}`);

  // Post komentar
  const text = pickRandom(cfg.COMMENT_TEXTS);
  try {
    const result = await postComment(
      account.cookieStr,
      account.tokens,
      _docId,
      target.feedbackId,
      text
    );

    if (!result.success) {
      // Komentar dinonaktifkan — tandai sudah dikunjungi agar tidak retry
      repliedStore.add(target.postId);
      stats.totalFiltered++;
      log("INFO", `[FB] Post ${target.postId}: komentar dinonaktifkan — skip`);
      pushEvent("info", `[FB] Post ${target.postId}: comments disabled`);
      return "comments-disabled";
    }

    repliedStore.add(target.postId);
    stats.totalReplies++;
    stats.totalMsgSent++;
    stats.lastReplyAt = Date.now();
    sentLog.addEntry({
      mode:       "comment",
      targetId:   target.postId,
      targetText: `video:${target.videoId ?? "?"}`,
      sentId:     result.commentId,
    });
    log("SUCCESS", `[FB] Komentar terkirim ke post ${target.postId} → commentId=${result.commentId ?? "?"}`);
    pushEvent("reply", `[FB] Komentar → https://www.facebook.com/${target.postId}`);
    return "comment-sent";

  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    log("ERROR", `[FB] Comment ke ${target.postId} gagal: ${err.message}`);
    pushEvent("error", `[FB] Comment ke ${target.postId} gagal: ${err.message}`);

    // Rate-limit Facebook (api_error_code 368, atau pesan generik "Rate limit") → mundur lama
    if (err.isFbRateLimit || /rate.?limit/i.test(err.message)) {
      log("WARN", `[FB] Rate-limit/spam block oleh Facebook — butuh jeda panjang`);
      pushEvent("warn", `[FB] Rate-limited — istirahat 10 menit`);
      // Tandai post ini agar tidak dicoba lagi setelah rate-limit selesai
      repliedStore.add(target.postId);
      return "rate-limited";
    }

    // Jika doc_id expired → reset cache supaya di-discover ulang siklus berikutnya
    if (/GraphQL document.*not found/i.test(err.message)) {
      log("WARN", "[FB] doc_id expired — reset untuk re-discovery");
      _docId = null;
    }

    // Jika akun suspended/checkpoint → stop siklus
    if (/checkpoint|suspended|disabled|block/i.test(err.message)) {
      log("WARN", "[FB] Akun terdeteksi checkpoint/suspended");
      return "account-blocked";
    }

    // Tandai post ini sudah dicoba agar tidak retry terus-menerus pada post yang sama
    repliedStore.add(target.postId);
    return "comment-error";
  }
}

module.exports = { runCommentSession };
