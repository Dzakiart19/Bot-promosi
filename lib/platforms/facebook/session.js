/**
 * lib/platforms/facebook/session.js
 * Satu siklus bot Facebook: ambil posts → comment → sleep 30 detik.
 *
 * Improvement:
 *   - Per siklus, bot mencoba hingga MAX_POSTS_TO_TRY_PER_CYCLE post
 *   - Jika post komentar dinonaktifkan → langsung skip ke post berikutnya
 *     TANPA menunggu 30 detik (tidak buang-buang waktu)
 *   - Post dari beranda (feed) dan trending ikut dikomentari
 */

"use strict";

const cfg          = require("./config");
const { log, sleep } = require("../../core/logger");
const { stats, pushEvent } = require("../../core/stats");
const { getTokens, discoverCommentDocId, fetchReelPosts, postComment } = require("./client");
const repliedStore = require("./replied-store");
const sentLog      = require("./sent-log");

let _postCache  = [];
let _docId      = null;
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

  // Refresh daftar post secara berkala
  if (_cycleCount % cfg.REEL_REFRESH_EVERY === 1 || _postCache.length === 0) {
    const kw = nextKeyword();
    log("BOT", `[FB] Refresh daftar post (keyword: "${kw}")...`);
    try {
      const fresh = await fetchReelPosts(account.cookieStr, kw);
      if (fresh.length > 0) {
        _postCache = fresh;
        log("INFO", `[FB] ${_postCache.length} post tersedia`);
      } else {
        log("WARN", "[FB] Tidak ada post ditemukan — pakai cache lama");
      }
    } catch (err) {
      log("WARN", `[FB] fetchReelPosts error: ${err.message}`);
    }
  }

  if (_postCache.length === 0) {
    stats.totalNoMatch++;
    pushEvent("search", "[FB] Tidak ada post tersedia untuk dikomentari");
    return "no-posts";
  }

  // ── Loop: coba hingga MAX_POSTS_TO_TRY_PER_CYCLE post per siklus ─────────
  // Jika post disabled → skip langsung (tanpa tunggu 30s), coba post berikutnya.
  // Berhenti begitu berhasil comment atau semua post habis.
  const maxTry = cfg.MAX_POSTS_TO_TRY_PER_CYCLE ?? 10;
  let attempted = 0;

  while (attempted < maxTry) {
    // Pilih post yang belum dikomentari
    const target = _postCache.find(r => !repliedStore.has(r.postId));
    if (!target) {
      stats.totalNoMatch++;
      pushEvent("search", `[FB] Semua ${_postCache.length} post sudah dikomentari — menunggu refresh`);
      _postCache = []; // force refresh siklus berikutnya
      return "all-commented";
    }

    const sourceLabel = target.source === "feed"
      ? "feed"
      : `video:${target.videoId ?? "?"}`;
    const retryNote   = attempted > 0 ? ` [skip ${attempted}]` : "";
    log("INFO", `[FB] Target: post ${target.postId} (${sourceLabel})${retryNote}`);
    stats.status = "matched";

    if (attempted === 0) {
      stats.totalMatches++;
      stats.lastMatchAt = Date.now();
      pushEvent("match", `[FB] Post ${target.postId}`);
    }

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
        // Komentar dinonaktifkan oleh pemilik post — skip langsung, coba berikutnya
        repliedStore.add(target.postId);
        stats.totalFiltered++;
        log("INFO", `[FB] Post ${target.postId}: komentar dinonaktifkan — coba post berikutnya`);
        pushEvent("info", `[FB] Post ${target.postId}: comments disabled, skip`);
        attempted++;
        continue; // ← langsung ke post berikutnya, TANPA tunggu 30s
      }

      // ── Komentar berhasil ─────────────────────────────────────────────────
      repliedStore.add(target.postId);
      stats.totalReplies++;
      stats.totalMsgSent++;
      stats.lastReplyAt = Date.now();
      sentLog.addEntry({
        mode:       "comment",
        targetId:   target.postId,
        targetText: sourceLabel,
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

      // Rate-limit → mundur lama, tandai post agar tidak retry
      if (err.isFbRateLimit || /rate.?limit/i.test(err.message)) {
        log("WARN", `[FB] Rate-limit/spam block oleh Facebook — butuh jeda panjang`);
        pushEvent("warn", `[FB] Rate-limited — istirahat 10 menit`);
        repliedStore.add(target.postId);
        return "rate-limited";
      }

      // doc_id expired → reset cache untuk re-discovery siklus berikutnya
      if (/GraphQL document.*not found/i.test(err.message)) {
        log("WARN", "[FB] doc_id expired — reset untuk re-discovery");
        _docId = null;
      }

      // Akun suspended/checkpoint → berhenti
      if (/checkpoint|suspended|disabled|block/i.test(err.message)) {
        log("WARN", "[FB] Akun terdeteksi checkpoint/suspended");
        return "account-blocked";
      }

      // Error lain → tandai post, lanjut ke post berikutnya dalam siklus
      repliedStore.add(target.postId);
      attempted++;
      // Jika sudah coba banyak dan semua error, keluar
      if (attempted >= 3) {
        return "comment-error";
      }
      continue;
    }
  }

  // Sudah coba MAX_POSTS_TO_TRY_PER_CYCLE post, semua disabled/error
  log("WARN", `[FB] Sudah coba ${attempted} post, semua dinonaktifkan/error — refresh pool berikutnya`);
  _postCache = []; // force refresh
  return "all-disabled";
}

module.exports = { runCommentSession };
