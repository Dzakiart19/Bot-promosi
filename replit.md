# Multi-Platform Chat Bot

## Ringkasan Proyek

Bot otomatis Node.js yang berjalan secara paralel di **9 platform**: OpenTalk, Chatib, DuckChat (chat anonim), X Bot (Twitter), 3 Telegram Bot (1 akun, 3 target bot), GETTR Bot, dan AnonChat. Semua bot berjalan dalam **2 workflow** — satu "All Bots" launcher dan satu "Telegram Bot" terpisah — dengan shared infra (logger, stats, Express server, dashboard monitor) di `lib/core/`.

## Cara Menjalankan

- **Development (Replit):** 2 workflow aktif: "All Bots" + "Telegram Bot"
- **Deployment:** `node bot/start-all.js` — spawn semua bot dari registry sekaligus
- **Install:** `npm install` (sekali saja setelah clone/import)

## Workflows (hanya 2)

| Workflow | Command | Keterangan |
|---|---|---|
| **All Bots** | `node launchers/all-bots.js` | Jalankan 9 bot non-Telegram sekaligus (port 8000 adalah primary) |
| **Telegram Bot** | `PORT=4000 node bot/telegram-bot.js` | Terpisah karena butuh OTP UI + shared session untuk TemanID/RandomPacar |

## Ports & Bot

| Bot | Port | Platform |
|---|---|---|
| OpenTalk | 8000 | opentalk.club/text/ |
| Chatib | 3003 | app.chatib.chat |
| DuckChat | 3004 | duckchat.club/lake |
| X Bot | 3005 | x.com (auto-comment) |
| Telegram | 4000 | @botchatanonymouss_bot |
| TemanID | 3006 | @temanidbot |
| RandomPacar | 3007 | @random_pacar_bot |
| GETTR | 3008 | gettr.com (auto-post + comment) |
| AnonChat | 3009 | alpha.anonchat.com/search |

## Environment Variables

| Variabel | Keterangan |
|---|---|
| `X_COOKIES` | Cookie session X: `auth_token=...; ct0=...` |
| `TELEGRAM_API_ID` | App ID dari my.telegram.org |
| `TELEGRAM_API_HASH` | App hash dari my.telegram.org |
| `TELEGRAM_PHONE` | Nomor HP format internasional (+62...) |
| `GETTR_TOKEN` | JWT token GETTR dari browser |
| `GETTR_USER_ID` | User ID GETTR (numeric) |
| `GETTR_USERNAME` | Username GETTR |
| `ANONCHAT_COOKIES` | Cookie AnonChat: `auth_token=...; user_id=...` |

> **Catatan:** `TELEGRAM_SESSION` / `SESSION_SECRET` TIDAK perlu diisi manual.
> Session tersimpan otomatis ke Replit DB + file `.telegram_session` setelah OTP pertama.

## Autentikasi Telegram (sekali saja)

1. Pastikan `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, dan `TELEGRAM_PHONE` sudah diset di env vars
2. Start workflow **Telegram Bot**
3. Buka **Monitor Dashboard** → tab Telegram Bot
4. Klik **Kirim OTP** → masukkan kode dari Telegram
5. Bot langsung jalan — session tersimpan di Replit DB (tidak hilang saat restart/deploy)

## Arsitektur

```
lib/core/               ← infra bersama: logger, stats, Express server, platforms-registry
lib/platforms/
  opentalk/             ← config + guest + session + index
  chatib/
  duckchat/
  anonchat/
  telegram/
    config.js             ← target bot, pesan promo, timing
    shared-session.js     ← createMessageListener + runSession GENERIK
    session.js            ← thin wrapper — bind cfg telegram ke shared-session
    auth-server.js        ← web auth server + stats proxy
    persistence.js        ← baca/tulis session via Replit DB + file fallback
    index.js
  temanid/
    session.js            ← thin wrapper — bind cfg temanid ke shared-session
    persistence.js        ← re-export dari telegram/persistence (SAME DB KEY)
  randompacar/
    session.js            ← thin wrapper — bind cfg randompacar ke shared-session
    persistence.js        ← re-export dari telegram/persistence (SAME DB KEY)
  x/
    config.js             ← keywords, reply/comment/post texts, timing
    client.js             ← GraphQL client (auto-discover queryId)
    guest.js              ← verifikasi X_COOKIES
    session.js            ← runReplySession / runCommentSession / runPostSession
    replied-store.js      ← persist ID tweet yang sudah dibalas
    sent-log.js           ← riwayat kiriman in-memory
    transaction-id.js     ← generate x-client-transaction-id header
  gettr/
    config.js
    client.js             ← login + trending + post/comment
    session.js            ← runCommentSession / runPostSession
    replied-store.js
    sent-log.js
bot/
  opentalk-bot.js
  chatib-bot.js
  duckchat-bot.js
  x-bot.js
  telegram-bot.js        ← main loop + auth/re-auth otomatis
  temanid-bot.js         ← secondary Telegram bot (no auth UI)
  randompacar-bot.js     ← secondary Telegram bot (no auth UI)
  gettr-bot.js           ← GETTR social platform bot (POST + COMMENT)
  anonchat-bot.js        ← AnonChat anonymous chat bot (cookie auth)
  telegram-auth.js       ← FALLBACK MANUAL (jalankan di shell, bukan workflow)
  start-all.js           ← launcher untuk deployment
launchers/
  all-bots.js            ← launcher tunggal semua bot non-Telegram (9 bot, 1 workflow)
public/
  monitor.html           ← dashboard monitor universal (auto-refresh 5 detik)
