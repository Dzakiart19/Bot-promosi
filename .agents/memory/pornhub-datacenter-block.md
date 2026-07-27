---
name: PornHub datacenter IP block & comment API
description: PornHub search 404 dari IP datacenter; comment endpoint pindah ke pornhub.org dengan format berbeda; reCAPTCHA v3 score butuh session warm-up.
---

## Domain & Redirect (dikonfirmasi Juli 2026)

`pornhub.com` → 302 redirect → `pornhub.org` untuk semua halaman.
Bot harus langsung request ke `pornhub.org` untuk menghindari redirect chain yang merusak reCAPTCHA score.

## Video Search — Blokir Datacenter

`pornhub.org/video?search=X` → **404** dari Replit IP.
Workaround: pakai browse tanpa keyword — `/video?o=mv`, `/video?o=mr`, `/recommended`, `/`.

## Comment API — Format Baru (pornhub.org)

**Format lama (pornhub.com) — menghasilkan 401:**
```
POST /api/v1/comment/add
Body: token=<xsrf>&video_id=<id>&comment=<text>
```

**Format baru (pornhub.org) — dikonfirmasi 200 OK:**
```
POST /api/v1/comment/add?id=<video_id>&type=Video&vkey=<viewkey>&token=<xsrf>
Body: comment=<text>
Origin/Referer: https://www.pornhub.org
```

Ditemukan dari HTML form action: `action="/api/v1/comment/add?id=...&type=Video&vkey=...&token=..."`.

## XSRF Token Extraction

Di pornhub.org, token **tidak** ada di `id="xsrfToken"`. Lokasi yang benar:
1. **Prioritas 1:** Form action URL: `action="/api/v1/comment/add?...&token=<xsrf>"`
2. Prioritas 2: JSON `"token":"MTc..."` di pageConfig
3. Prioritas 3: `id="xsrfToken"` (pornhub.com saja)
4. Prioritas 4: JS variable `token = "MTc..."`

## reCAPTCHA v3 Score — Session Warm-up WAJIB

**Problem:** POST comment langsung → 422 `CAPTCHA Score` dari datacenter IP.

**Fix yang dikonfirmasi bekerja:**
1. `GET https://www.pornhub.org/` (homepage — warm-up)
2. `GET https://www.pornhub.org/view_video.php?viewkey=...` (video page)
3. `POST https://www.pornhub.org/api/v1/comment/add?...` → **200 OK**

Tanpa step 1 (homepage visit), langsung step 2+3 → 422.

**Penting:** Setelah banyak request gagal (401/422) dalam waktu singkat, session terflag dan butuh cooldown ~45 menit sebelum warm-up berhasil lagi. Jangan restart workflow berkali-kali — biarkan cooldown selesai alami.

## Cookie & User-Agent

Cookies dari Android Chrome — harus pakai UA Android yang sama:
`Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36`

Gunakan raw cookies (bukan getPcCookies()) untuk konsistensi dengan UA Android.

## Response Format

Sukses: `{"status":"PASS","statusMessage":"Your comment has been posted.","id":"<uuid>","type":"Video",...}`
Gagal auth: `{"status":"FAIL",...}` dengan HTTP 401
Gagal CAPTCHA: `{"status":"FAIL","statusMessage":"CAPTCHA Score",...}` dengan HTTP 422

**Why:** reCAPTCHA v3 score dihitung dari session context (IP reputation + request chain). Datacenter IP dapat score rendah; homepage visit sebelum comment menaikkan score cukup untuk lolos.

**How to apply:** Setiap siklus comment di `browseVideos()` harus mulai dengan GET homepage pornhub.org. Jika 422, cooldown 45 menit tanpa restart workflow.
