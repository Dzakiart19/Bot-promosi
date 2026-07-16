/**
 * lib/core/stats.js
 * Shared in-memory stats store.
 * Singleton — imported once and mutated everywhere.
 */

"use strict";

const MAX_EVENTS = 50;

const stats = {
  platform:       "Bot",      // nama platform ditampilkan di monitor — di-set oleh bot/<nama>-bot.js
  startTime:      Date.now(),
  totalSessions:  0,
  totalMatches:   0,
  totalMsgSent:   0,
  totalReplies:   0,
  totalErrors:    0,
  totalBlocked:   0,
  totalNoMatch:   0,
  totalNoReply:   0,
  totalFiltered:  0,          // sesi/target di-skip karena negara partner masuk blocklist
  totalPriority:  0,          // match dari negara prioritas (tidak mengubah alur, cuma ditandai)
  currentSession: 0,
  status:         "starting", // starting | connecting | authenticating | searching | matched | idle
  lastMatchAt:    null,
  lastReplyAt:    null,
  lastErrorAt:    null,
  lastErrorMsg:   "",
  recentEvents:   [],         // rolling last MAX_EVENTS entries
};

/**
 * Push a timestamped event into the feed.
 * @param {"match"|"send"|"reply"|"error"|"blocked"|"warn"|"search"|"new_session"|"end_session"} type
 * @param {string} msg
 */
function pushEvent(type, msg) {
  stats.recentEvents.unshift({ ts: Date.now(), type, msg });
  if (stats.recentEvents.length > MAX_EVENTS) stats.recentEvents.pop();
}

module.exports = { stats, pushEvent };
