---
name: Yapping auth broken
description: Server Yapping tidak lagi mengirim cookie token di response auth sejak ~Juli 2026
---

Bot Yapping error `Cookie 'token' tidak ada di response — server mungkin berubah` di setiap sesi, 300+ sesi berturut-turut tanpa recovery. Match: 2, Error: 300+.

**Aturan:** Yapping saat ini tidak berfungsi. Jangan refactor/tweak kode lama tanpa recon ulang endpoint auth Yapping terlebih dahulu.

**Why:** Server `yapping.me` kemungkinan mengganti mekanisme autentikasi — cookie `token` tidak lagi ada di Set-Cookie header response. Bot `lib/platforms/yapping/guest.js` mengharapkan cookie ini untuk membuat guest session.

**How to apply:**
- Sebelum fix, lakukan recon: `curl -v https://yapping.me/...` untuk lihat endpoint auth terbaru dan header response-nya
- Cek apakah ada token di body JSON response (bukan cookie), atau endpoint auth berpindah path
- Kemungkinan nama cookie berubah (misal: `session`, `sid`, atau header `Authorization`)
- Jangan restart atau edit kode Yapping tanpa recon — sudah lebih dari 300 sesi gagal, bukan intermiten
