---
name: GETTR search API limitation
description: GETTR search/srchposts/srchhashtag tidak berfungsi server-side; workaround dan strategi fallback untuk comment targeting
---

# GETTR Search API: Tidak Berfungsi Server-Side

## Temuan
Semua endpoint search GETTR mengembalikan "Content Not Found" (`nfound: true`, `txt: "Content Not Found"`) regardless of keyword:
- `/api/u/post/srchposts?q=<keyword>` → rc: OK tapi list kosong
- `/api/u/post/srchhashtag?q=<keyword>` → sama
- `/api/u/posts/srch`, `/api/u/search/posts`, dll → 404/undefined

**Why:** GETTR mungkin memblokir search dari IP server (bukan browser), atau fitur ini memerlukan session yang lebih terautentikasi.

## Strategi Saat Ini (post-fix)
Source post: `/api/u/posts/trends` (trending) — endpoint yang terbukti berjalan.

**Dua-lapis filter di `fetchTrendingPosts`:**
1. **Lapis 1 (prioritas):** post yang text-nya mengandung `SEARCH_KEYWORDS` → dikomentari duluan
2. **Lapis 2 (fallback):** post mana saja dari trending yang bukan dari `BLOCKED_ACCOUNTS` (daftar akun politik) → dikomentari jika tidak ada keyword match

**Keterbatasan:** GETTR trending hampir 100% konten politik → keyword match jarang, fallback masih komentar ke post politik (hanya menghindari akun di BLOCKED_ACCOUNTS).

## Bug Fix Sekaligus
- `post.uid !== session.username` (bug lama) → `post.uid !== session.handle`
  - `session.username` = numeric ID `"278750417826824192"` (tidak pernah cocok dengan `post.uid` yang berupa handle)
  - `session.handle` = alfanumerik `"celadini"` (benar)

## Verifikasi Comment Berjalan
Komentar dengan `pid: <postId>` + `_t: "cmt"` → GETTR menyimpan sebagai `_t: "post"` tapi `pid` tetap ada → tampil di tab **Replies** akun sebagai "Replying to @..." ✅

**Why:** `_t: "cmt"` di request body diabaikan GETTR, yang menentukan comment vs post adalah field `pid`. Jika `pid` ada → muncul di Replies tab.