```

---

## ⚠️ ATURAN KRITIS — JANGAN DILANGGAR

### Telegram: Satu Login, Semua Bot Jalan

Ketiga bot Telegram (telegram-bot, temanid-bot, randompacar-bot) **berbagi satu session/akun Telegram**.
Session tersimpan di Replit DB — login cukup sekali di dashboard port 4000.

- `temanid-bot.js` dan `randompacar-bot.js` WAJIB dipanggil dengan `startServer(name, { authProxy: false })`
- Tanpa `authProxy: false`, dashboard mereka tampilkan tombol OTP Telegram (salah)

### Platforms Registry: Restart SEMUA setelah edit

Setelah edit `lib/core/platforms-registry.js`, restart workflow **All Bots** (tidak perlu restart per-bot karena semua dalam satu proses launcher). Telegram Bot perlu restart juga jika registry diubah.

### Telegram Bot: Port 4000

Telegram Bot WAJIB jalan di port 4000 (bukan 3000). Di environment autoscale, `$PORT=3000` sudah diklaim oleh aggregator deployment.

### All Bots Launcher: Port 8000 adalah primary

Launcher `launchers/all-bots.js` dikonfigurasi `waitForPort=8000` (OpenTalk Bot). Replit menunggu port ini sebelum menandai workflow RUNNING.

### PornHub Bot: Cookie platform=pc untuk search

Cookie browser user berisi `platform=mobile` yang menyebabkan redirect ke pornhub.org/video?search=... (return 404). Client secara otomatis mengganti `platform=mobile` → `platform=pc` untuk request search/video detail. Jangan ubah ini.

---

## Detail Per Platform

### Chat Anonim (OpenTalk, Chatib, DuckChat, AnonChat)

Semua mengikuti pola: `createGuest() → connect WebSocket → join queue → match → kirim sapaan → tunggu balasan → kirim pamit → disconnect → loop`

| Platform | Auth | Enkripsi | Catatan |
|---|---|---|---|
| OpenTalk | JWT (anonymous) | Tidak | peerCountry tersedia (filter negara aktif) |
| Chatib | Cookie (anonymous) | Tidak | Model lobby (broadcast), bukan 1-on-1 queue |
| DuckChat | API token (anonymous) | AES-256-CTR key="secret_key" | Kadang HTTP 504, self-recovering |
| AnonChat | Cookie (akun login) | AES (secret hash) | Butuh `ANONCHAT_COOKIES`; event match: `update-dialog-id` |

### Telegram (3 bot, 1 akun)

- `telegram-bot.js` (port 4000): auth utama + OTP UI di dashboard
- `temanid-bot.js` (port 3006): thin wrapper ke @temanidbot, `authProxy: false`
- `randompacar-bot.js` (port 3007): thin wrapper ke @random_pacar_bot, `authProxy: false`

### X Bot (port 3005)

Siklus: COMMENT → REPLY → POST (masing-masing 1 jam interval, 5 menit loop).
- GraphQL queryId di-discover otomatis dari main.js bundle
- `x-client-transaction-id` wajib (tanpa ini X tolak dengan 404)
- `.replied-ids.json` cegah duplikat reply/comment

### GETTR Bot (port 3008)

Siklus: POST mandiri saja — **1x per 15 menit**.
Mode comment dinonaktifkan (endpoint comment GETTR tidak berfungsi dari server-side).
- Pakai `GETTR_TOKEN` + `GETTR_USER_ID` (lebih andal dari login)

---

## Negara Prioritas

20 negara ditandai ⭐ di log/dashboard: AS, Kanada, Inggris, Australia, Singapura, Arab Saudi, Swedia, Finlandia, Swiss, Jerman, Prancis, Belanda, Belgia, Austria, Jepang, UAE, Qatar, Selandia Baru, Denmark, Luksemburg.

## Filter Negara Partner

Blocklist negara saat ini **kosong** — semua negara partner diterima.

- **OpenTalk & Chatib**: didukung penuh (protokol ekspos negara partner)
- **DuckChat, Telegram, AnonChat, X, GETTR**: tidak bisa difilter

## Menambah Platform Baru

1. Buat `lib/platforms/<nama>/` (config, client, session, replied-store, sent-log, index)
2. Buat `bot/<nama>-bot.js`
3. Tambah baris ke `lib/core/platforms-registry.js`
4. Tambah entry ke `BOTS` array di `launchers/all-bots.js`
5. Restart workflow **All Bots** (dan Telegram Bot jika registry berubah)

## Menambah Telegram Bot Sekunder Baru

1. Buat `lib/platforms/<nama>/config.js` (TARGET_BOT, MATCH_SIGNALS, MESSAGE_GREETS, dll)
2. Buat `lib/platforms/<nama>/persistence.js` → `module.exports = require("../telegram/persistence");`
3. Buat `lib/platforms/<nama>/session.js` → thin wrapper ke `shared-session.js`
4. Buat `bot/<nama>-bot.js` — **WAJIB** `startServer(name, { authProxy: false })`
5. Tambah ke `platforms-registry.js` dan `launchers/all-bots.js`

## User Preferences

- Bahasa komentar kode: Bahasa Indonesia
- Nama event, variabel, konstanta: mengikuti konvensi platform target (hasil recon)
- Setiap platform baru wajib didokumentasikan dengan komentar reverse-engineering di header file
- Restart workflow "All Bots" setelah edit `platforms-registry.js` atau `launchers/all-bots.js`
- Jangan asumsikan kode yang terlihat duplikat pasti bisa di-refactor — baca dulu bedanya
