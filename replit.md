# Multi-Platform Chat Bot

## Ringkasan Proyek

Bot otomatis Node.js yang berjalan secara paralel di 9 platform: OpenTalk, Yapping, SillyChat, Chatib, DuckChat (chat anonim), X Bot (Twitter), dan 3 Telegram Bot (1 akun, 3 target bot). Setiap bot berjalan sebagai proses terpisah pada port berbeda, dengan shared infra (logger, stats, Express server, dashboard monitor) di `lib/core/`.

## Cara Menjalankan

- **Development (Replit):** setiap bot punya workflow sendiri, semua aktif bersamaan
- **Deployment:** `node bot/start-all.js` — spawn semua bot dari registry sekaligus
- **Install:** `npm install` (sekali saja setelah clone/import)

## Ports & Workflows

| Bot | Port | Workflow Name |
|---|---|---|
| OpenTalk | 8000 | OpenTalk Bot |
| Yapping | 3002 | Yapping Bot |
| SillyChat | 3001 | SillyChat Bot |
| Chatib | 3003 | Chatib Bot |
| DuckChat | 3004 | DuckChat Bot |
| X Bot | 3005 | X Bot |
| Telegram | 3000 | Telegram Bot |
| TemanID | 3006 | TemanID Bot |
| RandomPacar | 3007 | RandomPacar Bot |

## Environment Variables (Secrets)

| Variabel | Keterangan |
|---|---|
| `X_COOKIES` | Cookie session X: `auth_token=...; ct0=...` — wajib untuk X Bot |
| `TELEGRAM_API_ID` | App ID dari my.telegram.org |
| `TELEGRAM_API_HASH` | App hash dari my.telegram.org |
| `TELEGRAM_PHONE` | Nomor HP format internasional (+62...) |

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
  yapping/
  sillychat/
  chatib/
  duckchat/
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
bot/
  opentalk-bot.js
  yapping-bot.js
  silly-bot.js
  chatib-bot.js
  duckchat-bot.js
  x-bot.js
  telegram-bot.js   ← main loop + auth/re-auth otomatis
  temanid-bot.js    ← secondary Telegram bot (no auth UI)
  randompacar-bot.js← secondary Telegram bot (no auth UI)
  telegram-auth.js  ← FALLBACK MANUAL (jalankan di shell, bukan workflow)
  start-all.js      ← launcher deployment
public/
  monitor.html      ← dashboard monitor universal (auto-refresh 5 detik)
```

---

## ⚠️ ATURAN KRITIS — JANGAN DILANGGAR

### Telegram: Satu Login, Semua Bot Jalan

Ketiga bot Telegram (telegram-bot, temanid-bot, randompacar-bot) menggunakan **satu akun / satu session**. Session dikelola **sepenuhnya** oleh `bot/telegram-bot.js` (port 3000). Bot sekunder hanya membaca session yang sudah ada.

**Konsekuensi arsitektur yang WAJIB diikuti:**

| | `telegram-bot.js` (port 3000) | `temanid-bot.js` (port 3006) | `randompacar-bot.js` (port 3007) |
|---|---|---|---|
| Punya auth/OTP server | ✅ Ya (`auth-server.js`) | ❌ Tidak | ❌ Tidak |
| `startServer()` | `startServer("Telegram Bot")` | `startServer("TemanID Bot", { authProxy: false })` | `startServer("RandomPacar Bot", { authProxy: false })` |
| Dashboard tampil tombol OTP | ✅ Ya | ❌ Tidak — harus `authProxy: false` | ❌ Tidak — harus `authProxy: false` |
| Bisa trigger login baru | ✅ Ya | ❌ Tidak | ❌ Tidak |

**`authProxy: false` WAJIB** di temanid-bot dan randompacar-bot. Tanpa ini, dashboard port 3006/3007 akan menampilkan tombol OTP → user mengira setiap bot perlu login sendiri → konflik sesi.

### `startServer()` — Opsi `authProxy`

```js
// ✅ BENAR: Telegram Bot — satu-satunya yang boleh expose auth UI
startServer("Telegram Bot");                           // authProxy default: true

// ✅ BENAR: Bot sekunder — stats saja, tanpa auth UI
startServer("TemanID Bot",    { authProxy: false });
startServer("RandomPacar Bot", { authProxy: false });

