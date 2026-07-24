/**
 * lib/platforms/anonchat/config.js
 * Konfigurasi AnonChat — reverse-engineered dari alpha.anonchat.com
 *
 * Auth: cookie-based (auth_token + user_id) via env ANONCHAT_COOKIES
 *   Format: ANONCHAT_COOKIES="auth_token=xxx; user_id=yyy"
 *
 * API & WS: URL di-discover runtime dari anonchat-connect-url.stivisto.com
 * Socket: Socket.io v4, transport websocket, query-param auth
 *
 * Events (reverse-engineered dari /_next/static/chunks/9312-*.js):
 *   emit : "start-search"    { gender, interests }
 *   on   : "partner-found"   { _id: dialogId, partnerPublicInfo, meta }
 *   emit : "send-message"    { dialogId, message: {msgId, type, text} }
 *   on   : "send-message"    { dialogId, message: {sender, text, ...} }
 *   emit : "close-dialog"    { _id: dialogId }
 *   on   : "close-dialog"    { _id: dialogId }
 *   emit : "quit-searching-queue"  (no payload)
 *
 * Secret hash (dari _generateSecretHash):
 *   CryptoJS.AES.encrypt(JSON.stringify([{secret: userId}]), reversedKey)
 *   Key = Array.from("Aa6A2P5imRxzf4aHBEeEHxrK5NXkKujF35QfUx9I").reverse().join("")
 */

"use strict";

module.exports = {
  // Service untuk mendapatkan WS/API URL secara dinamis
  CONNECT_URL_SERVICE: "https://anonchat-connect-url.stivisto.com",

  // Fallback kalau service down
  API_SERVER_FALLBACK: "https://anonchatapi.stivisto.com",

  // Browser identity
  ORIGIN:     "https://alpha.anonchat.com",
  REFERER:    "https://alpha.anonchat.com/search",
  USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",

  // App version (dari bundle — rE: "5.99.0")
  APP_VERSION: "5.99.0",

  // AES key (dibalik di runtime): Array.from(SECRET_KEY_RAW).reverse().join("")
  SECRET_KEY_RAW: "Aa6A2P5imRxzf4aHBEeEHxrK5NXkKujF35QfUx9I",

  // Preferences untuk start-search
  GENDER:    "any",   // "male" | "female" | "any"
  INTERESTS: [],

  // Pesan promosi — dipilih acak
  MESSAGE_GREETS: [
    "heyy ada yang mau chat? 😊 cari teman ngobrol asik di @botchatanonymouss_bot",
    "hi! lagi nyari teman chat nih 😄 yuk gabung @botchatanonymouss_bot buat chat random seru",
    "hello~ bosen sendiri? chat yuk di @botchatanonymouss_bot, anonim & gratis 🔥",
    "hai! ketemu yang bisa diajak ngobrol 😁 kalau mau lanjut chat seru cek @botchatanonymouss_bot",
    "hey, mau cari teman chat yang asyik? coba @botchatanonymouss_bot aja, banyak yang online 🙌",
  ],
  MESSAGE_GOODBYE: "makasih udah chat 😊 kalau mau lanjut, ketemu di @botchatanonymouss_bot ya!",

  // Timing (ms)
  DELAY_SEND_MS:    700,
  DELAY_GOODBYE_MS: 600,
  DELAY_END_MS:     1500,
  WAIT_MATCH_MS:    60_000,
  WAIT_REPLY_MS:    35_000,
  LOOP_DELAY_MS:    2_000,

  // Socket
  SOCKET_TIMEOUT_MS:  25_000,
  SEND_TIMEOUT_MS:     6_000,
};
