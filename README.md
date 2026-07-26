# 🤖 Multi-Platform Chat Bot

Bot otomatis Node.js yang berjalan secara paralel di **9 platform** — 4 chat anonim, 3 bot Telegram (1 akun), 1 X (Twitter), 1 GETTR — mengirimkan pesan promosi ke setiap partner atau postingan. Dilengkapi dashboard monitoring terpusat real-time.

---

## Platform yang Didukung

| Platform | URL | Port | File Bot |
|---|---|---|---|
| OpenTalk | opentalk.club/text | 8000 | `bot/opentalk-bot.js` |
| Chatib | app.chatib.chat | 3003 | `bot/chatib-bot.js` |
| DuckChat | duckchat.club/lake | 3004 | `bot/duckchat-bot.js` |
| X (comment + reply + post) | x.com | 3005 | `bot/x-bot.js` |
| Telegram Bot | @botchatanonymouss_bot | 4000 | `bot/telegram-bot.js` |
| TemanID Bot | @temanidbot | 3006 | `bot/temanid-bot.js` |
| RandomPacar Bot | @random_pacar_bot | 3007 | `bot/randompacar-bot.js` |
| GETTR | gettr.com | 3008 | `bot/gettr-bot.js` |
| AnonChat | alpha.anonchat.com/search | 3009 | `bot/anonchat-bot.js` |

---

## Cara Install & Jalankan

### Install (sekali saja)

```bash
npm install
```

### Jalankan semua bot (development)

Tiap bot dijalankan sebagai workflow terpisah di Replit:

```bash
PORT=8000 node bot/opentalk-bot.js
PORT=3003 node bot/chatib-bot.js
PORT=3004 node bot/duckchat-bot.js
PORT=3005 node bot/x-bot.js
PORT=4000 node bot/telegram-bot.js
PORT=3006 node bot/temanid-bot.js
PORT=3007 node bot/randompacar-bot.js
PORT=3008 node bot/gettr-bot.js
PORT=3009 node bot/anonchat-bot.js
```

### Jalankan semua bot (deployment / satu perintah)

```bash
node bot/start-all.js
```

`start-all.js` membaca `lib/core/platforms-registry.js` dan men-spawn semua bot sebagai child process secara otomatis.

---

## Environment Variables

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

---

## Autentikasi Telegram (sekali saja, tanpa shell)

1. Pastikan `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, dan `TELEGRAM_PHONE` sudah diset di Secrets
2. Start workflow **Telegram Bot**
3. Buka **Monitor Dashboard** (port 4000)
4. Klik **Kirim OTP** → masukkan kode dari Telegram
5. Bot langsung jalan otomatis — tidak perlu restart

Session tersimpan di **Replit DB** — tidak hilang walau workflow di-restart, di-deploy ulang, atau autoscale hibernasi.

---

## Dashboard Monitoring

Buka `http://localhost:<port>/` di browser untuk melihat dashboard monitoring gabungan.

Dashboard dapat dibuka dari **port mana pun** — semua bot saling fetch stats via `GET /api/stats/all`.

### API Endpoints (tersedia di setiap port bot)

| Endpoint | Deskripsi |
|---|---|
| `GET /` | Dashboard monitor (monitor.html) |
| `GET /health` | Health check semua platform |
| `GET /api/stats` | Stats bot ini saja |
| `GET /api/stats/all` | Stats semua platform dari registry |
| `GET /proxy/:key/health` | Health check satu platform via key |

---

## Struktur Proyek

