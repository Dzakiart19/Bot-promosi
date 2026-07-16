---
name: web-recon-endpoint-finder
description: Metodologi reverse-engineering website umum — untuk menemukan endpoint API tersembunyi, mekanisme auth, struktur data, cara mengintegrasikan layanan web apapun, DAN cara menambahkan platform baru ke dalam arsitektur bot multi-platform ini.
---

# Web Recon & Endpoint Finder
## + Panduan Menambah Platform Baru ke Arsitektur Bot

---

## ⚠️ ATURAN WAJIB

1. **Hanya untuk tujuan legal** — scraping/recon untuk riset, integrasi pribadi, atau reverse-engineering yang diizinkan ToS.
2. **Jangan bypass paywall berbayar** tanpa izin eksplisit pemilik layanan.
3. **Hormati rate limit** — jangan buat request berlebihan yang bisa membebani server target.
4. **Tidak untuk credential stuffing** atau akses akun orang lain.

---

## BAGIAN A — Recon: Temukan Endpoint Platform Baru

### FASE 1 — Profiling Awal Website

```bash
TARGET="https://target.com"

# 1. Cek headers server — dapat info: tech stack, CDN, security headers
curl -s -I "$TARGET" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36" \
  --max-time 10

# 2. Probe endpoint umum sekaligus
for ep in \
  "/api" "/api/v1" "/api/v2" "/v1" "/v2" \
  "/api/config" "/config.json" "/manifest.json" "/.well-known/openid-configuration" \
  "/graphql" "/gql" "/query" \
  "/api/auth" "/auth" "/login" "/api/login" "/api/session" \
  "/api/user" "/api/me" "/api/profile" \
  "/api/search" "/search" \
  "/api/data" "/data" \
  "/sitemap.xml" "/robots.txt" \
  "/swagger.json" "/openapi.json" "/api-docs" "/docs/api" \
  "/api/guest" "/guest" "/api/anonymous" \
  "/api/chat" "/chat/api" "/api/match" "/api/queue"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$TARGET$ep" \
    -H "User-Agent: Mozilla/5.0 Chrome/138.0.0.0" --max-time 8 2>/dev/null)
  [ "$code" != "404" ] && echo "$code  $ep"
done
```

**Interpretasi kode HTTP:**
| Kode | Arti | Tindakan |
|---|---|---|
| `200` | Terbuka | Test langsung |
| `401` | Ada, butuh auth | Cari token/session |
| `403` | Ada, diblokir | Coba bypass header |
| `404` | Tidak ada | Coba variasi path lain |
| `405` | Method salah | Ganti GET↔POST |
| `307/302` | Redirect | Follow redirect-nya |
| `429` | Rate limited | Tambah delay / rotasi IP |
| `500` | Server error | Endpoint ada tapi payload salah |

---

### FASE 2 — Identifikasi Tech Stack

```bash
TARGET="https://target.com"

# Dari headers HTTP
curl -sI "$TARGET" | grep -iE "server|x-powered-by|x-framework|cf-ray|x-vercel|x-amz"

# Dari HTML meta tags
curl -s "$TARGET" | grep -iE '<meta[^>]+(generator|framework|version)[^>]+>'

# Dari robots.txt
curl -s "$TARGET/robots.txt"

# Dari HTML — cari link ke JS bundle
curl -s "$TARGET" | grep -oE 'src="[^"]+\.(js|mjs)"' | head -10

# Dari HTML — cari hint URL API
curl -s "$TARGET" | grep -oE '"(https?://[^"]{0,100}api[^"]{0,100})"' | sort -u | head -20
```

**Tanda-tanda tech stack:**
- `x-powered-by: Next.js` → Next.js, cek `/_next/static/` dan `__NEXT_DATA__`
- `x-powered-by: Express` → Node.js Express
- `cf-ray` → Cloudflare, gunakan `--tlsv1.3`
- `x-vercel-id` → Vercel hosting
- Socket.io → cari `/socket.io/` atau path custom di JS bundle

---

### FASE 3 — Ekstrak Endpoint dari JS Bundle

Teknik paling efektif untuk SPA (React/Vue/Svelte).

