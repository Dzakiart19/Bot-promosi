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
    "halo! lagi on sendiri nih, ada yang mau ngobrol? cek @botchatanonymouss_bot yuk 👋",
    "heyy iseng-iseng chat nih 😁 kalau mau chat lebih seru, ada @botchatanonymouss_bot loh",
    "hai hai~ nyari teman ngobrol yang asik? di @botchatanonymouss_bot banyak banget 😄",
    "hello! bosen scroll-scroll doang? mending chat langsung aja di @botchatanonymouss_bot 🤙",
    "hei, lagi cari teman cerita? yuk mampir @botchatanonymouss_bot, anonim aman 🙂",
    "heyy! ada yang bisa diajak ngobrol gak? atau langsung cuss ke @botchatanonymouss_bot 🔥",
    "hi~ seneng bisa ketemu orang baru 😊 kalau mau chat lebih banyak, join @botchatanonymouss_bot",
    "halo semuanya! siapa nih yang mau ngobrol seru? cek dulu @botchatanonymouss_bot 👀",
    "hai! lagi pengen kenalan sama orang baru 😁 udah coba @botchatanonymouss_bot belum?",
    "hey hey~ baru nyoba chat random nih 😄 tapi ada yang lebih seru: @botchatanonymouss_bot",
    "heyy! mau ngobrol nggak? atau kalau pengen lebih banyak teman, ada @botchatanonymouss_bot 🙌",
    "hai! lagi males sendiri nih hehe~ yuk gabung @botchatanonymouss_bot biar rame 🎉",
    "hello! siapa di sini yang suka chat random? share ke @botchatanonymouss_bot juga dong 😏",
    "hei~ ketemu orang baru selalu seru 😊 makin seru kalau di @botchatanonymouss_bot",
    "heyy! nggak ada yang bisa diajak ngobrol di sini? coba @botchatanonymouss_bot deh 🤗",
    "hi! lagi online nih, ada yang mau temenin ngobrol? atau di @botchatanonymouss_bot banyak 😄",
    "halo~ apa kabar? kalau lagi pengen chat anonim, langsung aja ke @botchatanonymouss_bot 🔥",
    "hai! siapa yang suka kenalan sama orang baru? join @botchatanonymouss_bot yuk, gratis 😁",
    "hey~ random chat emang seru sih 😏 tapi @botchatanonymouss_bot lebih seru lagi loh",
    "heyy! lagi nyoba chat random, eh ternyata seru juga 😄 coba juga @botchatanonymouss_bot",
    "halo! pengen punya banyak teman ngobrol? @botchatanonymouss_bot tempatnya 🙌",
    "hi~ siapa yang lagi bosen sendirian? ayo ngobrol! atau ke @botchatanonymouss_bot 👋",
    "hai hai! ketemu teman baru via chat itu menyenangkan 😊 makin banyak di @botchatanonymouss_bot",
    "hey! nggak perlu bosen lagi, ada @botchatanonymouss_bot buat chat anonim kapan aja 🤙",
    "heyy~ malam ini mau ngobrol sama siapa nih? coba @botchatanonymouss_bot, banyak yang online 🌙",
    "halo! baru tau ada chat random yang asyik? itu @botchatanonymouss_bot, wajib dicoba 😍",
    "hai! lagi pengen curhat atau sekadar ngobrol? @botchatanonymouss_bot siap nemenin 💬",
    "hey~ ngobrol sama stranger itu seru ternyata! makin seru di @botchatanonymouss_bot 🔥",
    "heyy! siapa nih yang suka chat-chat random? kita main ke @botchatanonymouss_bot yuk 😄",
    "hi! nggak ada teman ngobrol malam ini? langsung aja ke @botchatanonymouss_bot 🌟",
    "halo~ enjoy chat anonim? @botchatanonymouss_bot ada banyak orang seru yang bisa diajak ngobrol 😊",
    "hai! mau kenalan? atau kalau pengen pilihan lebih banyak, cek @botchatanonymouss_bot 👀",
    "heyy! udah tau belum ada Telegram bot buat chat random? itu @botchatanonymouss_bot 🎯",
    "hey~ lagi online nih, siapa yang mau ngobrol? kalau gak ada, ke @botchatanonymouss_bot aja 😁",
    "halo! random chat paling asyik yang pernah ada: @botchatanonymouss_bot, anonim dan gratis 🙌",
    "hai~ seneng deh ketemu orang baru 😄 banyak lagi nih di @botchatanonymouss_bot",
    "heyy! jangan sendirian terus, gabung @botchatanonymouss_bot dan ngobrol sama banyak orang 💪",
    "hi! lagi cari koneksi baru? @botchatanonymouss_bot tempat yang pas, langsung coba 🤗",
    "halo! mau ngobrol santai tanpa ribet? @botchatanonymouss_bot solusinya, anonim & bebas 😏",
    "hai! kalau chat di sini kurang seru, yuk ramaikan @botchatanonymouss_bot bareng-bareng 🔥",
    "hey~ setiap hari ada orang baru di @botchatanonymouss_bot, seru banget buat kenalan 😊",
    "heyy! mau nambah teman ngobrol? @botchatanonymouss_bot tempat yang tepat, join yuk 🎉",
    "halo~ siapa yang suka ngobrol tengah malam? ada @botchatanonymouss_bot, selalu rame 🌙",
    "hi! iseng tapi pengen ngobrol seru? coba deh @botchatanonymouss_bot, pasti ketagihan 😄",
    "hai! chat random itu refreshing banget kan? makin refreshing di @botchatanonymouss_bot 💬",
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