```
├── bot/
│   ├── opentalk-bot.js         # entry point OpenTalk
│   ├── chatib-bot.js           # entry point Chatib
│   ├── duckchat-bot.js         # entry point DuckChat
│   ├── x-bot.js                # entry point X (3 mode: comment/reply/post)
│   ├── telegram-bot.js         # entry point Telegram (auth utama + OTP UI)
│   ├── temanid-bot.js          # entry point TemanID (thin wrapper, no auth UI)
│   ├── randompacar-bot.js      # entry point RandomPacar (thin wrapper, no auth UI)
│   ├── gettr-bot.js            # entry point GETTR (POST + COMMENT)
│   ├── anonchat-bot.js         # entry point AnonChat (cookie auth)
│   ├── telegram-auth.js        # FALLBACK MANUAL (jalankan di shell, bukan workflow)
│   └── start-all.js            # launcher deployment (spawn semua bot)
│
├── lib/
│   ├── core/
│   │   ├── logger.js           # logger berwarna
│   │   ├── stats.js            # stats store singleton
│   │   ├── server.js           # Express server + agregator dashboard
│   │   └── platforms-registry.js  # daftar semua platform {key, name, port}
│   │
│   └── platforms/
│       ├── opentalk/           # config · guest · session · index
│       ├── chatib/
│       ├── duckchat/           # + enkripsi AES-256-CTR
│       ├── anonchat/           # + cookie auth + AES secret hash
│       ├── telegram/
│       │   ├── config.js           # target bot, pesan promo, timing
│       │   ├── shared-session.js   # session generik (dipakai 3 bot)
│       │   ├── session.js          # thin wrapper → @botchatanonymouss_bot
│       │   ├── auth-server.js      # web auth server + OTP UI
│       │   ├── persistence.js      # baca/tulis session via Replit DB
│       │   └── index.js
│       ├── temanid/
│       │   ├── session.js          # thin wrapper → @temanidbot
│       │   └── persistence.js      # re-export dari telegram/persistence
│       ├── randompacar/
│       │   ├── session.js          # thin wrapper → @random_pacar_bot
│       │   └── persistence.js      # re-export dari telegram/persistence
│       ├── x/                  # config · client · guest · session
│       │   ├── replied-store.js    # anti-duplikat reply/comment
│       │   ├── sent-log.js         # riwayat kiriman in-memory
│       │   └── transaction-id.js   # generate x-client-transaction-id
│       └── gettr/              # config · client · session
│           ├── replied-store.js
│           └── sent-log.js
│
├── public/
│   └── monitor.html            # dashboard monitoring (universal)
│
└── package.json
```

---

## Menambah Platform Baru

1. **Recon** — temukan WS server, socket events, auth flow
2. **Buat** `lib/platforms/<nama>/config.js`, `guest.js`, `session.js`, `index.js`
3. **Buat** `bot/<nama>-bot.js`
4. **Daftarkan** ke `lib/core/platforms-registry.js`
5. **Buat workflow** di Replit: `PORT=<port> node bot/<nama>-bot.js`
6. **Restart semua** workflow agar dashboard mengenali platform baru

> **Penting:** setelah edit `platforms-registry.js`, restart SEMUA workflow bot — bukan hanya yang baru, karena file ini di-cache in-process.

---

## Menambah Telegram Bot Sekunder Baru

Kalau ingin tambah bot Telegram ke-4 (target bot lain, session sama):

1. Buat `lib/platforms/<nama>/config.js` (TARGET_BOT, MATCH_SIGNALS, MESSAGE_GREETS, dll)
2. Buat `lib/platforms/<nama>/persistence.js` — isinya: `module.exports = require("../telegram/persistence");`
3. Buat `lib/platforms/<nama>/session.js` — thin wrapper ke `shared-session.js`
4. Buat `bot/<nama>-bot.js` — **WAJIB** `startServer(name, { authProxy: false })`
5. Tambah ke `platforms-registry.js` + buat workflow baru

---

## Filter & Prioritas Negara Partner

Logika ada di `lib/core/country-filter.js`, dipakai di session handler platform yang
protokolnya mengekspos negara partner (**OpenTalk** dan **Chatib** saja).

- **Blocklist** — saat ini **kosong** (semua negara diterima). Isi `BLOCKED_COUNTRIES` di `country-filter.js` untuk memblokir.
- **Prioritas** — 20 negara ditandai ⭐ di log/dashboard (tanpa skip): AS, Kanada, Inggris, Australia, Singapura, Arab Saudi, Swedia, Finlandia, Swiss, Jerman, Prancis, Belanda, Belgia, Austria, Jepang, UAE, Qatar, Selandia Baru, Denmark, Luksemburg.

