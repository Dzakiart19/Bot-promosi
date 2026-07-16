# 🤖 Multi-Platform Chat Bot

Bot otomatis Node.js yang berjalan secara paralel di 5 platform chat anonim, mengirimkan pesan promosi ke setiap partner — plus satu bot X (Twitter) dengan tiga mode: **auto-comment**, **auto-reply keyword**, dan **auto-post**. Dilengkapi dashboard monitoring terpusat real-time.

---

## Platform yang Didukung

| Platform | URL | Port | File Bot |
|---|---|---|---|
| OpenTalk | opentalk.club/text | 8000 | `bot/opentalk-bot.js` |
| Yapping | yapping.me/chat | 3002 | `bot/yapping-bot.js` |
| SillyChat | silly.chat/text-chat | 3001 | `bot/silly-bot.js` |
| Chatib | app.chatib.chat | 3003 | `bot/chatib-bot.js` |
| DuckChat | duckchat.club/lake | 3004 | `bot/duckchat-bot.js` |
| X (auto-comment + reply + post) | x.com | 3005 | `bot/x-bot.js` |

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
PORT=3002 node bot/yapping-bot.js
PORT=3001 node bot/silly-bot.js
PORT=3003 node bot/chatib-bot.js
PORT=3004 node bot/duckchat-bot.js
PORT=3005 node bot/x-bot.js
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
| `X_COOKIES` | Cookie session X (Twitter): `auth_token=...; ct0=...` — wajib untuk X Bot |

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
│   ├── yapping-bot.js          # entry point Yapping
│   ├── silly-bot.js            # entry point SillyChat
│   ├── chatib-bot.js           # entry point Chatib
│   ├── duckchat-bot.js         # entry point DuckChat
│   ├── x-bot.js                # entry point X (3 mode: comment/reply/post)
│   └── start-all.js            # launcher deployment (spawn semua bot)
│
├── lib/
│   ├── core/
│   │   ├── logger.js           # logger berwarna (jangan diubah)
│   │   ├── stats.js            # stats store singleton (jangan diubah)
│   │   ├── server.js           # Express server + agregator dashboard (jangan diubah)
│   │   └── platforms-registry.js  # daftar semua platform {key, name, port}
│   │
│   └── platforms/
│       ├── opentalk/
│       ├── yapping/
│       ├── silly/
│       ├── chatib/
│       ├── duckchat/           # + enkripsi AES-256-CTR
│       └── x/                 # config · guest · client · session · transaction-id
│                               # replied-store · sent-log
│
├── public/
│   └── monitor.html            # dashboard monitoring (universal)
│
└── package.json
```

---

## Menambah Platform Baru

1. **Recon** — temukan WS server, socket events, auth flow (lihat `.agents/skills/SKILL.md`)
2. **Buat** `lib/platforms/<nama>/config.js`, `guest.js`, `session.js`, `index.js`
3. **Buat** `bot/<nama>-bot.js` (salin dari bot lain, ganti 1 baris import)
4. **Daftarkan** ke `lib/core/platforms-registry.js` — tambah `{ key, name, port }`
5. **Buat workflow** di Replit: `PORT=<port> node bot/<nama>-bot.js`
6. **Restart semua** workflow agar dashboard mengenali platform baru

> **Penting:** setelah edit `platforms-registry.js`, restart SEMUA workflow bot — bukan hanya yang baru.

---

## Filter & Prioritas Negara Partner

Logika ada di `lib/core/country-filter.js`, dipakai di session handler platform yang
protokolnya mengekspos negara partner (**OpenTalk** dan **Chatib** saja — Yapping,
SillyChat, DuckChat tidak mengirim data negara partner sama sekali di event
match/matched/chat_found-nya).

- **Blocklist** (`isBlockedCountry`) — partner dari India, Bangladesh, Pakistan, Nepal,
  Sri Lanka, Filipina, Vietnam, Myanmar, Kamboja, Laos di-skip otomatis tanpa kirim sapa.
- **Prioritas** (`isPriorityCountry`) — 24 negara (AS, Kanada, Inggris, Australia,
  Selandia Baru, Swiss, Norwegia, Swedia, Denmark, Finlandia, Irlandia, Belanda,
  Luksemburg, Jerman, Prancis, Austria, Belgia, Singapura, Jepang, Korea Selatan,
  Hong Kong, UEA, Qatar, Kuwait) ditandai ⭐ di log & dashboard.

---

## Catatan Teknis X Bot

X Bot berbeda dari platform chat lain — tidak ada socket/match, melainkan **tiga mode** yang berjalan berdasarkan prioritas dan timer:

| Mode | Frekuensi | Cara Kerja |
|---|---|---|
| **POST** | 1× per jam (prioritas tertinggi) | Buat tweet baru (standalone post) dengan teks promo acak dari `POST_TEXTS` (15 variasi) |
| **REPLY** | 1× per jam | Cari tweet berdasarkan `KEYWORDS` → reply pesan promo |
| **COMMENT** | Setiap 5 menit (default) | Cari tweet via `COMMENT_KEYWORDS` → comment pesan promo langsung di bawah postingan |

**Urutan prioritas per siklus:** `POST > REPLY > COMMENT`

Siklus berjalan setiap 5 menit (`LOOP_DELAY_MS`). POST dan REPLY hanya aktif jika sudah lewat 1 jam sejak terakhir dijalankan; selainnya selalu COMMENT.

### Keyword Pool

- **`KEYWORDS`** (REPLY mode) — ~90 keyword: platform random-chat (Omegle, Chatroulette, CooMeet, dll.), situs porn populer (Pornhub, XVideos, Chaturbate, dll.), OnlyFans, istilah seksual, fetish, hookup.
- **`COMMENT_KEYWORDS`** (COMMENT mode) — ~60 keyword: istilah adult yang lebih broad/umum untuk menjangkau postingan berpotensial impresi tinggi.

### Teks Promo

- **POST & COMMENT**: dipilih acak dari 15 variasi `POST_TEXTS` — emoji + copywriting berbeda tiap kali supaya tidak terdeteksi sebagai spam.
- **REPLY**: teks tetap dari `REPLY_TEXT`.

### Persyaratan teknis
- Cookie session X (`auth_token` + `ct0`) disimpan di env var `X_COOKIES`
- Setiap request GraphQL wajib menyertakan header `x-client-transaction-id` (dihasilkan otomatis oleh `lib/platforms/x/transaction-id.js` — implementasi dari npm `x-client-transaction-id`)
- queryId GraphQL di-discover otomatis dari bundle `main.js` X saat startup; fallback ke nilai statis di `config.js` jika gagal
- `HomeTimeline`/`HomeLatestTimeline` tidak tersedia tanpa browser runtime (X muat via lazy chunk) — COMMENT mode pakai `SearchTimeline` sebagai gantinya
- Tweet/postingan yang sudah dibalas/dikomentari dicatat di `lib/platforms/x/.replied-ids.json` untuk menghindari duplikasi lintas restart
- Riwayat pengiriman (100 entri terakhir) tersimpan in-memory di `sent-log.js`, ditampilkan di dashboard panel "📋 Riwayat Terkirim"

---

## Catatan Teknis DuckChat

DuckChat berbeda dari platform lain karena pesannya **dienkripsi**:

- Algoritma: **AES-256-CTR**
- Key derivation: **SHA-256** dari string `"secret_key"` (hardcoded di frontend mereka)
- Format output: `base64(IV[16 bytes] + ciphertext)`
- Library: Node.js built-in `crypto` — tidak perlu install paket tambahan

---

## Dependensi

```json
{
  "express":                  "^5.2.1",
  "node-fetch":               "^3.3.2",
  "socket.io-client":         "^4.8.3",
  "uuid":                     "^14.0.1",
  "ws":                       "^8.21.0",
  "x-client-transaction-id":  "latest"
}
```

Node.js >= 20 diperlukan (menggunakan global `fetch` dan `crypto` built-in).

---

## Lisensi

MIT — lihat [LICENSE](LICENSE).
