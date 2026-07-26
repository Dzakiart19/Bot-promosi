---
name: GETTR thread-reply strategy
description: Comment ke root post (p426...) selalu gagal; harus reply ke komentar c37p... di dalam thread
---

Endpoint GETTR `/u/post/{id}/comment` hanya berhasil jika `{id}` berformat `c37p...` (komentar), bukan `p426...` (root post). Request ke root post mengembalikan error atau komentar masuk ke tab "Replies" profil (tidak visible di thread).

**Aturan:** Untuk comment yang visible dalam thread asli, bot harus:
1. Fetch komentar pertama dari target post (`fetchFirstComment()`) → dapat ID format `c37p...`
2. `postComment()` reply ke komentar itu → hasilnya sub-reply `c37p...` yang muncul dalam thread
3. Fallback ke profile-reply jika fetch gagal (log label `⚠ profile-reply`)

**Why:** Verifikasi nyata: comment `c37p8jn8d35` dikonfirmasi via API GETTR dengan token auth — muncul sebagai sub-reply di bawah komentar `c37p766254e` dalam thread post `p4265gp4d1d`. Strategi `partner-found` (post langsung ke root) hanya muncul di tab Replies profil, tidak di thread.

**How to apply:**
- `fetchFirstComment()` dan dua-lapis `postComment()` sudah ada di `lib/platforms/gettr/client.js`
- `session.js` log label: `✓ thread-reply` vs `⚠ profile-reply`, field `strategy` di `sentLog`
- Tidak perlu ubah lagi kecuali GETTR ganti endpoint atau format ID