Platform yang **tidak bisa difilter** (protokol tidak ekspos negara): DuckChat, Telegram, AnonChat, X, GETTR.

---

## Catatan Teknis Per Platform

### AnonChat

- Auth: cookie akun (`ANONCHAT_COOKIES` = `auth_token=...; user_id=...`)
- Secret hash: AES-encrypt `[{secret:userId}]` dengan reversed key
- **Protokol Juli 2026:** server mengganti event `partner-found` → `update-dialog-id` sebagai sinyal match. `dialogId` ada di `data.dialogId` (bukan `data._id`).

### GETTR

- Auth: `GETTR_TOKEN` + `GETTR_USER_ID` (JWT langsung, bypass Imperva)
- JSON body comment: field `txt`, bukan `rich_txt`; `_t:'cmt'` wajib
- **Strategi comment (confirmed live test Juli 2026):** satu-satunya endpoint yang benar adalah `POST /api/u/post` dengan `pid: postId` di body. Endpoint `/u/post/{postId}/comment` → ERR untuk root post. Endpoint `/u/post/{c37pId}/comment` → rc OK tapi mengembalikan ID parent (ghost comment, tidak ada yang dibuat). Bot tidak lagi menggunakan `fetchFirstComment`.

### X Bot

Siklus: COMMENT → REPLY → POST (masing-masing 1 jam interval, 5 menit loop).

| Mode | Frekuensi | Cara Kerja |
|---|---|---|
| **POST** | 1× per jam | Tweet baru dengan teks promo acak |
| **REPLY** | 1× per jam | Cari tweet via `KEYWORDS` → reply |
| **COMMENT** | Setiap 5 menit | Cari tweet via `COMMENT_KEYWORDS` → comment |

- GraphQL queryId di-discover otomatis dari main.js bundle X
- `x-client-transaction-id` wajib di setiap request GraphQL
- `HomeTimeline` tidak tersedia tanpa browser runtime — COMMENT pakai `SearchTimeline`
- `.replied-ids.json` cegah duplikat reply/comment lintas restart
- **Hashtag pool:** `HASHTAG_POOL` di `config.js` berisi 31 hashtag (niche adult). Setiap kiriman REPLY, COMMENT, dan POST ditempel 8 hashtag acak dari pool via `pickHashtags()` di `session.js` — kombinasi berbeda tiap kiriman.

### DuckChat

Pesan dienkripsi: **AES-256-CTR**, key = SHA-256 dari `"secret_key"` (hardcoded frontend), output = `base64(IV[16] + ciphertext)`.

### Telegram (3 bot, 1 akun)

- `telegram-bot.js` (port 4000): auth utama + OTP UI
- `temanid-bot.js` (port 3006) & `randompacar-bot.js` (port 3007): thin wrapper, **WAJIB** `authProxy: false`
- Session tersimpan di Replit DB — satu login untuk semua 3 bot

---

## ⚠️ Aturan Kritis

- **Telegram Bot wajib port 4000** — port 3000 diklaim aggregator deployment di autoscale
- **Restart SEMUA workflow** setelah edit `platforms-registry.js`
- **TemanID & RandomPacar wajib** `startServer(name, { authProxy: false })` — tanpa ini dashboard tampilkan form OTP palsu

---

## Dependensi

```json
{
  "express":                  "^5.x",
  "socket.io-client":         "^4.x",
  "node-fetch":               "^3.x",
  "ws":                       "^8.x",
  "uuid":                     "^14.x",
  "crypto-js":                "^4.x",
  "x-client-transaction-id":  "latest",
  "telegram":                 "^2.x"
}
```

Node.js >= 20 diperlukan (menggunakan global `fetch` dan `crypto` built-in).

---

## Lisensi

MIT — lihat [LICENSE](LICENSE).
