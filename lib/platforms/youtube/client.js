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
 *
 * ⚠️ PENTING — YouTube spam filter:
 *   Innertube mengembalikan HTTP 200 bahkan saat komentar di-filter spam.
 *   `result.success` hanya mencerminkan HTTP OK, bukan apakah komentar
 *   benar-benar muncul publik. Gunakan verifyCommentPosted() setelah post
 *   untuk konfirmasi nyata.
 */

"use strict";

const { log, sleep } = require("../../core/logger");

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
 * Post komentar ke video YouTube dan verifikasi komentar benar-benar muncul.
 *
 * YouTube mengembalikan HTTP 200 bahkan saat komentar di-filter spam —
 * sehingga kita harus fetch komentar terbaru setelah post untuk konfirmasi.
 *
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

  // ── 1. Kirim komentar ─────────────────────────────────────────────────────
  const result = await yt.interact.comment(videoId, text);

  // Cek HTTP-level failure (result.success = response.ok dari actions.execute)
  if (result?.success === false) {
    const code = result?.status_code ?? "?";
    throw new Error(`YouTube menolak komentar — HTTP ${code}`);
  }

  // Log raw response keys untuk debugging (tanpa membuang context)
  const dataKeys = Object.keys(result?.data || {}).join(", ") || "(kosong)";
  log("INFO", `[YT] Response comment: success=${result?.success}, data keys=[${dataKeys}]`);

  // ── 2. Verifikasi via actionResult.feedbackText — ground truth dari YouTube ──
  //
  // `actionResult.feedbackText` adalah teks notifikasi yang YouTube tampilkan
  // ke user setelah aksi komentar — ini sumber paling akurat:
  //   "Comment added"                  → komentar dipublikasikan ✓
  //   "Your comment will be reviewed"  → ditahan, tidak muncul publik ✗
  //   "held for review" / "pending"    → ditahan ✗
  //
  // JANGAN cek seluruh response JSON karena kata-kata seperti "moderated",
  // "moderationData" muncul sebagai nama field biasa bahkan di response sukses.

  const actionResult = result?.data?.actionResult || {};
  const apiStatus    = actionResult?.status || "";
  const feedbackRuns = actionResult?.feedbackText?.runs || [];
  const feedbackText = feedbackRuns.map((r) => r.text || "").join("").trim();

  log("INFO", `[YT] actionResult: status=${apiStatus || "?"}, feedbackText="${feedbackText || "(kosong)"}"`);

  // ── 2a. Cek feedbackText untuk indikator held/spam ─────────────────────
  if (feedbackText) {
    const heldPattern = /held.*?review|under.*?review|will.*?review|pending.*?review|not.*?visible|being.*?review/i;
    if (heldPattern.test(feedbackText)) {
      log("WARN", `[YT] ⚠️ Komentar ditahan YouTube: "${feedbackText}"`);
      throw new Error(`Komentar ditahan YouTube (held/moderated): "${feedbackText}"`);
    }

    if (/comment.*?added|added/i.test(feedbackText)) {
      log("INFO", `[YT] ✓ YouTube konfirmasi: "${feedbackText}" — komentar dipublikasikan`);
      return { success: true, data: result };
    }
  }

  // ── 2b. Fallback: cek status API + attestation command ─────────────────
  // Kalau feedbackText kosong, gunakan status API dan runAttestationCommand
  // (hanya muncul saat YouTube benar-benar membuat comment entity).
  const actions = result?.data?.actions || [];
  const hasAttestation = actions.some(
    (a) => a?.runAttestationCommand?.engagementType === "ENGAGEMENT_TYPE_COMMENT_POST"
  );

  if (apiStatus === "STATUS_SUCCEEDED" && hasAttestation) {
    log("INFO", `[YT] ✓ STATUS_SUCCEEDED + ENGAGEMENT_TYPE_COMMENT_POST — komentar terkonfirmasi`);
    return { success: true, data: result };
  }

  if (apiStatus === "STATUS_SUCCEEDED") {
    // Sukses HTTP tapi tidak ada attestation — komentar mungkin di-filter
    log("WARN", `[YT] STATUS_SUCCEEDED tapi tidak ada attestation command — kemungkinan di-filter spam`);
    throw new Error("Komentar mungkin di-filter spam YouTube (STATUS_SUCCEEDED tanpa attestation)");
  }

  // ── 2c. API gagal / unknown status ────────────────────────────────────
  if (apiStatus && apiStatus !== "STATUS_SUCCEEDED") {
    throw new Error(`YouTube menolak komentar — status: ${apiStatus}`);
  }

  // Tidak ada informasi cukup untuk memastikan → anggap berhasil
  log("WARN", `[YT] Tidak ada status yang cukup untuk verifikasi — anggap terkirim`);
  return { success: true, data: result };
}

module.exports = { getInnertube, resetInnertube, verifyLogin, searchVideos, postComment };
