/**
 * lib/platforms/threads/config.js
 * Konfigurasi bot Threads (threads.com) — auto-comment & auto-post.
 *
 * ── Hasil recon (24 Jul 2026) ───────────────────────────────────────────────
 * Platform : Meta / Threads (codename: Barcelona)
 * API endpoint : POST https://www.threads.com/api/graphql
 * Format body  : application/x-www-form-urlencoded
 *   → field lsd       = LSD token (diambil fresh dari HTML tiap startup)
 *   → field doc_id    = persisted GraphQL query/mutation ID (lihat DOC_ID_FALLBACK)
 *   → field variables = JSON payload per operasi
 *
 * Auth:
 *   - Cookie: sessionid (dari login Threads/Instagram) + csrftoken
 *   - Header X-FB-LSD  = nilai lsd yang sama dengan field form
 *   - Header X-CSRFToken = csrftoken cookie
 *   - Header X-IG-App-Id = 238260118697367  (app_id Threads, dari HTML meta)
 *   - Header X-ASBD-Id  = 129477
 *
 * LSD token:
 *   Ditemukan di script tag __eqmc dalam HTML: {"u":"...","l":"<LSD>","f":null}
 *   Diambil fresh tiap startup (token berumur pendek).
 *
 * doc_id:
 *   Persisted GraphQL query IDs Threads — di-discover otomatis dari JS bundle
 *   saat startup dengan sessionid. Fallback ke nilai di DOC_ID_FALLBACK kalau
 *   discovery gagal. Jika fallback juga gagal (Threads update bundle), log
 *   pesan jelas "Query not found" dan skip siklus.
 *
 * Cara dapat THREADS_COOKIES:
 *   1. Buka threads.com di browser → login
 *   2. DevTools → Application → Cookies → threads.com
 *   3. Copy nilai 'sessionid' dan 'csrftoken'
 *   4. Set THREADS_COOKIES = "sessionid=<val>; csrftoken=<val>"
 */

"use strict";

