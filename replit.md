# Multi-Platform Chat Bot

## Ringkasan Proyek

Bot otomatis Node.js yang berjalan secara paralel di 9 platform: OpenTalk, Chatib, DuckChat (chat anonim), X Bot (Twitter), 3 Telegram Bot (1 akun, 3 target bot), GETTR Bot, dan AnonChat. Setiap bot berjalan sebagai proses terpisah pada port berbeda, dengan shared infra (logger, stats, Express server, dashboard monitor) di `lib/core/`.

## Cara Menjalankan

- **Development (Replit):** setiap bot punya workflow sendiri, semua aktif bersamaan
- **Deployment:** `node bot/start-all.js` — spawn semua bot dari registry sekaligus
- **Install:** `npm install` (sekali saja setelah clone/import)

## Ports & Workflows

| Bot | Port | Workflow Name |
|---|---|---|
| OpenTalk | 8000 | OpenTalk Bot |
| Chatib | 3003 | Chatib Bot |
| DuckChat | 3004 | DuckChat Bot |
| X Bot | 3005 | X Bot |
| Telegram | 4000 | Telegram Bot |
| TemanID | 3006 | TemanID Bot |
| RandomPacar | 3007 | RandomPacar Bot |
| GETTR | 3008 | GETTR Bot |
| AnonChat | 3009 | AnonChat Bot |

## Environment Variables (Secrets)

| Variabel | Keterangan |
|---|---|
| `X_COOKIES` | Cookie session X: `auth_token=...; ct0=...` — wajib untuk X Bot |
| `TELEGRAM_API_ID` | App ID dari my.telegram.org |
| `TELEGRAM_API_HASH` | App hash dari my.telegram.org |
| `TELEGRAM_PHONE` | Nomor HP format internasional (+62...) |
| `GETTR_TOKEN` | JWT token GETTR dari browser (lebih andal dari password login) |
| `GETTR_USER_ID` | User ID GETTR (numeric, dari profil atau JWT payload) |
| `GETTR_USERNAME` | Username GETTR (fallback jika tidak pakai TOKEN) |
| `ANONCHAT_COOKIES` | Cookie AnonChat: `auth_token=...; user_id=...` |

> **Catatan:** `TELEGRAM_SESSION` / `SESSION_SECRET` TIDAK perlu diisi manual.
> Session tersimpan otomatis ke Replit DB + file `.telegram_session` setelah OTP pertama.

## Autentikasi Telegram (sekali saja, tanpa shell)

1. Pastikan `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, dan `TELEGRAM_PHONE` sudah diset di Secrets
2. Start workflow **Telegram Bot**
3. Buka **Monitor Dashboard** (tab Telegram Bot di kiri)
4. Klik **Kirim OTP** → masukkan kode dari Telegram
5. Bot langsung jalan otomatis — tidak perlu restart, tidak perlu copy-paste session

Session tersimpan di **Replit DB** — tidak hilang walau:
- Workflow di-restart
- Deploy ulang
- Autoscale hibernasi lalu bangun lagi

Jika session expired: monitor otomatis tampilkan form OTP lagi → bot resume tanpa restart.

## Arsitektur

```
lib/core/           ← infra bersama: logger, stats, Express server, platforms-registry
lib/platforms/
  opentalk/         ← config + guest + session + index
  chatib/
  duckchat/
  anonchat/
  telegram/
    config.js         ← target bot, pesan promo, timing
    shared-session.js ← createMessageListener + runSession GENERIK (menerima cfg)
    session.js        ← thin wrapper — bind cfg telegram ke shared-session
    auth-server.js    ← web auth server + stats proxy (satu Express instance)
    persistence.js    ← baca/tulis session via Replit DB + file fallback
    index.js
  temanid/
    session.js        ← thin wrapper — bind cfg temanid ke shared-session
    persistence.js    ← re-export dari telegram/persistence (SAME DB KEY)
  randompacar/
    session.js        ← thin wrapper — bind cfg randompacar ke shared-session
    persistence.js    ← re-export dari telegram/persistence (SAME DB KEY)
  x/
    config.js         ← keywords, reply/comment/post texts, timing
    client.js         ← GraphQL client (auto-discover queryId + x-client-transaction-id)
    guest.js          ← verifikasi X_COOKIES
    session.js        ← runReplySession / runCommentSession / runPostSession
    replied-store.js  ← persist ID tweet yang sudah dibalas (anti-duplikat)
    sent-log.js       ← riwayat kiriman in-memory (tampil di dashboard)
    transaction-id.js ← generate x-client-transaction-id anti-bot header
  gettr/
    config.js
    client.js         ← login + trending + post/comment
    session.js        ← runCommentSession / runPostSession
    replied-store.js
    sent-log.js
