/**
 * lib/platforms/pornhub/session.js
 * Satu siklus bot PornHub:
 *   Mode COMMENT — browse video dari homepage/trending (tanpa keyword search)
 *                  → ambil detail (video_id + XSRF token) → post komentar promo
 *
 * Tidak menggunakan endpoint search (/video?search=...) karena 404 dari IP
 * datacenter Replit. Sebagai gantinya, browse halaman yang tersedia:
 *   /video?o=mv, /video?o=mr, /recommended, /
 *
 * Tidak ada WebSocket/socket.io — murni REST HTTP.
 */

"use strict";

const cfg            = require("./config");
const { sleep, log } = require("../../core/logger");
const { stats, pushEvent } = require("../../core/stats");
const { browseVideos, fetchVideoDetail, postComment } = require("./client");
const repliedStore   = require("./replied-store");
const sentLog        = require("./sent-log");

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Satu siklus COMMENT:
 *   1. Browse video dari homepage/trending (tanpa keyword)
 *   2. Filter: belum dikomentari
 *   3. Ambil detail setiap video (video_id + XSRF token)
 *   4. POST komentar promo
 *
 * @returns {string} reason — "comments-sent" | "no-target" | "fetch-error" | "all-failed"
 */
async function runCommentSession() {
  stats.status = "searching";

  // ── 1. Browse video (tanpa keyword) ────────────────────────────────────────
  let viewkeys, browseUrl;
  try {
    const result = await browseVideos();
    viewkeys  = result.viewkeys;
    browseUrl = result.url;
  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    log("ERROR", `[PH] browseVideos gagal: ${err.message}`);
    pushEvent("error", `browseVideos gagal: ${err.message}`);
    return "fetch-error";
  }

  if (!viewkeys || viewkeys.length === 0) {
    log("INFO", `[PH] 0 video ditemukan dari browse`);
    stats.totalNoMatch++;
    pushEvent("search", `0 video ditemukan dari browse`);
    return "no-target";
  }

  log("INFO", `[PH] ${viewkeys.length} video dari browse (${browseUrl})`);

  // ── 2. Filter: belum dikomentari ───────────────────────────────────────────
  // Pakai viewkey sebagai identifier sementara sampai dapat video_id
  const freshKeys = viewkeys.filter((vk) => !repliedStore.has(vk));

  if (freshKeys.length === 0) {
    log("INFO", `[PH] Semua ${viewkeys.length} video sudah dikomentari — skip`);
    stats.totalNoMatch++;
    pushEvent("search", `Semua video dari browse sudah dikomentari`);
    return "no-target";
  }

  // ── 3. Comment ke MAX_COMMENTS_PER_CYCLE video ────────────────────────────
  const targets  = freshKeys.slice(0, cfg.MAX_COMMENTS_PER_CYCLE);
  let commented  = 0;

  for (const viewkey of targets) {
    // ── Ambil detail (video_id + XSRF token) ─────────────────────────────
    let detail;
    try {
      detail = await fetchVideoDetail(viewkey);
    } catch (err) {
      log("WARN", `[PH] fetchVideoDetail ${viewkey} gagal: ${err.message} — skip`);
      stats.totalErrors++;
      stats.lastErrorMsg = err.message;
      pushEvent("error", `fetchVideoDetail gagal: ${err.message}`);
      continue;
    }

    log("INFO", `[PH] Target: ${detail.videoId} — "${detail.title.slice(0, 60)}"`);
    stats.status = "matched";
    stats.totalMatches++;
    stats.lastMatchAt = Date.now();
    pushEvent("match", `[PH] Video ${detail.videoId} (${viewkey})`);

    // ── Post komentar ─────────────────────────────────────────────────────
    const commentText = pickRandom(cfg.COMMENT_TEXTS);
    try {
      const result = await postComment(detail, viewkey, commentText);

      // Tandai viewkey sudah dikomentari (gunakan videoId sebagai key utama)
      repliedStore.add(viewkey);
      repliedStore.add(detail.videoId);

      stats.totalReplies++;
      stats.totalMsgSent++;
      stats.lastReplyAt = Date.now();

      sentLog.addEntry({
        viewkey,
        videoId:    detail.videoId,
        videoTitle: detail.title,
        sentAt:     Date.now(),
      });

      log("SUCCESS", `[PH] Komentar terkirim ke video ${detail.videoId} → commentId ${result.commentId || "?"}`);
      pushEvent("reply", `[PH] → https://www.pornhub.org/view_video.php?viewkey=${viewkey}`);
      commented++;

    } catch (err) {
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = err.message;
      log("ERROR", `[PH] Komentar ke ${detail.videoId} gagal: ${err.message}`);
      pushEvent("error", `Komentar ke ${detail.videoId} gagal: ${err.message}`);

      // Kalau 401 = cookies expired — hentikan siklus, beri tahu operator
      if (/401|expired|cookies/i.test(err.message)) {
        log("WARN", "[PH] Cookies expired — update PORNHUB_COOKIES di environment");
        return "cookies-expired";
      }
    }

    // Jeda antar komentar supaya tidak terlihat spam
    if (commented < targets.length - 1) {
      await sleep(cfg.POST_DELAY_MS);
    }
  }

  return commented > 0 ? "comments-sent" : "all-failed";
}

module.exports = { runCommentSession };
