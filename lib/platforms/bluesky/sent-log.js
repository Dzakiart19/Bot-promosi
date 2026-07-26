/**
 * lib/platforms/bluesky/sent-log.js
 * Riwayat reply/post yang berhasil dikirim oleh Bluesky Bot.
 * Disimpan in-memory (reset tiap restart), maksimal MAX entri terakhir.
 * Dibaca dashboard lewat /api/stats → stats.sentLog.
 */

"use strict";

const MAX = 100;
const log = [];

/**
 * @param {{ mode, targetUri, targetText, sentUri, sentAt }} entry
 */
function addEntry({ mode, targetUri, targetText, sentUri, sentAt }) {
  const handleFromUri = (uri) => {
    // at://did:plc:xxx/app.bsky.feed.post/rkey → https://bsky.app/profile/did:plc:xxx/post/rkey
    if (!uri) return null;
    const parts = uri.replace("at://", "").split("/");
    return parts.length >= 3
      ? `https://bsky.app/profile/${parts[0]}/post/${parts[2]}`
      : null;
  };

  log.unshift({
    mode,
    targetUri:  targetUri  || null,
    targetText: String(targetText || "").slice(0, 120),
    targetUrl:  handleFromUri(targetUri),
    sentUri:    sentUri    || null,
    sentUrl:    handleFromUri(sentUri),
    sentAt:     sentAt     || Date.now(),
  });
  if (log.length > MAX) log.pop();
}

module.exports = { addEntry, log };
