/**
 * lib/platforms/opentalk/session.js
 * Satu sesi chat di OpenTalk: konek → start queue → match → sapa → pamit → stop.
 *
 * Flow (reverse-engineered dari /js/desktop/chat.js):
 *   1. io(`${WS_SERVER}${SOCKET_NAMESPACE}`, { auth:{token,country}, transports })
 *   2. on("connect")   → emit "start" (ack) { mode, interests, gender, wantGender, wantContinent, nsfwOptIn }
 *   3. on("searching") → server konfirmasi masuk antrian (tidak perlu aksi)
 *   4. on("matched")   → { sessionId, peerCountry } → emit "message" (ack) sapa
 *   5. on("message")   → { text, msgId, replyTo } → emit "message" (ack) pamit → emit "stop" (ack)
 *   6. on("peer_left") → sesi berakhir dari sisi partner
 */

"use strict";

const { io }  = require("socket.io-client");

const cfg     = require("./config");
const { stats, pushEvent } = require("../../core/stats");
const { log } = require("../../core/logger");
const { isBlockedCountry, countryLabel, isPriorityCountry, priorityLabel } = require("../../core/country-filter");

function genMsgId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * Jalankan satu sesi chat penuh.
 * @param {{ token: string, anonId: string, deviceId: string, displayName: string }} guest
 * @returns {Promise<string>} alasan selesai (got-reply, match-timeout, dsb)
 */
