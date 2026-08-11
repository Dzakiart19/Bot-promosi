/**
 * lib/platforms/chatsafari/session.js
 * Satu sesi chat di Chatsafari: konek socket → join room → kirim promo ke
 * setiap user online satu per satu → pamit → pindah ke user berikutnya.
 *
 * Mode blast (tidak tunggu balasan):
 *   1. io(WS_SERVER, { transports:["polling"] })
 *   2. emit "user:join" { id, userId, username, gender, age, avatar, isAnonymous }
 *   3. on "users:update" → kumpulkan user online
 *   4. Pilih target acak → kirim promo → langsung kirim pamit → pilih target berikutnya
 *   5. Ulangi sampai semua user sudah dikirim / banned / disconnect / max per sesi
 *   6. on "account:banned" → finish → caller bikin akun baru
 */

"use strict";

const { io } = require("socket.io-client");

const cfg = require("./config");
const { stats, pushEvent } = require("../../core/stats");
const { log } = require("../../core/logger");

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * Jalankan satu sesi chat — blast ke semua user online tanpa tunggu balasan.
 * @param {{ userId: string, username: string, gender: string, displayName: string }} guest
 * @returns {Promise<string>} alasan selesai
 */
function runSession(guest) {
  return new Promise((resolve) => {
    let socket;
    let onlineUsers    = new Map(); // userId → { username, gender }
    let sentTo         = new Set(); // userId yang sudah dikirim
    let targetId       = null;
    let done           = false;
    let waitUsersTimer = null;
    let sending        = false;    // true sedang delay kirim, jangan pick target baru

    // ── Selesaikan sesi & bersihkan resource ─────────────────────────────────
    function finish(reason) {
      if (done) return;
      done = true;
      clearTimeout(waitUsersTimer);
      stats.status = "idle";

      setTimeout(() => {
        try { socket?.disconnect(); } catch (_) {}
        resolve(reason);
      }, 300);
    }

    // ── Pilih target acak dari daftar user online yang BELUM dikirim ──────────
    function pickTarget() {
      if (targetId || done || sending) return;
      const candidates = [...onlineUsers.keys()].filter(
        (id) => id !== guest.userId && !sentTo.has(id)
      );
      if (candidates.length === 0) return;

      targetId = candidates[Math.floor(Math.random() * candidates.length)];

      stats.totalMatches++;
      stats.lastMatchAt = Date.now();
      stats.status = "matched";

      const targetInfo = onlineUsers.get(targetId);
      const targetName = (targetInfo && targetInfo.username)
        ? targetInfo.username
        : targetId.slice(0, 8);

      log("SUCCESS", `✓ Target dipilih (sisa ${candidates.length} belum dikirim): ${targetName}`);
      pushEvent("match", `Target: ${targetName} (sisa ${candidates.length})`);

      sending = true;

      // Kirim promo setelah delay singkat
      setTimeout(() => {
        if (done) { sending = false; return; }

        // 1) Kirim pesan promo
        const greetMsg = pick(cfg.MESSAGE_GREETS);
        socket.emit("message:send", {
          message:  greetMsg,
          roomId:   cfg.ROOM_ID,
          toUserId: targetId,
        });
        stats.totalMsgSent++;
        log("BOT", `→ Promo ke ${targetName}: "${greetMsg.slice(0, 60)}..."`);
        pushEvent("send", `Promo ke ${targetName}`);

        // 2) Setelah delay singkat, kirim pamit
        setTimeout(() => {
          if (done) { sending = false; return; }

          socket.emit("message:send", {
            message:  cfg.MESSAGE_GOODBYE,
            roomId:   cfg.ROOM_ID,
            toUserId: targetId,
          });
          stats.totalMsgSent++;
          log("BOT", `→ Pamit ke ${targetName}: "${cfg.MESSAGE_GOODBYE}"`);
          pushEvent("send", `Pamit ke ${targetName}`);

          // 3) Tandai sudah dikirim, reset, lanjut target berikutnya
          sentTo.add(targetId);
          targetId = null;
          sending = false;

          // Coba pick target selanjutnya
          pickTarget();

        }, cfg.DELAY_GOODBYE_MS);
      }, cfg.DELAY_SEND_MS);
    }

    // ── Koneksi Socket.IO ─────────────────────────────────────────────────────
    log("INFO", `Konek sebagai ${guest.displayName} (userId=${guest.userId})`);
    stats.status = "connecting";

    socket = io(cfg.WS_SERVER, {
      path:            cfg.SOCKET_PATH,
      transports:      cfg.SOCKET_TRANSPORTS,
      withCredentials: true,
      reconnection:    false,
      timeout:         cfg.SOCKET_TIMEOUT_MS,
      extraHeaders: {
        "Origin":     cfg.ORIGIN,
        "Referer":    cfg.REFERER,
        "User-Agent": cfg.USER_AGENT,
      },
    });

    // ── connect → join room & mulai cari target ───────────────────────────────
    socket.on("connect", () => {
      log("SUCCESS", `Terhubung — socket.id=${socket.id}`);
      stats.status = "searching";
      pushEvent("search", `Sesi #${stats.currentSession} join room, blast mode...`);

      socket.emit("user:join", {
        id:          guest.id || guest.userId,
        userId:      guest.userId,
        username:    guest.username,
        gender:      guest.gender,
        age:         guest.age || 25,
        avatar:      guest.avatar || null,
        isAnonymous: guest.isAnonymous !== undefined ? guest.isAnonymous : true,
      });
      log("BOT", "user:join dikirim — menunggu daftar user online...");

      // Timer: kalau tidak ada user online dalam batas waktu
      waitUsersTimer = setTimeout(() => {
        if (!done && sentTo.size === 0) {
          log("WARN", `Tidak ada user online dalam ${cfg.WAIT_USERS_MS / 1000}s`);
          stats.totalNoMatch++;
          pushEvent("warn", `Sesi #${stats.currentSession}: no users timeout`);
          finish("no-users-timeout");
        }
      }, cfg.WAIT_USERS_MS);
    });

    // ── Daftar user online (dari server) ─────────────────────────────────────
    function processUsersList(data) {
      let users = [];
      if (Array.isArray(data)) {
        users = data;
      } else if (data && Array.isArray(data.users)) {
        users = data.users;
      } else if (data && typeof data === "object") {
        users = Object.values(data);
      }

      for (const u of users) {
        if (!u) continue;
        const id = String(u.id || u.userId || u.user_id || "");
        if (!id || id === guest.userId) continue;
        if (!onlineUsers.has(id)) {
          onlineUsers.set(id, {
            username: u.username || null,
            gender:   u.gender || null,
          });
        }
      }

      pickTarget();
    }

    socket.on("users:update", (data) => {
      processUsersList(data);
    });

    socket.on("online_users", (data) => {
      processUsersList(data);
    });

    socket.on("users_list", (data) => {
      processUsersList(data);
    });

    socket.on("user:joined", (data) => {
      const u = data?.user || data;
      if (!u) return;
      const id = String(u.id || u.userId || u.user_id || "");
      if (!id || id === guest.userId) return;
      onlineUsers.set(id, {
        username: u.username || null,
        gender:   u.gender || null,
      });
      // Kalau sudah selesai kirim ke semua target lama, user baru ini bisa jadi target
      pickTarget();
    });

    socket.on("user:left", (data) => {
      const id = String(data?.userId || data?.id || data?.user_id || "");
      if (id) onlineUsers.delete(id);
    });

    // ── Pesan masuk (hanya log, tidak ditunggu) ─────────────────────────────
    function handleMessage(data) {
      if (done) return;
      const fromId = String(data?.fromUserId || data?.from || data?.userId || "");
      const text = data?.message || data?.text || "(media)";

      const fromInfo = onlineUsers.get(fromId);
      const fromName = (fromInfo && fromInfo.username) || fromId.slice(0, 8);

      stats.totalReplies++;
      stats.lastReplyAt = Date.now();
      log("MSG", `${fromName}: "${String(text).slice(0, 120)}"`, `[replies: ${stats.totalReplies}]`);
      pushEvent("reply", `Reply dari ${fromName}: "${String(text).slice(0, 80)}"`);
    }

    socket.on("message", handleMessage);
    socket.on("message:receive", handleMessage);
    socket.on("receive_message", handleMessage);

    socket.on("typing:start", (data) => {
      const fromId = String(data?.userId || data?.from || "");
      if (fromId) {
        const fromInfo = onlineUsers.get(fromId);
        const fromName = (fromInfo && fromInfo.username) || fromId.slice(0, 8);
        log("INFO", `${fromName} sedang mengetik...`);
      }
    });

    // ── Events terminasi/moderasi dari server ──────────────────────────────────
    socket.on("account:banned", (data) => {
      stats.totalBlocked++;
      const reason = data?.reason || "unknown";
      log("WARN", `account:banned — reason: ${reason}`);
      pushEvent("blocked", `account:banned: ${reason}`);
      finish("account-banned");
    });

    socket.on("banned", (data) => {
      stats.totalBlocked++;
      const reason = data?.reason || "unknown";
      log("WARN", `banned — reason: ${reason}`);
      pushEvent("blocked", `banned: ${reason}`);
      finish("banned");
    });

    socket.on("kicked", (data) => {
      log("WARN", `kicked dari room: ${JSON.stringify(data || {}).slice(0, 100)}`);
      pushEvent("warn", `kicked: ${JSON.stringify(data || {}).slice(0, 80)}`);
      finish("kicked");
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
      log("WARN", `Disconnect: ${reason} (sudah kirim ke ${sentTo.size} user)`);
      if (!done) finish("disconnect");
    });

    socket.on("error", (err) => {
      const msg = (err && typeof err === "object") ? (err.message || JSON.stringify(err)) : String(err);
      log("ERROR", `Socket error: ${msg}`);
      stats.totalErrors++;
      stats.lastErrorMsg = msg;
      pushEvent("error", msg);
    });
  });
}

module.exports = { runSession };