bot/
  opentalk-bot.js
  chatib-bot.js
  duckchat-bot.js
  x-bot.js
  telegram-bot.js    ← main loop + auth/re-auth otomatis
  temanid-bot.js     ← secondary Telegram bot (no auth UI)
  randompacar-bot.js ← secondary Telegram bot (no auth UI)
  gettr-bot.js       ← GETTR social platform bot (POST + COMMENT)
  anonchat-bot.js    ← AnonChat anonymous chat bot (cookie auth)
  telegram-auth.js   ← FALLBACK MANUAL (jalankan di shell, bukan workflow)
  start-all.js       ← launcher deployment
public/
  monitor.html      ← dashboard monitor universal (auto-refresh 2 detik)
```

---

## ⚠️ ATURAN KRITIS — JANGAN DILANGGAR

### Telegram: Satu Login, Semua Bot Jalan

Ketiga bot Telegram (telegram-bot, temanid-bot, randompacar-bot) **berbagi satu session/akun Telegram**.
Session tersimpan di Replit DB — login cukup sekali di dashboard port 4000.

- `temanid-bot.js` dan `randompacar-bot.js` WAJIB dipanggil dengan `startServer(name, { authProxy: false })`
- Tanpa `authProxy: false`, dashboard mereka akan tampilkan tombol OTP yang memperlihatkan form login Telegram padahal mereka tidak perlu login sendiri

### Platforms Registry: Restart SEMUA setelah edit

Setelah edit `lib/core/platforms-registry.js`, restart **SEMUA** workflow (bukan hanya yang baru) karena file ini di-cache in-process. Tanpa restart semua, `/api/stats/all` tidak akan menampilkan platform baru di dashboard.

### Telegram Bot: Port 4000

Telegram Bot WAJIB jalan di port 4000 (bukan 3000). Di environment autoscale, `$PORT=3000` sudah diklaim oleh aggregator deployment — kalau Telegram Bot juga pakai 3000, akan terjadi konflik port yang menyebabkan error logout HTML.

---

## Detail Per Platform

### Chat Anonim (OpenTalk, Chatib, DuckChat, AnonChat)

Semua mengikuti pola: `createGuest() → connect WebSocket → join queue → match → kirim sapaan → tunggu balasan → kirim pamit → disconnect → loop`

| Platform | Auth | Enkripsi | Catatan |
|---|---|---|---|
| OpenTalk | JWT (anonymous) | Tidak | peerCountry tersedia (filter negara aktif) |
| Chatib | Cookie (anonymous) | Tidak | Model lobby (broadcast), bukan 1-on-1 queue; country filter aktif |
| DuckChat | API token (anonymous) | AES-256-CTR key="secret_key" | Kadang HTTP 504, self-recovering |
| AnonChat | Cookie (akun login) | AES (secret hash) | Butuh `ANONCHAT_COOKIES`; **Juli 2026:** event match ganti dari `partner-found` → `update-dialog-id` |

### Telegram (3 bot, 1 akun)

- `telegram-bot.js` (port 4000): auth utama + OTP UI di dashboard
- `temanid-bot.js` (port 3006): thin wrapper ke @temanidbot, `authProxy: false`
- `randompacar-bot.js` (port 3007): thin wrapper ke @random_pacar_bot, `authProxy: false`

### X Bot (port 3005)

Siklus: COMMENT → REPLY → POST (masing-masing 1 jam interval, 5 menit loop).
- GraphQL queryId di-discover otomatis dari main.js bundle
- `x-client-transaction-id` wajib (tanpa ini X tolak dengan 404)
- `.replied-ids.json` cegah duplikat reply/comment
- **Hashtag pool:** `HASHTAG_POOL` (31 tag niche adult) di `config.js` — tiap kiriman ditempel 8 hashtag acak via `pickHashtags()` di `session.js`

### GETTR Bot (port 3008)

Siklus: POST + COMMENT (masing-masing 1 jam, 5 menit loop).
- Pakai `GETTR_TOKEN` + `GETTR_USER_ID` untuk bypass Imperva (lebih andal dari login)
- JSON body: field `txt`, bukan `rich_txt`; `_t:'cmt'` wajib untuk comment
- **Strategi direct-reply (confirmed live test Juli 2026):** satu-satunya endpoint yang benar adalah `POST /api/u/post` dengan `pid: postId` di body. Endpoint `/u/post/{postId}/comment` → ERR untuk root post. Endpoint `/u/post/{c37pId}/comment` → rc OK tapi mengembalikan ID parent (ghost comment, tidak ada yang dibuat).

---

## Negara Prioritas

20 negara ditandai ⭐ di log/dashboard (tanpa skip): AS, Kanada, Inggris, Australia, Singapura, Arab Saudi, Swedia, Finlandia, Swiss, Jerman, Prancis, Belanda, Belgia, Austria, Jepang, UAE, Qatar, Selandia Baru, Denmark, Luksemburg.

## Filter Negara Partner

Blocklist negara saat ini **kosong** — semua negara partner diterima. Untuk memblokir negara tertentu, isi `BLOCKED_COUNTRIES` di `lib/core/country-filter.js`.

- **OpenTalk & Chatib**: didukung penuh (protokol ekspos negara partner)
- **DuckChat, Telegram, AnonChat, X, GETTR**: tidak bisa difilter (protokol tidak ekspos negara)

## Menambah Platform Baru

1. Buat `lib/platforms/<nama>/` (config, guest, session, index)
2. Buat `bot/<nama>-bot.js`
3. Tambah baris ke `lib/core/platforms-registry.js`
4. Buat workflow baru di Replit
5. Restart **SEMUA** workflow (bukan hanya yang baru) — karena `platforms-registry.js` di-cache in-process

## Menambah Telegram Bot Sekunder Baru

Kalau ingin tambah bot Telegram ke-4 (target bot lain, session sama):

1. Buat `lib/platforms/<nama>/config.js` (TARGET_BOT, MATCH_SIGNALS, MESSAGE_GREETS, dll)
2. Buat `lib/platforms/<nama>/persistence.js` — isinya cukup: `module.exports = require("../telegram/persistence");`
3. Buat `lib/platforms/<nama>/session.js` — thin wrapper ke `shared-session.js`
4. Buat `bot/<nama>-bot.js` — copy struktur temanid-bot.js, **WAJIB** `startServer(name, { authProxy: false })`
5. Tambah ke `platforms-registry.js`
6. Buat workflow baru

## User Preferences

- Bahasa komentar kode: Bahasa Indonesia
- Nama event, variabel, konstanta: mengikuti konvensi platform target (hasil recon)
- Setiap platform baru wajib didokumentasikan dengan komentar reverse-engineering di header file
- Restart semua workflow setelah edit `platforms-registry.js`
- Jangan asumsikan kode yang terlihat duplikat pasti bisa di-refactor — baca dulu bedanya
