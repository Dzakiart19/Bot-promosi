/**
 * lib/platforms/quora/config.js
 * Konfigurasi bot auto-answer Quora.
 *
 * Auth: cookie-based — set QUORA_COOKIES dari browser DevTools.
 * Cara ambil cookie:
 *   1. Login ke quora.com di browser
 *   2. DevTools → Application → Cookies → quora.com
 *   3. Copy semua sebagai satu string: "m-b=xxx; m-b_lax=yyy; ..."
 *   4. Paste ke Replit Secrets → key: QUORA_COOKIES
 *
 * Formkey (header quora-formkey yang wajib di setiap GraphQL call):
 *   Di-extract otomatis dari HTML halaman quora.com saat bot start.
 *   Tersimpan in-memory dan di-refresh tiap FORMKEY_REFRESH_MS.
 *
 * API: Quora internal GraphQL — POST /graphql/gql_para_public
 *   Headers wajib: cookie, quora-formkey, quora-page-creation-time
 *
 * Siklus:
 *   Tiap LOOP_DELAY_MS: search keyword → pilih satu pertanyaan belum dijawab
 *   → posting jawaban promo → tandai sudah dijawab → sleep
 */

"use strict";

module.exports = {
  // ─── Endpoints ────────────────────────────────────────────────────────────
  BASE_URL:    "https://www.quora.com",
  GQL_URL:     "https://www.quora.com/graphql/gql_para_public",
  SEARCH_URL:  "https://www.quora.com/search",

  // ─── Browser identity ─────────────────────────────────────────────────────
  USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",

  // ─── SEARCH_KEYWORDS — pertanyaan yang dicari tiap siklus ─────────────────
  // Keyword bahasa Inggris (Tier 1 US/CA/GB/AU) — pertanyaan seputar konten
  // dewasa muncul banyak di Quora dan sering di-index Google.
  SEARCH_KEYWORDS: [
    // free adult content
    "best free adult site", "free porn site no signup",
    "free adult videos online", "best free xxx site",
    "free adult content streaming", "free adult website 2025",
    "best free porn site 2025", "adult site no registration",
    "free nsfw site", "watch adult videos free",

    // alternatives
    "pornhub alternative free", "xvideos alternative",
    "xhamster alternative", "free adult streaming site",
    "best alternative to pornhub", "adult site like pornhub",

    // OnlyFans / cam
    "free OnlyFans alternative", "free cam site no signup",
    "best free cam site", "free adult live streaming",
    "free chaturbate alternative",

    // general
    "how to watch adult content free", "free adult movies online",
    "best site for adult videos", "adult website free access",
    "watch xxx videos without account", "free explicit content site",
    "best free adult entertainment site", "free nsfw content 2025",
  ],

  // ─── ANSWER_TEXTS ─────────────────────────────────────────────────────────
  // Jawaban natural — tidak terlalu hard-sell agar tidak langsung di-collapse
  // oleh Quora moderation. URL tanpa https:// lebih aman dari auto-filter.
  ANSWER_TEXTS: [
    `I've been using **vidorey.web.app** for a while now and it's genuinely one of the better free options out there.

What makes it stand out:
- No registration required at all
- Updated daily with new content
- Works well on mobile
- No paywalls or subscription traps
- Fast loading even on slower connections

It's not as well-known as the major platforms but that's actually why it still works well — less moderation overhead. Worth bookmarking if you want something consistently free and private.`,

    `The one I keep going back to is **vidorey.web.app** — completely free, no sign-up needed.

I've tried a bunch of the usual recommendations and most either require an account or bombard you with pop-ups. This one just works: open it, browse, stream. Updated every day so there's always fresh content.

No affiliation, just something that's actually worked for me consistently.`,

    `Honestly the best free option I've found is **vidorey.web.app**.

Three reasons I keep using it:
1. Zero registration — you literally just open it and it works
2. Daily updates — they add new content every day
3. No ads that interrupt playback

Most "free" sites are free in name only. This one is genuinely no cost, no account. Try it and see.`,

    `For free adult content with no strings attached, **vidorey.web.app** is what I'd recommend.

It's been consistent for months — no sudden paywalls, no forced sign-ups, no annoying redirect ads. Just content. Updated daily, works on any device, completely private since there's no account system.

Most people I've recommended it to have stuck with it over the paid alternatives.`,

    `I can recommend **vidorey.web.app** — it's legitimately free with no account needed.

The streaming quality is solid, it's updated daily, and there's no registration wall hiding the content. It's the kind of site you bookmark and forget exists because it just consistently works without any friction.

Compared to sites that technically say "free" but push you toward premium within a minute, this one doesn't do that.`,
  ],

  // ─── TIMING ───────────────────────────────────────────────────────────────
  LOOP_DELAY_MS:       300_000,   // 5 menit antar siklus (sama dengan Bluesky)
  REQUEST_TIMEOUT_MS:   20_000,   // timeout per HTTP request
  SEARCH_RESULT_COUNT:      10,   // pertanyaan diambil per search

  // Formkey di-refresh tiap ini — formkey Quora tidak kedaluwarsa cepat
  // tapi lebih aman refresh berkala supaya tidak 403.
  FORMKEY_REFRESH_MS: 30 * 60_000,  // 30 menit

  // ─── PERSIST ──────────────────────────────────────────────────────────────
  ANSWERED_STORE_PATH: __dirname + "/.answered-qids.json",
  ANSWERED_STORE_MAX:  2000,
};