```bash
TARGET="https://target.com"

# 1. Dapatkan daftar JS bundle
JS_FILES=$(curl -s "$TARGET" \
  | grep -oE 'src="[^"]+\.js"' \
  | sed 's/src="//;s/"//' \
  | grep -v "^http" \
  | head -5)

# 2. Download bundle terbesar (biasanya main bundle)
mkdir -p /tmp/recon
for f in $JS_FILES; do
  name=$(basename "$f")
  curl -s "$TARGET$f" -o "/tmp/recon/$name"
  size=$(wc -c < "/tmp/recon/$name")
  echo "$size  $name"
done

# 3. Extract dari bundle terbesar
BUNDLE=$(ls -S /tmp/recon/*.js | head -1)

# Semua URL path yang mirip API
python3 -c "
import re, sys
with open('$BUNDLE','r',errors='replace') as f: c=f.read()
paths = re.findall(r'[\"\'](/(?:api|chat|ws|socket|auth|user|match|guest|queue)[^\"\' ]{0,80})[\"\']\s*[,\)]', c)
for p in sorted(set(paths)): print(p)
" 2>/dev/null | head -40

# Socket.io: cari io() call dan path
python3 -c "
import re
with open('$BUNDLE','r',errors='replace') as f: c=f.read()
for m in re.finditer(r'io\s*\([^)]{0,200}\)', c): print(m.group()[:200]); print()
" 2>/dev/null | head -30

# Cari semua socket event: emit dan on
python3 -c "
import re
with open('$BUNDLE','r',errors='replace') as f: c=f.read()
emits = re.findall(r'emit\([\"\']([\w]+)[\"\']\s*[,\)]', c)
ons   = re.findall(r'\.on\([\"\']([\w]+)[\"\']\s*[,\)]', c)
print('EMIT:', sorted(set(emits)))
print()
print('ON:', sorted(set(ons)))
" 2>/dev/null
```

---

### FASE 4 — Test Endpoint Kunci untuk Chat Platform

Checklist endpoint yang perlu ditemukan untuk platform chat anonim:

```bash
TARGET="https://target.com"

# 1. Guest / Anonymous session
curl -s -X POST "$TARGET/api/guest/get-or-create" \
  -H "Content-Type: application/json" \
  -H "Origin: $TARGET" \
  -d '{"displayName":"TestUser123","localId":"test-uuid-1234"}' | python3 -m json.tool

# 2. Cek apakah ada auth berbasis SuperTokens / Clerk / Auth0
curl -sI "$TARGET/auth/session" -H "Origin: $TARGET"

# 3. Cek Socket.io handshake — perhatikan path-nya!
# Path default: /socket.io/
# Mungkin custom: /chat/socket.io/, /ws/socket.io/, dll
for path in "/socket.io" "/chat/socket.io" "/ws" "/realtime/socket.io"; do
  code=$(curl -s -o /tmp/sio_resp.txt -w "%{http_code}" \
    "$TARGET${path}/?EIO=4&transport=polling" \
    -H "Origin: $TARGET" --max-time 6)
  echo "$code  $path"
  [ "$code" = "200" ] && head -c 100 /tmp/sio_resp.txt && echo
done

# 4. Cari endpoint config/payment/vapid yang sering bocor info berguna
for ep in \
  "/api/payment/config" "/chat/api/payment/config" \
  "/api/config" "/chat/api/config" \
  "/api/push/vapid-public-key" "/chat/api/push/vapid-public-key" \
  "/api/call-limits" "/chat/api/call-limits"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$TARGET$ep" --max-time 6)
  [ "$code" = "200" ] && echo "TERBUKA: $ep"
done
```

---

### FASE 5 — Petakan Alur Auth & Session

Untuk platform chat anonim, alur umumnya:

```
1. POST /api/guest/get-or-create  → dapat { guestId, displayName }
2. WebSocket connect (io(wsUrl, { path, transports }))
3. emit "authenticate" { guestId, displayName, locale, deviceId }
4. server → "initialized" atau "matchStatusSync" { hasActiveMatch }
5. emit "joinMatchQueue" { guestId, preferences, interests }
6. server → "matchFound" { matchId, partnerId, partnerName }
7. emit "sendMessage" { matchId, message, messageType:"text", tempClientId }
8. server → "newMessage" { matchId, message, senderGuestId }
9. emit "endMatch" { matchId }
10. socket.disconnect()
```

Catat tiap field dengan seksama — nama field yang salah satu karakter pun membuat server tidak merespons tanpa error.

---

## BAGIAN B — Menambah Platform Baru ke Arsitektur Bot

### Struktur Folder (sudah ada)

