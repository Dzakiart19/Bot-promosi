/**
 * lib/platforms/youtube/client.js
 * Wrapper tipis di atas youtubei.js (LuanRT/YouTube.js, 5K★).
 *
 * Alur auth:
 *   1. Set env var YOUTUBE_COOKIES berisi cookie string lengkap dari youtube.com
 *      (buka DevTools → Application → Cookies → copy semua sebagai
 *       "SAPISID=xxx; SID=yyy; ..." — sama cara dengan X_COOKIES di X Bot).
 *   2. Innertube.create({ cookie }) otomatis mendeteksi logged_in=true
 *      kalau cookie valid, lalu yt.interact.comment() bisa dipakai.
 *
 * Cara post komentar (hasil recon source youtubei.js):
 *   await yt.interact.comment(video_id, text)
 *   → memanggil CreateCommentEndpoint via InnerTube internal API.
 *   → Tidak butuh OAuth2/API key — cookie browser biasa sudah cukup.
 */

"use strict";

const { log } = require("../../core/logger");

let _yt = null;   // singleton Innertube, di-init sekali saja

/**
 * Ambil (atau buat) instance Innertube yang sudah ter-autentikasi.
 * @returns {Promise<import('youtubei.js').Innertube>}
 */
async function getInnertube() {
  if (_yt) return _yt;

  const { Innertube } = require("youtubei.js");
  const cookie = process.env.YOUTUBE_COOKIES || "";

  if (!cookie.trim()) {
    throw new Error("YOUTUBE_COOKIES belum diset — isi dengan cookie string dari youtube.com");
  }

  _yt = await Innertube.create({ cookie });

  if (!_yt.session.logged_in) {
    _yt = null;
    throw new Error("YOUTUBE_COOKIES tidak valid / expired — login ulang di browser lalu copy cookie baru");
  }

  const ctx = _yt.session.context?.client;
  const handle = ctx?.visitorData ? "(visitorData OK)" : "(no visitorData)";
  log("INFO", `[YT] Innertube init OK ${handle}`);
  return _yt;
}

/**
 * Reset singleton (dipakai ketika cookie dianggap expired).
 */
function resetInnertube() {
  _yt = null;
}

/**
 * Verifikasi cookie YouTube masih valid.
 * @returns {Promise<{ logged_in: boolean, visitorData: string }>}
 */
async function verifyLogin() {
  const yt = await getInnertube();
  return {
    logged_in:   yt.session.logged_in,
    visitorData: yt.session.context?.client?.visitorData || "",
  };
}

/**
 * Cari video YouTube berdasarkan keyword.
 * @param {string} keyword
 * @returns {Promise<Array<{ videoId: string, title: string, channel: string, url: string }>>}
 */
async function searchVideos(keyword) {
  const yt = await getInnertube();
  const results = await yt.search(keyword, { type: "video" });

  const videos = [];
  for (const v of (results.videos || [])) {
    const videoId = v.video_id || v.id;
    const title   = v.title?.text || v.title || "";
    const channel = v.author?.name || v.channel?.name || "";
    if (!videoId) continue;
    videos.push({
      videoId,
      title,
      channel,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }
  return videos;
}

/**
 * Post komentar ke video YouTube.
 * @param {string} videoId
 * @param {string} text
 * @returns {Promise<{ success: boolean, data: any }>}
 */
async function postComment(videoId, text) {
  const yt = await getInnertube();

  if (!yt.session.logged_in) {
    resetInnertube();
    throw new Error("Session tidak logged_in — cookie mungkin expired");
  }

  const result = await yt.interact.comment(videoId, text);
  return { success: true, data: result };
}

module.exports = { getInnertube, resetInnertube, verifyLogin, searchVideos, postComment };
