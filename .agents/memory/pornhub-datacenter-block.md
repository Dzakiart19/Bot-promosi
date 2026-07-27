---
name: PornHub datacenter IP block
description: PornHub memblokir endpoint video search dari IP datacenter/cloud (termasuk Replit). Session verify berhasil tapi search 404.
---

## Temuan

PornHub memblokir request ke `/video?search=...` dari IP datacenter/VPN/cloud provider.

**Alur yang dikonfirmasi:**
1. `pornhub.com/video?search=X` → 302 redirect → `pornhub.org/video?search=X`
2. `pornhub.org/video?search=X` → **404** (dengan maupun tanpa cookies valid)
3. Homepage `pornhub.com/` dan `verifySession()` → OK (tidak di-blokir, hanya /video search)

**Mengapa verifySession OK tapi search 404:**
Homepage (GET `/`) tidak diblokir untuk semua IP. Video search endpoint (`/video?search=`) diblokir khusus untuk datacenter IP.

**Fix yang sudah dicoba:**
- `platform=mobile` → `platform=pc` di cookie: tidak membantu (redirect sama)  
- `fetchWithCookies` manual redirect carry: tidak membantu (pornhub.org tetap 404)

**Why:** PornHub (MindGeek/Aylo) menggunakan IP reputation layer yang memblokir cloud provider ranges (AWS, GCP, Azure, Replit, dll) pada endpoint search — standar industri anti-scraping.

**How to apply:** PornHub Bot (`bot/pornhub-bot.js`) tidak bisa melakukan video search dari Replit tanpa residential proxy. Bot tetap jalan (server naik, port 3013 online di monitor) tapi siklus comment selalu `fetch-error`. Jika ingin bot berfungsi, butuh residential proxy (misal Bright Data, Oxylabs) yang di-inject ke fetch calls di `lib/platforms/pornhub/client.js`.