```
lib/
  core/
    logger.js             ← logger berwarna (JANGAN diubah)
    stats.js              ← stats store singleton (JANGAN diubah)
    server.js             ← express web server + agregator dashboard (JANGAN diubah)
    platforms-registry.js ← daftar SEMUA platform {key, name, port} — WAJIB diupdate tiap platform baru
  platforms/
    opentalk/       ← contoh platform yang sudah berjalan
      config.js     ← semua konstanta (URL, pesan, timing)
      guest.js      ← createGuest() — buat sesi anonim
      session.js    ← runSession() — satu sesi chat penuh
      index.js      ← re-export { config, createGuest, runSession }
    <platform-baru>/  ← BUAT DI SINI
      config.js
      guest.js
      session.js
      index.js
bot/
  opentalk-bot.js       ← contoh entry point tipis
  <platform-baru>-bot.js  ← buat file ini juga
public/
  monitor.html      ← dashboard monitoring gabungan (universal, tidak perlu diganti —
                       otomatis menampilkan platform baru begitu terdaftar di platforms-registry.js)
```

> **Penting:** dashboard di `public/monitor.html` menampilkan SEMUA platform sekaligus dalam satu
> halaman, apa pun port yang dibuka user — datanya diambil lewat
> `GET /api/stats/all` di `lib/core/server.js`, yang fetch stats tiap platform lain via
> `http://localhost:<port>/api/stats`. Supaya ini bekerja, **setiap platform baru WAJIB didaftarkan**
> di `lib/core/platforms-registry.js` (Langkah 7 di bawah) — kalau lupa, platform baru akan tetap
> jalan tapi tidak akan muncul di dashboard sama sekali.

---

### Langkah-langkah Menambah Platform Baru

#### Langkah 1 — Jalankan Recon (Fase 1–5 di atas)

Temukan minimal:
- [ ] URL WebSocket server
- [ ] Path Socket.io (misal `/chat/socket.io/`)
- [ ] Endpoint buat session anonim (atau metode auth lain)
- [ ] Event `emit` untuk join queue / mulai chat
- [ ] Event `on` untuk match ditemukan
- [ ] Event `emit` untuk kirim pesan
- [ ] Event `on` untuk pesan masuk
- [ ] Event `emit` untuk akhiri chat

#### Langkah 2 — Buat `lib/platforms/<nama>/config.js`

```js
// lib/platforms/<nama>/config.js
"use strict";

module.exports = {
  // Endpoints (dari hasil recon)
  WS_SERVER:   "https://ws.<platform>.com",
  SOCKET_PATH: "/socket.io/",        // sesuaikan hasil recon
  API_BASE:    "https://<platform>.com/api",

  // Headers wajib (copy dari DevTools Network → Copy as cURL)
  ORIGIN:      "https://<platform>.com",
  REFERER:     "https://<platform>.com/chat/",
  USER_AGENT:  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/138.0.0.0",

  // Pesan
  MESSAGE_GREET:   "hai saya pria senang bertemu denganmu",
  MESSAGE_GOODBYE: "semoga menyenangkan",

  // Timing (ms) — sesuaikan dengan responsivitas platform
  DELAY_SEND_MS:    600,
  DELAY_GOODBYE_MS: 500,
  DELAY_END_MS:     1200,
  WAIT_MATCH_MS:    45000,
  WAIT_REPLY_MS:    30000,
  LOOP_DELAY_MS:    1500,

  // Socket.io
  SOCKET_TIMEOUT_MS: 20000,
  SEND_TIMEOUT_MS:   5000,
};
```

#### Langkah 3 — Buat `lib/platforms/<nama>/guest.js`

Implementasi `createGuest()` sesuai platform. Tiga kemungkinan:

**A. Platform punya anonymous/guest endpoint (seperti OpenTalk):**
```js
async function createGuest() {
  const res = await fetch(`${cfg.API_BASE}/guest/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": cfg.ORIGIN },
    body: JSON.stringify({ name: randomName() }),
  });
  const data = await res.json();
  return { userId: data.userId, token: data.token, displayName: data.name };
}
```

**B. Platform pakai registrasi email (buat email random):**
```js
async function createGuest() {
  const email = `bot_${uuidv4().slice(0,8)}@tempmail.com`;
  const pass  = uuidv4();
  const res = await fetch(`${cfg.API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pass }),
  });
  const data = await res.json();
  return { userId: data.user.id, token: data.jwt, displayName: data.user.username };
}
```

**C. Platform hanya butuh koneksi socket (tidak ada pre-auth):**
```js
async function createGuest() {
  return { userId: null, displayName: randomName(), deviceId: uuidv4() };
}
```

#### Langkah 4 — Buat `lib/platforms/<nama>/session.js`

Salin `lib/platforms/opentalk/session.js` sebagai template, lalu sesuaikan:

```js
// Bagian yang WAJIB disesuaikan:

// 1. socket options — sesuaikan WS_SERVER, SOCKET_PATH, headers
socket = io(cfg.WS_SERVER, {
  path: cfg.SOCKET_PATH,
  // ... tambahkan auth header jika platform membutuhkan
});

// 2. Event authenticate — sesuaikan nama event dan payload
socket.on("connect", () => {
  socket.emit("join", { userId: guest.userId, token: guest.token });
  // nama event dan field sesuai hasil recon
});

// 3. Trigger join queue — sesuaikan nama event
socket.on("ready", () => startSearch());  // nama event sesuai platform

// 4. Join queue — sesuaikan nama event dan payload
socket.emit("findMatch", { userId: guest.userId });

// 5. Match ditemukan — sesuaikan nama event
socket.on("matchFound", (data) => {  // mungkin "paired", "connected", dll
  matchId = data.roomId;             // nama field sesuai platform
});

// 6. Kirim pesan — sesuaikan nama event dan payload
socket.emit("message", {
  room: matchId,
  text: cfg.MESSAGE_GREET,
  // field sesuai platform
});

// 7. Pesan masuk — sesuaikan nama event
socket.on("message", (data) => {    // mungkin "chat", "msg", "newMessage"
  const text     = data.text || data.message || data.content;
  const senderId = data.from || data.userId || data.senderId;
});

// 8. Akhiri chat — sesuaikan nama event
socket.emit("leaveRoom", { room: matchId });
```

#### Langkah 5 — Buat `lib/platforms/<nama>/index.js`

```js
"use strict";
const config          = require("./config");
const { createGuest } = require("./guest");
const { runSession }  = require("./session");
module.exports = { config, createGuest, runSession };
```

#### Langkah 6 — Buat `bot/<nama>-bot.js`

Salin `bot/opentalk-bot.js`, ubah hanya satu baris import:

```js
// Ganti ini:
const { config, createGuest, runSession } = require("../lib/platforms/opentalk");

// Jadi ini:
const { config, createGuest, runSession } = require("../lib/platforms/<nama>");
```

#### Langkah 7 — Update workflow

Port `5000` (`outputType: "webview"`) sudah dipakai platform pertama. Platform baru pakai port lain
dari daftar yang didukung (`3000, 3001, 3002, 3003, 4200, 5173, 6000, 6800, 8000, 8008, 8080, 8099, 9000`)
dengan `outputType: "console"`, dan jalankan lewat env var `PORT`:

```js
// Di Replit, buat workflow baru untuk platform baru:
await configureWorkflow({
  name: "<NamaPlatform> Bot",
  command: "PORT=8000 node bot/<nama>-bot.js",   // pilih port yang belum dipakai platform lain
  waitForPort: 8000,
  outputType: "console",                          // hanya platform PERTAMA yang boleh "webview" + port 5000
  autoStart: true
});
```

#### Langkah 8 — Daftarkan platform ke dashboard monitoring (WAJIB, jangan skip!)

Tambahkan satu baris ke `lib/core/platforms-registry.js` — ini satu-satunya tempat yang perlu diubah
supaya dashboard gabungan (`public/monitor.html`) langsung ikut menampilkan platform baru, tanpa
menyentuh kode dashboard sama sekali:

```js
// lib/core/platforms-registry.js
module.exports = [
  { key: "opentalk",  name: "OpenTalk Bot",       port: 8000 },
  { key: "yapping",   name: "Yapping Bot",        port: 3002 },
  { key: "<nama>",    name: "<NamaPlatform> Bot", port: 3006 /* ganti sesuai Langkah 7 */ },
];
```

- `key` — slug pendek, cocokkan dengan nama folder di `lib/platforms/<nama>/`.
- `name` — nama tampilan di dashboard (biasanya sama dengan argumen `startServer("<Nama> Bot")` di bot file).
- `port` — HARUS sama dengan port workflow di Langkah 7, dan HARUS unik (belum dipakai platform lain).

Tidak perlu mengubah `lib/core/server.js` atau `public/monitor.html` — keduanya generik dan otomatis
membaca dari registry ini.

#### Langkah 9 — Update install.sh

Tambahkan file baru ke array FILES:
```bash
FILES=("bot/opentalk-bot.js" "bot/<nama>-bot.js" "public/monitor.html")
```

---

### Checklist Verifikasi Platform Baru

Setelah implementasi, pastikan urutan ini berhasil di log:

```
[SUCCESS] Web server → http://0.0.0.0:<port>
[SUCCESS] Guest: <NamaRandom>  (<userId>)
[INFO]    Konek sebagai <NamaRandom> (<userId>)
[SUCCESS] Terhubung — socket.id=xxxxx
[BOT]     joinMatchQueue / findMatch dikirim
[SUCCESS] ✓ MATCH! matchId=xxxxx | partner=xxxxx
[BOT]     → Sapa: "hai saya pria senang bertemu denganmu"
[MSG]     Stranger: "..."
[BOT]     → Pamit: "semoga menyenangkan"
[INFO]    Sesi #1 selesai → "goodbye-sent"
[INFO]    SESI #2 ...
```

Lalu **wajib** cek dashboard sudah "langsung pakai", tidak cuma botnya jalan:

- [ ] Restart SEMUA workflow bot (platform lama + baru) — registry baru hanya terbaca setelah restart.
- [ ] Screenshot/`curl http://localhost:<port-mana-pun>/api/stats/all` — pastikan platform baru muncul
      di array `platforms` dengan `online: true`.
- [ ] Buka dashboard (`/`) di port platform LAMA maupun port platform BARU — keduanya harus
      menampilkan blok untuk SEMUA platform, isinya identik. Kalau salah satu port hanya
      menampilkan platform lama, berarti Langkah 8 (registry) belum tersimpan / workflow belum direstart.
- [ ] Jika status platform baru "Offline" di dashboard padahal workflownya running, cek port di
      registry cocok dengan port workflow, dan cek tidak ada dua platform berbagi port yang sama.

---

## BAGIAN C — Tips Recon Khusus Platform Chat

1. **Buka DevTools dulu, bukan curl** — Network tab → WS/WebSocket → lihat frames secara realtime.
2. **Copy as cURL** setiap request yang relevan — dapat semua header yang benar sekaligus.
3. **Socket.io EIO=4 polling test** adalah cara cepat cek apakah socket server hidup:
   ```bash
   curl "https://ws.target.com/socket.io/?EIO=4&transport=polling" -H "Origin: https://target.com"
   # Response OK: 0{"sid":"xxx","upgrades":["websocket"],...}
   # Response 404: socket tidak di path ini, coba /chat/socket.io/ dll
   ```
4. **Cari `da||` atau variabel config** di JS bundle — sering berisi WS URL yang di-inject runtime.
5. **`matchStatusSync` pattern** — banyak platform mengirim event status setelah auth, gunakan ini sebagai trigger `joinMatchQueue`.
6. **`tempClientId`** — banyak platform butuh ID unik per pesan untuk dedup di sisi server.
7. **`withCredentials: true`** — hampir selalu dibutuhkan untuk platform yang pakai cookie/session.
8. **Cek endpoint `/api/payment/config`** — sering terbuka dan berisi info tech stack berguna.

---

## BAGIAN D — Tools Terminal

```bash
# Pretty print JSON
echo '{"key":"val"}' | python3 -m json.tool

# Decode JWT
TOKEN="eyJ..."
echo "$TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | python3 -m json.tool

# Generate UUID
python3 -c "import uuid; print(uuid.uuid4())"

# Extract string dari JS bundle
python3 -c "
import re, sys
with open(sys.argv[1],'r',errors='replace') as f: c=f.read()
for m in re.finditer(sys.argv[2], c):
    start=max(0,m.start()-200); end=min(len(c),m.end()+200)
    print(c[start:end]); print('---')
" bundle.js "joinMatchQueue"

# Follow redirects dan lihat tiap hop
curl -sL -D - "https://target.com/api/redirect" -o /dev/null

# Test Socket.io path cepat
for path in "/" "/socket.io" "/chat/socket.io" "/ws" "/realtime"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://ws.target.com${path}/?EIO=4&transport=polling" \
    -H "Origin: https://target.com" --max-time 6)
  echo "$code  $path"
done
```