function runSession(guest) {
  return new Promise((resolve) => {
    let socket;
    let sessionId    = null;
    let matched      = false; // guard: matched jangan diproses dua kali
    let messageSent  = false; // pesan sapa sudah terkirim
    let goodbyeSent  = false; // pesan pamit sudah terkirim
    let done         = false;
    let matchTimer   = null;
    let replyTimer   = null;
    let queueJoined  = false;

    // ── Selesaikan sesi & bersihkan resource ─────────────────────────────────
    function finish(reason) {
      if (done) return;
      done = true;
      clearTimeout(matchTimer);
      clearTimeout(replyTimer);
      stats.status = "idle";

      try {
        if (socket?.connected) {
          socket.timeout(cfg.SEND_TIMEOUT_MS).emit("stop", null, () => {});
        }
      } catch (_) {}

      setTimeout(() => {
        try { socket?.disconnect(); } catch (_) {}
        resolve(reason);
      }, 400);
    }

    // ── Helper: emit "message" dengan ack ────────────────────────────────────
    function sendMsg(text, label) {
      const msgId = genMsgId();
      socket.timeout(cfg.SEND_TIMEOUT_MS).emit(
        "message",
        { sessionId, text, msgId, replyTo: null },
        (err) => {
          if (err) log("WARN", `${label} timeout/error:`, String(err));
          else     log("BOT", `${label} terkirim (ack ok)`);
        }
      );
      stats.totalMsgSent++;
      log("BOT", `→ ${label}: "${text}"`);
    }

    // ── Mulai cari partner ────────────────────────────────────────────────────
    function startSearch() {
      if (queueJoined || done) return;
      queueJoined = true;
      stats.status = "searching";
      pushEvent("search", `Sesi #${stats.currentSession} mencari partner...`);

      socket.timeout(cfg.SEND_TIMEOUT_MS).emit(
        "start",
        {
          mode:          cfg.MODE,
          interests:     cfg.INTERESTS,
          gender:        cfg.GENDER,
          wantGender:    cfg.WANT_GENDER,
          wantContinent: cfg.WANT_CONTINENT,
          nsfwOptIn:     cfg.NSFW_OPT_IN,
        },
        (err, ack) => {
          if (done) return;
          // Catatan: socket.io callback = (err, ...args). Server OpenTalk
          // meng-ack "start" tanpa payload tambahan (ack undefined) — itu
          // normal/sukses. err hanya terisi kalau ack timeout (tidak ada
          // callback sama sekali dalam SEND_TIMEOUT_MS).
          if (err) {
            log("WARN", `Timeout menunggu ack 'start': ${err.message || err}`);
          } else if (ack !== undefined) {
            log("INFO", "start diterima ack:", JSON.stringify(ack).slice(0, 80));
          }
        }
      );
      log("BOT", "start (join queue) dikirim — mencari partner...");

      matchTimer = setTimeout(() => {
        if (!sessionId) {
          log("WARN", `Tidak dapat match dalam ${cfg.WAIT_MATCH_MS / 1000}s`);
          stats.totalNoMatch++;
          pushEvent("warn", `Sesi #${stats.currentSession}: no match timeout`);
          finish("match-timeout");
        }
      }, cfg.WAIT_MATCH_MS);
    }

    // ── Koneksi Socket.io ─────────────────────────────────────────────────────
    log("INFO", `Konek sebagai ${guest.displayName} (${guest.anonId || guest.deviceId})`);
    stats.status = "connecting";

    socket = io(`${cfg.WS_SERVER}${cfg.SOCKET_NAMESPACE}`, {
      path:            cfg.SOCKET_PATH,
      transports:      cfg.SOCKET_TRANSPORTS,
      withCredentials: true,
      reconnection:    false,
      timeout:         cfg.SOCKET_TIMEOUT_MS,
      auth: {
        token:   guest.token,
        country: "",
      },
      extraHeaders: {
        "Origin":     cfg.ORIGIN,
        "Referer":    cfg.REFERER,
        "User-Agent": cfg.USER_AGENT,
      },
    });

    // ── connect ───────────────────────────────────────────────────────────────
    socket.on("connect", () => {
      log("SUCCESS", `Terhubung — socket.id=${socket.id}`);
      stats.status = "searching";
      startSearch();
    });

    // Server konfirmasi masuk antrian — tidak perlu aksi, hanya log.
    socket.on("searching", () => {
      log("INFO", "searching (dikonfirmasi server)");
    });

    // ── matched ───────────────────────────────────────────────────────────────
    socket.on("matched", (data) => {
      if (done || matched) return;
      matched = true;
      clearTimeout(matchTimer);

      sessionId = data?.sessionId;
      const peerCountry = data?.peerCountry || "?";

      // ── Filter negara ──────────────────────────────────────────────────────
      // Partner dari negara blocklist: putus tanpa kirim sapa, jangan hitung
      // sebagai match biasa, lalu loop utama otomatis mulai sesi baru.
      if (isBlockedCountry(peerCountry)) {
        stats.totalFiltered++;
        log("WARN", `✗ Partner dari ${countryLabel(peerCountry)} — diblokir, skip sesi`);
        pushEvent("blocked", `Partner dari ${countryLabel(peerCountry)} di-skip (blocklist negara)`);
        finish("country-filtered");
        return;
      }

      stats.totalMatches++;
      stats.lastMatchAt = Date.now();
      stats.status = "matched";

      const priority = isPriorityCountry(peerCountry);
      if (priority) {
        stats.totalPriority++;
        log("SUCCESS", `⭐ MATCH PRIORITAS! sessionId=${sessionId} | peerCountry=${priorityLabel(peerCountry)}`);
        pushEvent("priority", `⭐ Partner prioritas dari ${priorityLabel(peerCountry)} | session: ${String(sessionId).slice(0, 8)}…`);
      } else {
        log("SUCCESS", `✓ MATCH! sessionId=${sessionId} | peerCountry=${peerCountry}`);
        pushEvent("match", `Partner dari ${peerCountry} | session: ${String(sessionId).slice(0, 8)}…`);
      }

      // Kirim sapa setelah jeda kecil
      setTimeout(() => {
        if (done) return;
        sendMsg(pick(cfg.MESSAGE_GREETS), "Sapa");
        pushEvent("send", `Sapa dikirim ke partner (${peerCountry})`);
        messageSent = true;

        replyTimer = setTimeout(() => {
          log("WARN", `Tidak ada balasan dalam ${cfg.WAIT_REPLY_MS / 1000}s`);
          stats.totalNoReply++;
          pushEvent("warn", `Sesi #${stats.currentSession}: no reply timeout`);
          finish("no-reply-timeout");
        }, cfg.WAIT_REPLY_MS);
      }, cfg.DELAY_SEND_MS);
    });

    // ── message masuk ─────────────────────────────────────────────────────────
    socket.on("message", (data) => {
      if (done) return;
      const text = data?.text || "(media)";

      stats.totalReplies++;
      stats.lastReplyAt = Date.now();
      log("MSG", `Stranger: "${String(text).slice(0, 120)}"`, `[replies: ${stats.totalReplies}]`);
      pushEvent("reply", `Reply dari partner: "${String(text).slice(0, 80)}"`);

      if (messageSent && !goodbyeSent) {
        goodbyeSent = true;
        clearTimeout(replyTimer);

        setTimeout(() => {
          if (done) return;
          sendMsg(cfg.MESSAGE_GOODBYE, "Pamit");
          pushEvent("send", "Pamit dikirim ke partner");
          setTimeout(() => finish("goodbye-sent"), cfg.DELAY_END_MS);
        }, cfg.DELAY_GOODBYE_MS);
      }
    });

    // ── Events terminasi dari server ──────────────────────────────────────────
    socket.on("peer_left", (data) => {
      log("INFO", "peer_left", JSON.stringify(data || {}).slice(0, 80));
      finish("partner-left");
    });

    socket.on("peer_reconnecting", () => {
      log("WARN", "peer_reconnecting — partner koneksi goyang");
    });

    // ── Error & disconnect ────────────────────────────────────────────────────
    socket.on("connect_error", (err) => {
      log("ERROR", `Koneksi gagal: ${err.message}`);
      stats.totalErrors++;
      stats.lastErrorAt  = Date.now();
      stats.lastErrorMsg = err.message;
      pushEvent("error", `connect_error: ${err.message}`);
      finish("connect-error");
    });

    socket.on("disconnect", (reason) => {
      log("WARN", `Disconnect: ${reason}`);
      if (!done) finish("disconnect");
    });

    socket.on("error", (err) => {
      log("ERROR", "Socket error:", String(err));
      stats.totalErrors++;
      stats.lastErrorMsg = String(err);
      pushEvent("error", String(err));
    });
  });
}

module.exports = { runSession };