// ❌ SALAH: Bot sekunder pakai startServer() tanpa authProxy: false
startServer("TemanID Bot");   // ini akan munculkan tombol OTP di dashboard 3006!
```

### Session Sharing — Cara Kerjanya

1. `telegram-bot.js` menulis session ke Replit DB (key: `telegram_session`) + file `.telegram_session`
2. `temanid-bot.js` dan `randompacar-bot.js` **poll** sampai session tersedia, lalu baca dengan `readSession()`
3. `lib/platforms/temanid/persistence.js` dan `lib/platforms/randompacar/persistence.js` keduanya **re-export** dari `lib/platforms/telegram/persistence.js` — satu DB key, tidak ada duplikasi
4. Tiga GramJS `TelegramClient` berjalan simultan dengan session string yang sama — ini valid dan by design

### `shared-session.js` — Satu Logika untuk Semua Telegram Bot

Jangan copy-paste `runSession` atau `createMessageListener` ke session.js per-platform. Gunakan factory dari `lib/platforms/telegram/shared-session.js`:

```js
// Di session.js tiap platform:
const cfg    = require("./config");
const shared = require("../telegram/shared-session");
const { createMessageListener, runSession } = shared.makeSession(cfg);
module.exports = { createMessageListener, runSession };
```

Perbedaan antar bot hanya di config masing-masing (MATCH_SIGNALS, DELAY_SEND_MS, MSG, dll).

### Telegram FloodWaitError

GramJS melempar error dengan `err.seconds` saat kena rate limit. **Harus tunggu `err.seconds` detik**, bukan hardcode 5 detik:

```js
const waitSec = err.seconds || 0;
if (waitSec > 0) {
  await sleep(waitSec * 1000 + 1000); // +1s buffer
} else {
  await sleep(5000);
}
```

Retry sebelum cooldown habis akan memperparah flood ban.

### Jangan Refactor Kalau Tidak Tahu Bedanya

`startStatsServer()` yang ada di bot sekunder terlihat seperti "duplikat" dari `startServer()` di `lib/core/server.js` — tapi **punya perbedaan penting**: tidak ada `/api/telegram-auth/:action`. Kalau diganti `startServer()` tanpa `{ authProxy: false }`, hasilnya UI auth muncul di semua port.

**Prinsip:** sebelum menyatakan sesuatu "duplikat", pastikan kamu tahu persis apa bedanya — mungkin bedanya ada alasan.

---

## Telegram Bot — Detail Alur

```
/search
  → tunggu "Pasangan telah ditemukan" (timeout 90s → /search ulang)
  → delay DELAY_SEND_MS (temanid: 0ms langsung, telegram/randompacar: 3000ms)
  → kirim promo acak dari MESSAGE_GREETS
  → delay DELAY_NEXT_MS (5000ms)
  → /next
  → [loop tanpa /search ulang — server otomatis carikan pasangan baru]
```

Pesan lain di luar match-signal ("Jangan terlalu cepat", pesan PROMOTE, dll) diabaikan secara otomatis dalam loop tunggu match.

Event handler dipasang **sekali** secara permanen dengan buffer — tidak ada race condition antar sesi.

## X Bot — Tiga Mode

X Bot berjalan berdasarkan prioritas dan timer per siklus (setiap 5 menit):

| Mode | Frekuensi | Cara Kerja |
|---|---|---|
| **POST** | 1× per jam (prioritas tertinggi) | Buat tweet baru dengan teks promo acak dari 15 variasi |
| **REPLY** | 1× per jam | Cari tweet via `KEYWORDS` → reply pesan promo |
| **COMMENT** | Setiap 5 menit (default) | Cari tweet via `COMMENT_KEYWORDS` → comment langsung |

**Urutan prioritas:** `POST > REPLY > COMMENT`

Konfigurasi timing di `lib/platforms/x/config.js`:
- `LOOP_DELAY_MS` = 300000 (5 menit)
- `REPLY_INTERVAL_MS` = 3600000 (1 jam)
- `POST_INTERVAL_MS` = 3600000 (1 jam)

### Catatan Penting X Bot

- `HomeTimeline`/`HomeLatestTimeline` GraphQL tidak bisa diakses tanpa browser runtime — COMMENT mode pakai `SearchTimeline`
- queryId di-discover otomatis dari bundle `main.js`; fallback ke nilai statis di config
- Header `x-client-transaction-id` wajib di setiap request GraphQL
- ID tweet yang sudah dibalas dicatat di `.replied-ids.json` (max 2000) untuk cegah duplikasi

## Negara Prioritas

24 negara ditandai ⭐ di log/dashboard (tanpa skip): AS, Kanada, Inggris, Australia, Selandia Baru, Swiss, Norwegia, Swedia, Denmark, Finlandia, Irlandia, Belanda, Luksemburg, Jerman, Prancis, Austria, Belgia, Singapura, Jepang, Korea Selatan, Hong Kong, UEA, Qatar, Kuwait.

## Filter Negara Partner

Partner dari negara berikut di-skip otomatis: India, Bangladesh, Pakistan, Nepal, Sri Lanka, Filipina, Vietnam, Myanmar, Kamboja, Laos.

- Blocklist: `lib/core/country-filter.js`
- **OpenTalk & Chatib**: didukung penuh (protokol ekspos negara partner)
- **Yapping, SillyChat, DuckChat, Telegram**: tidak bisa difilter (protokol tidak ekspos negara)

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
