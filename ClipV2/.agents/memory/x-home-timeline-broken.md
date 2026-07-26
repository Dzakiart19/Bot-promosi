---
name: X HomeTimeline GraphQL tidak tersedia tanpa browser
description: HomeTimeline/HomeLatestTimeline queryId tidak ada di bundle statis X — workaround pakai SearchTimeline dengan COMMENT_KEYWORDS
---

## Aturan

Jangan coba gunakan `HomeTimeline` atau `HomeLatestTimeline` GraphQL dari bot Node.js.
Kedua operasi ini **tidak ada** di bundle statis X (main.js, vendor.js, en.js) —
hanya di lazy module yang di-load saat browser menjalankan JS. Hasilnya selalu
`{"message":"Query not found"}` meski queryId di-discover dari bundle terbaru.

## Workaround aktif

`fetchHomeTimeline()` di `lib/platforms/x/client.js` sekarang pakai `SearchTimeline`
dengan keyword dari `COMMENT_KEYWORDS` (config.js) — endpoint ini stabil dan berfungsi.

**Why:** X memindahkan HomeTimeline ke lazy-loaded chunk. Kita tidak bisa
mengeksekusi JS itu tanpa browser runtime (Puppeteer/Playwright).

## Cara apply

Kalau ada kebutuhan "ambil tweet dari timeline" di masa depan:
- Pakai `searchTweets(cookies, keyword)` dengan keyword yang relevan
- Atau gunakan `UserTweets` GraphQL (queryId juga perlu di-discover tapi kemungkinan ada di bundle)
- JANGAN coba HomeTimeline/HomeLatestTimeline tanpa browser runtime