module.exports = {
  // ── Endpoint ────────────────────────────────────────────────────────────────
  API_BASE:  "https://www.threads.com/api/graphql",
  PAGE_URL:  "https://www.threads.com/",
  ORIGIN:    "https://www.threads.com",
  REFERER:   "https://www.threads.com/",
  USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",

  // ── Meta App Info ────────────────────────────────────────────────────────────
  APP_ID:  "238260118697367",   // X-IG-App-Id — konstan untuk semua klien web Threads
  ASBD_ID: "359341",            // X-ASBD-Id (update 24 Jul 2026, dari Network tab)

  // ── doc_id fallback (persisted GraphQL IDs Threads) ─────────────────────────
  // Auto-discover dari JS bundle lebih diutamakan (lihat client.js#discoverDocIds).
  // Nilai di bawah dipakai kalau discovery gagal. Jika ikut gagal → log warning.
  //
  // ⚠️  CARA UPDATE doc_id (jika bot error "GraphQL document not found"):
  //   1. Buka Chrome → threads.com → login
  //   2. DevTools → Network tab → filter "graphql"
  //   3. Lakukan search / buat post di Threads
  //   4. Lihat request POST ke /api/graphql → tab Payload
  //   5. Salin nilai field "doc_id" dan update di bawah
  //
  // Konfirmasi status (Jul 2026 recon):
  //   - SearchThreads "6623541627726503" → EXPIRED (404 not found)
  //   - CreatePost/Reply "7357111877698751" → EXPIRED (404 not found)
  //   - GetFeed "26135657399374977" → VALID (custom_feeds: for_you, following, dll)
  //   - SearchThreads & CreatePost ada di lazy-loaded bundle (tidak di static bundle)
  DOC_ID_FALLBACK: {
    // BarcelonaSearchThreadsQuery — expired, butuh update dari Network tab
    SearchThreads:   "6623541627726503",
    // custom_feeds query — VALID, tapi hanya return feed metadata (bukan posts)
    GetFeed:         "26135657399374977",
    // GetRecommended — expired
    GetRecommended:  "25625194612001313",
    // BarcelonaCreateTextPostMutation — expired, butuh update dari Network tab
    CreatePost:      "7357111877698751",
    // Reply mutation — expired, sama dengan CreatePost
    CreateReply:     "7357111877698751",
  },

  // ── Profil publik Threads untuk scraping post IDs ────────────────────────────
  // Dipakai sebagai fallback saat SearchThreads gagal (doc_id expired).
  // Bot akan fetch HTML profil ini dan ekstrak post IDs yang bisa dikomentari.
  PROFILE_SEEDS: [
    "https://www.threads.com/@threads",
    "https://www.threads.com/@meta",
    "https://www.threads.com/@zuck",
    "https://www.threads.com/@instagram",
  ],

  // ── Keywords untuk SEARCH mode (cari thread → comment) ──────────────────────
  SEARCH_KEYWORDS: [
    // platform adult / random chat
    "omegle", "chatroulette", "stranger chat", "random video chat", "free random chat",
    // platform porn
    "pornhub", "xvideos", "xnxx", "xhamster", "OnlyFans", "fansly",
    // kata populer
    "porn", "nsfw", "sex chat", "horny", "adult content", "xxx video",
    "free porn", "adult movies", "explicit content", "nude girls",
    "sex video", "sexy video", "erotic", "cam girl", "live sex",
    "leaked nudes", "naked girls", "adult site",
    // trending / niche
    "milf", "hentai", "BDSM", "hookup", "casual sex",
    "OnlyFans free", "OF leaked", "Chaturbate", "stripchat",
  ],

  // ── Teks comment/reply (dipilih acak per siklus) ────────────────────────────
  COMMENT_TEXTS: [
    "Seeking discreet adult content? Vidorey offers a vast collection of free XXX videos and porn movies, updated daily. Stream instantly, no registration needed. Your private pleasure awaits: https://vidorey.web.app",
    "Hey 👀 Want free XXX videos with zero sign-up? Vidorey streams thousands of hot adult movies updated every day — total privacy, zero cost: https://vidorey.web.app",
    "Why pay for adult content? Vidorey is 100% free — hot XXX videos updated daily, instant streaming, no account needed 🔞 https://vidorey.web.app",
    "Looking for free porn that actually delivers? Vidorey has thousands of explicit HD videos updated every day. No registration required: https://vidorey.web.app",
    "💋 Your secret guilty pleasure is one click away — Vidorey streams free adult videos daily, zero registration, total privacy: https://vidorey.web.app",
    "Bored? Vidorey has the hottest free XXX content streaming right now 🔥 Thousands of videos, updated daily, no login needed: https://vidorey.web.app",
    "💦 Free adult content, HD quality, daily updates — no account required. Vidorey is the best-kept secret online 😈 https://vidorey.web.app",
    "Adult videos updated every single day, 100% free, no registration. Vidorey — your private pleasure destination 🍑 https://vidorey.web.app",
    "Want to watch free XXX movies right now? Vidorey has thousands of scenes ready to stream — no sign-up, no fees 🥵 https://vidorey.web.app",
    "😏 The hottest free adult site you didn't know about — Vidorey. Daily updates, zero cost, instant streaming: https://vidorey.web.app",
  ],

  // ── Teks auto-post (thread mandiri, dipilih acak tiap 1 jam) ────────────────
  POST_TEXTS: [
    "🔥 Why scroll mindlessly when you can watch FREE XXX videos anytime? Vidorey has thousands of hot scenes updated daily — no sign-up, no fees, just pleasure 😈\n👉 https://vidorey.web.app\n#FreeXXX #AdultContent #NSFW #FreePorn",
    "💦 Feeling lonely tonight? Vidorey's got you covered with the hottest free porn movies streaming right now. No registration needed 🔞\n➡️ https://vidorey.web.app\n#FreePorn #PornVideos #NSFW #AdultVideos",
    "😏 The best free adult content platform just got better. Vidorey — daily updates, zero cost, total privacy.\nStream now: https://vidorey.web.app\n#FreeAdultContent #XXXVideos #NSFW",
    "🚨 Still paying for adult content? Stop. Vidorey gives you EVERYTHING for free — thousands of XXX videos, updated every day 🔥\nhttps://vidorey.web.app\n#FreeXXX #FreePorn #AdultVideos #NoRegistration",
    "🥵 Hot videos, free access, no registration. That's Vidorey. Your new favorite guilty pleasure is one click away 😈\n👉 https://vidorey.web.app\n#HotVideos #FreeAdultContent #XXX #NSFW",
    "🎬 Bored? Vidorey has the freshest free porn uploaded daily. HD quality, instant stream, 100% private 🔞\nCheck it out: https://vidorey.web.app\n#FreePorn #AdultContent #NSFW #HDPorn",
    "🌶️ Your daily dose of FREE adult content is waiting at Vidorey. No account needed — just open and enjoy 😏\nhttps://vidorey.web.app\n#FreeAdultContent #SexVideos #NSFW #XXX",
    "💋 Why pay for OnlyFans when Vidorey streams thousands of free XXX movies for you right now? No strings attached 🔥\n➡️ https://vidorey.web.app\n#OnlyFans #FreePorn #FreeXXX #NSFW",
    "😈 Private. Free. Hot. Vidorey is the adult platform you didn't know you needed. Daily updates, zero registration 🔞\nhttps://vidorey.web.app\n#FreeXXX #AdultVideos #NSFW #PornVideos",
    "🔞 Free XXX videos with no registration? Yes, that's real. Vidorey — the internet's best-kept secret for adult content 🥵\n👉 https://vidorey.web.app\n#XXXVideos #FreePorn #FreeAdultContent #NSFW",
  ],

  // ── Timing ───────────────────────────────────────────────────────────────────
  LOOP_DELAY_MS:       300000,   // delay antar siklus (5 menit)
  POST_INTERVAL_MS:   3600000,   // auto-post thread baru 1x per jam
  COMMENT_INTERVAL_MS: 300000,   // comment ke search result tiap 5 menit
  SEARCH_COUNT:            20,   // jumlah hasil per pencarian keyword
  REQUEST_TIMEOUT_MS:   15000,   // timeout per HTTP request

  // ── Persist ID yang sudah dikomentari ────────────────────────────────────────
  REPLIED_STORE_PATH: __dirname + "/.replied-ids.json",
  REPLIED_STORE_MAX:  2000,
};
