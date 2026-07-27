/**
 * lib/platforms/xnxx/session.js
 * Satu siklus bot XNXX:
 *   Mode COMMENT — browse video dari search → ambil detail (videoId)
 *                → solve FriendlyCaptcha PoW → post komentar promo
 *
 * Tidak ada login/cookie session yang perlu dikelola manual —
 * server XNXX menerima komentar anonymous dengan FriendlyCaptcha PoW.
 */

"use strict";

const cfg              = require("./config");
const { sleep, log }   = require("../../core/logger");
const { stats, pushEvent } = require("../../core/stats");
const { browseVideos, fetchVideoDetail, postComment } = require("./client");
const repliedStore     = require("./replied-store");
const sentLog          = require("./sent-log");

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Satu siklus COMMENT:
 *   1. Browse video dari search (keyword random)
 *   2. Filter: belum dikomentari
 *   3. Ambil detail tiap video (videoId)
 *   4. Solve FriendlyCaptcha PoW + POST komentar promo
 *
 * @returns {string} reason — "comments-sent" | "no-target" | "fetch-error" | "all-failed"
 */
async function runCommentSession() {
  stats.status = "searching";

  // ── 1. Browse video ─────────────────────────────────────────────────────────
  const keyword = pickRandom(cfg.SEARCH_KEYWORDS);
  const page    = Math.floor(Math.random() * 5) + 1;   // halaman 1–5

  let slugs, browseUrl;
  try {
    const result = await browseVideos(keyword, page);
    slugs     = result.slugs;
    browseUrl = result.url;
  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    log("ERROR", `[XNXX] browseVideos gagal: ${err.message}`);
    pushEvent("error", `browseVideos gagal: ${err.message}`);
    return "fetch-error";
  }

  if (!slugs || slugs.length === 0) {
    log("INFO", `[XNXX] 0 video ditemukan dari browse`);
    stats.totalNoMatch++;
    pushEvent("search", `0 video ditemukan dari browse`);
    return "no-target";
  }

  log("INFO", `[XNXX] ${slugs.length} video dari browse (${browseUrl})`);

  // ── 2. Filter: belum dikomentari ────────────────────────────────────────────
  const freshSlugs = slugs.filter((s) => !repliedStore.has(s));

  if (freshSlugs.length === 0) {
    log("INFO", `[XNXX] Semua ${slugs.length} video sudah dikomentari — skip`);
    stats.totalNoMatch++;
    pushEvent("search", `Semua video dari browse sudah dikomentari`);
    return "no-target";
  }

  // ── 3. Comment ke MAX_COMMENTS_PER_CYCLE video ──────────────────────────────
  const targets  = freshSlugs.slice(0, cfg.MAX_COMMENTS_PER_CYCLE);
  let commented  = 0;

  for (const slug of targets) {
    // ── Ambil video detail (videoId) ───────────────────────────────────────
    let detail;
    try {
      detail = await fetchVideoDetail(slug);
    } catch (err) {
      log("WARN", `[XNXX] fetchVideoDetail ${slug} gagal: ${err.message} — skip`);
      stats.totalErrors++;
      stats.lastErrorMsg = err.message;
      pushEvent("error", `fetchVideoDetail gagal: ${err.message}`);
      continue;
    }

    log("INFO", `[XNXX] Target: ${detail.videoId} — "${detail.title.slice(0, 60)}"`);
    stats.status = "matched";
    stats.totalMatches++;
    stats.lastMatchAt = Date.now();
    pushEvent("match", `[XNXX] Video ${detail.videoId} (${slug})`);

    // ── Post komentar (dengan FC PoW) ──────────────────────────────────────
    const commentText = pickRandom(cfg.COMMENT_TEXTS);
    try {
      const result = await postComment(detail, commentText);

      // Tandai slug + videoId sudah dikomentari
      repliedStore.add(slug);
      repliedStore.add(detail.videoId);

      stats.totalReplies++;
      stats.totalMsgSent++;
      stats.lastReplyAt = Date.now();

      sentLog.addEntry({
        slug,
        videoId:    detail.videoId,
        videoTitle: detail.title,
        sentAt:     Date.now(),
      });

      log("SUCCESS", `[XNXX] Komentar terkirim ke video ${detail.videoId} → commentId ${result.commentId || "?"}`);
      pushEvent("reply", `[XNXX] → https://www.xnxx.com${slug}`);
      commented++;

    } catch (err) {
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = err.message;
      log("ERROR", `[XNXX] Komentar ke ${detail.videoId} gagal: ${err.message}`);
      pushEvent("error", `Komentar ke ${detail.videoId} gagal: ${err.message}`);

      // Captcha gagal — tunggu lebih lama sebelum retry
      if (/captcha/i.test(err.message)) {
        log("WARN", "[XNXX] Captcha gagal — cooldown 10 menit sebelum siklus berikutnya");
        await sleep(10 * 60_000);
        return "captcha-failed";
      }
    }

    // Jeda antar komentar
    if (commented < targets.length - 1) {
      await sleep(cfg.POST_DELAY_MS);
    }
  }

  return commented > 0 ? "comments-sent" : "all-failed";
}

module.exports = { runCommentSession };
