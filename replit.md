# Multi-Platform Chat Bot

## Ringkasan Proyek

Bot otomatis Node.js yang berjalan secara paralel di 6 platform: OpenTalk, Yapping, SillyChat, Chatib, DuckChat (chat anonim), ditambah X Bot (Twitter) dan Telegram Bot. Setiap bot berjalan sebagai proses terpisah pada port berbeda, dengan shared infra (logger, stats, Express server, dashboard monitor) di `lib/core/`.

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
    config.js       ← target bot, pesan promo, timing
    session.js      ← persistent msg buffer + runSession (no race condition)
    auth-server.js  ← web auth server + stats proxy (satu Express instance)
    persistence.js  ← baca/tulis session via Replit DB + file fallback
    index.js
  x/
bot/
  opentalk-bot.js
  yapping-bot.js
  silly-bot.js
  chatib-bot.js
  duckchat-bot.js
  x-bot.js
  telegram-bot.js   ← main loop + auth/re-auth otomatis
  start-all.js      ← launcher deployment
public/
  monitor.html      ← dashboard monitor universal (auto-refresh 5 detik)
```

## Telegram Bot — Detail Alur

```
/search
  → tunggu "Pasangan telah ditemukan" (timeout 90s → /search ulang)
  → kirim promo LANGSUNG
  → delay 5 detik (menghindari rate limit bot "Jangan terlalu cepat")
  → /next
  → [loop tanpa /search ulang — server otomatis carikan pasangan]
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
5. Restart SEMUA workflow (bukan hanya yang baru) — karena `platforms-registry.js` di-cache in-process

## User Preferences

- Bahasa komentar kode: Bahasa Indonesia
- Nama event, variabel, konstanta: mengikuti konvensi platform target (hasil recon)
- Setiap platform baru wajib didokumentasikan dengan komentar reverse-engineering di header file
- Restart semua workflow setelah edit `platforms-registry.js`
