/**
 * lib/platforms/gettr/config.js
 * Konfigurasi bot auto-comment GETTR.
 *
 * Arsitektur: login → ambil trending posts → comment promo → sleep.
 * Semua request ke https://gettr.com/api/... dengan header x-app-auth.
 */

"use strict";

module.exports = {
  // Endpoint
  API_BASE:   "https://gettr.com/api",
  ORIGIN:     "https://gettr.com",
  REFERER:    "https://gettr.com/",
  USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",

  // Jumlah trending posts yang diambil per siklus (diperbesar agar ada kandidat setelah filter keyword)
  TRENDING_MAX: 50,

  // Timing — mirip X Bot: COMMENT dan POST masing-masing 1x per jam
  LOOP_DELAY_MS:          300_000,   // 5 menit interval pengecekan (bukan eksekusi)
  REQUEST_TIMEOUT_MS:      15_000,   // timeout per request
  POST_DELAY_MS:            8_000,   // jeda antar komentar dalam satu siklus
  MAX_COMMENTS_PER_CYCLE:       1,   // 1 komentar per siklus comment
  COMMENT_INTERVAL_MS:  3_600_000,   // comment 1x per jam


  // ─── KEYWORDS untuk prioritas comment (keyword match = prioritas utama) ──
  // Post yang mengandung keyword ini dikomentari duluan.
  // Fallback: post non-keyword dari trending yang tidak dari akun politik
  // (lihat BLOCKED_ACCOUNTS di bawah) tetap dikomentari — mirip COMMENT mode X Bot.
  SEARCH_KEYWORDS: [
    // adult/explicit
    "porn", "sex", "nsfw", "adult", "xxx",
    "onlyfans", "naked", "nude", "horny",
    "sexy", "erotic", "free porn", "adult content", "18+",
    "chaturbate", "stripchat", "cam girl",
    "milf", "lesbian", "orgasm",
    // dating/relationship
    "hookup", "dating", "sugar daddy", "girlfriend", "boyfriend",
    "single", "relationship", "romance", "flirt", "tinder",
    // general entertainment/social
    "hot girls", "beautiful women", "attractive", "gorgeous",
    "love", "marriage", "partner", "meet girls",
    // broader — muncul di trending umum
    "woman", "women", "girl", "girls",
    "video", "watch", "stream", "free",
  ],

  // ─── AKUN YANG DIBLOKIR — tidak dikomentari meski trending ──────────────
  // Akun politik/berita besar di GETTR yang tidak relevan dengan niche kita.
  // Bot tetap akan komentar ke akun LAIN yang tidak ada di daftar ini (fallback).
  BLOCKED_ACCOUNTS: [
    "stevebannon", "warroom", "realdonaldtrump", "donaldjtrump",
    "gatewaypundit", "marjorietaylorgreene", "laurenboebert",
    "mattgaetz", "jimjordan", "tedcruz", "marcorubio",
    "mikepompeo", "mikepence", "rondesantis", "greggabbott",
    "foxnews", "breitbart", "oann", "newsmax", "epochtimes",
    "citizenfreepres", "gettrromance",
  ],

  // ─── COMMENT TEXTS — dipilih acak tiap komentar ──────────────────────────
  COMMENT_TEXTS: [
    "Seeking discreet adult content? Vidorey offers a vast collection of free XXX videos and porn movies, updated daily. Stream instantly, no registration needed. Your private pleasure awaits: vidorey.web.app",
    "Hey 👀 Want free XXX videos with zero sign-up? Vidorey streams thousands of hot adult movies updated every day — total privacy, zero cost: vidorey.web.app",
    "Why pay for adult content? Vidorey is 100% free — hot XXX videos updated daily, instant streaming, no account needed 🔞 vidorey.web.app",
    "Looking for free porn that actually delivers? Vidorey has thousands of explicit HD videos updated every day. No registration required: vidorey.web.app",
    "💋 Your secret guilty pleasure is one click away — Vidorey streams free adult videos daily, zero registration, total privacy: vidorey.web.app",
    "Bored? Vidorey has the hottest free XXX content streaming right now 🔥 Thousands of videos, updated daily, no login needed: vidorey.web.app",
    "💦 Free adult content, HD quality, daily updates — no account required. Vidorey is the best-kept secret online 😈 vidorey.web.app",
    "Adult videos updated every single day, 100% free, no registration. Vidorey — your private pleasure destination 🍑 vidorey.web.app",
    "Want to watch free XXX movies right now? Vidorey has thousands of scenes ready to stream — no sign-up, no fees 🥵 vidorey.web.app",
    "😏 The hottest free adult site you didn't know about — Vidorey. Daily updates, zero cost, instant streaming: vidorey.web.app",
    "🔥 No account. No credit card. Just pure free XXX content every day. Vidorey: vidorey.web.app",
    "Tired of paywalls? Vidorey gives you direct access to thousands of adult videos — free forever 🎬 vidorey.web.app",
    "🤫 Zero login, zero trace, all free. Vidorey is the private adult platform you needed 😈 vidorey.web.app",
    "Just found Vidorey 😍 free adult content, HD quality, updated daily — no sign-up at all: vidorey.web.app",
    "💥 Unlimited free porn, zero registration, fresh content daily. This is Vidorey 🔞 vidorey.web.app",
    "⚡ Thousands of explicit HD videos loading instantly, costing nothing — Vidorey: vidorey.web.app",
    "Hot. Free. Private. No nonsense. That's what Vidorey delivers 🥵 vidorey.web.app",
    "🎯 Every adult content category imaginable — all free, all HD, updated daily on Vidorey: vidorey.web.app",
    "😋 Free XXX videos on demand, no account required. Your next guilty pleasure: vidorey.web.app",
    "🌙 Late-night cravings sorted — thousands of free adult videos streaming right now: vidorey.web.app",
    "Skip the paywall. Skip the ads. Skip the sign-up. Just stream free adult content 🔥 vidorey.web.app",
    "💎 Premium-quality adult content at absolute zero cost. Vidorey delivers it daily: vidorey.web.app",
    "🚀 New adult videos every single day, free access forever, no login ever. That's Vidorey 😏 vidorey.web.app",
    "No pop-ups. No credit card. No account. Just the hottest free adult content: vidorey.web.app 🔞",
    "🍒 Every XXX category, thousands of free scenes, zero registration. Vidorey: vidorey.web.app",
    "Why risk sketchy sites? Vidorey delivers safe, free, HD adult content every day 💋 vidorey.web.app",
    "🔓 Unlimited free adult content, HD quality, zero sign-up. Open Vidorey now: vidorey.web.app",
    "The adult platform you actually wanted — free, private, no BS, daily updates 😈 vidorey.web.app",
    "💣 Still paying for adult content? Vidorey streams thousands of free XXX videos daily: vidorey.web.app",
    "🎬 The freshest free adult videos, HD quality, updated every single day. Vidorey 🥵 vidorey.web.app",
    "Vidorey has the best free adult videos online and not enough people know about it 😍 vidorey.web.app",
    "🌶️ Spice up your night with free HD adult content, instant stream, zero login: vidorey.web.app",
    "No buffering. No paywall. Free XXX videos in perfect HD, right now 🔥 vidorey.web.app",
    "🥂 Unlimited free adult content, any time, any device. Vidorey never charges a cent: vidorey.web.app",
    "😩 Can't sleep? Thousands of free adult videos ready to stream — zero sign-up 🔞 vidorey.web.app",
    "Fresh adult content added every day — free, private, no account ever required 💦 vidorey.web.app",
    "🏆 The best free adult streaming site on the internet right now. No debate: vidorey.web.app",
    "One link. Zero sign-up. Unlimited free XXX content. Vidorey keeps it simple 😏 vidorey.web.app",
    "🌟 The internet's freshest free adult videos, updated daily, no registration: vidorey.web.app",
    "Free HD adult videos with ZERO registration? Yes, that's actually Vidorey 😮 vidorey.web.app",
    "🎁 Unlimited adult content, no strings, no sign-up. Your free gift: vidorey.web.app",
    "The adult site that respects your privacy. Free, fast, no account, no tracking 🔒 vidorey.web.app",
    "👁️ HD adult videos streaming free 24/7 — no registration, no fees: vidorey.web.app",
    "🌊 Thousands of XXX videos updated every single day — all completely free: vidorey.web.app",
    "Free adult content, no hassle, instant access. Vidorey is what you've been looking for 🥵 vidorey.web.app",
    "💫 Zero fees. Zero sign-up. 24/7 adult entertainment. Vidorey: vidorey.web.app",
    "🔑 Unlimited adult content, daily updates, HD quality, zero login: vidorey.web.app",
    "Adult content so good it should be paid — Vidorey keeps it 100% free 😈 vidorey.web.app",
    "📱 Any device, HD stream, zero cost. Your new adult content home 🔞 vidorey.web.app",
    "🌍 Millions stream free adult content on Vidorey daily — no registration needed: vidorey.web.app",
  ],

  // ─── POST TEXTS — auto-post mandiri (1x per jam) ─────────────────────────
  POST_TEXTS: [
    "🔥 Why scroll mindlessly when you can watch FREE XXX videos anytime? Vidorey has thousands of hot scenes updated daily — no sign-up, no fees, just pleasure 😈\n👉 vidorey.web.app\n#FreeXXX #AdultContent #NSFW #FreePorn #Vidorey",
    "💦 Feeling lonely tonight? Vidorey's got you covered with the hottest free porn movies streaming right now. No registration needed 🔞\n➡️ vidorey.web.app\n#FreePorn #PornVideos #NSFW #AdultVideos #XXX",
    "😏 The best free adult content platform just got better. Vidorey — daily updates, zero cost, total privacy.\nStream now: vidorey.web.app\n#FreeAdultContent #XXXVideos #NSFW #Vidorey #AdultContent",
    "🚨 Still paying for adult content? Stop. Vidorey gives you EVERYTHING for free — thousands of XXX videos, updated every day 🔥\nvidorey.web.app\n#FreeXXX #FreePorn #AdultVideos #NoRegistration #NSFW",
    "🥵 Hot videos, free access, no registration. That's Vidorey. Your new favorite guilty pleasure is one click away 😈\n👉 vidorey.web.app\n#HotVideos #FreeAdultContent #XXX #NSFW #FreePornVideos",
    "🎬 Bored? Vidorey has the freshest free porn uploaded daily. HD quality, instant stream, 100% private 🔞\nCheck it out: vidorey.web.app\n#FreePorn #PornHub #AdultContent #NSFW #HDPorn",
    "🌶️ Your daily dose of FREE adult content is waiting at Vidorey. No account needed — just open and enjoy 😏\nvidorey.web.app\n#FreeAdultContent #SexVideos #NSFW #XXX #Vidorey",
    "💋 Why pay for OnlyFans when Vidorey streams thousands of free XXX movies for you right now? No strings attached 🔥\n➡️ vidorey.web.app\n#OnlyFans #FreePorn #FreeXXX #NSFW #AdultContent",
    "😈 Private. Free. Hot. Vidorey is the adult platform you didn't know you needed. Daily updates, zero registration 🔞\nvidorey.web.app\n#FreeXXX #AdultVideos #NSFW #PornVideos #Vidorey",
    "🔞 Free XXX videos with no registration? Yes, that's real. Vidorey — the internet's best-kept secret for adult content 🥵\n👉 vidorey.web.app\n#XXXVideos #FreePorn #FreeAdultContent #NSFW #NoRegistration",
    "💥 Forget the paywalls. Vidorey gives you unlimited free access to the hottest adult videos online 😏\nvidorey.web.app\n#FreeAdultContent #FreePorn #XXX #NSFW #HotVideos",
    "🍑 New hot videos added every single day at Vidorey — FREE, no account needed. Pleasure one tap away 🔥\n➡️ vidorey.web.app\n#FreePornVideos #AdultContent #NSFW #FreeXXX #DailyUpdates",
    "🤫 Shhh... Vidorey is where adults go for free, private, unlimited XXX content. No login, no tracking 😈\nvidorey.web.app\n#FreeXXX #AdultContent #NSFW #PrivatePleasure #Vidorey",
    "⚡ Fast. Free. Hot. Vidorey streams the best adult content with zero cost and zero registration 🔞\nvidorey.web.app\n#FreePorn #AdultVideos #NSFW #XXXVideos #FreeAdultContent",
    "👀 Free adult content that actually works? Vidorey has thousands of videos ready to stream — no sign-up 🥵\nvidorey.web.app\n#FreeAdultContent #FreePorn #NSFW #XXX #NoSignUp",
    "🏆 Rated best free adult site online — no contest. Vidorey streams HD XXX videos daily, zero registration 😈\nvidorey.web.app\n#BestFreePorn #FreeXXX #AdultContent #NSFW #HDPorn",
    "🎯 One website. Thousands of free adult videos. Zero sign-up. Daily updates. That's Vidorey 🔥\nvidorey.web.app\n#FreePorn #AdultVideos #XXX #NSFW #FreeAdultContent",
    "🌟 The adult site that respects your privacy — no login, no tracking, just pure free content 🔒\nvidorey.web.app\n#PrivatePorn #FreeXXX #NSFW #AdultContent #NoTracking",
    "💎 Why settle for sketchy sites? Vidorey delivers safe, free, HD adult content every single day 😏\nvidorey.web.app\n#SafePorn #FreeAdultContent #HDPorn #XXX #NSFW",
    "🚀 Thousands of new adult videos, free forever, no login required. Vidorey never stops delivering 🔞\nvidorey.web.app\n#FreeXXX #DailyUpdates #AdultContent #NSFW #FreePornVideos",
    "📱 Phone, tablet, laptop — Vidorey streams free HD adult content on any device, zero sign-up 💦\nvidorey.web.app\n#MobilePorn #FreeAdultContent #HDPorn #XXX #NSFW",
    "🌍 The world's best free adult content platform is already waiting for you. Open Vidorey now 😍\nvidorey.web.app\n#FreeXXX #AdultContent #NSFW #FreePorn #Vidorey",
    "🍒 Every XXX category you can think of — all free, all HD, updated every day on Vidorey 🥵\nvidorey.web.app\n#XXXVideos #FreeAdultContent #NSFW #HardcorePorn #FreePorn",
    "🔓 Your access to unlimited free adult content starts here. No walls. No fees. No account. Vidorey 😈\nvidorey.web.app\n#FreeXXX #AdultContent #NSFW #NoRegistration #FreePorn",
    "🎁 Free unlimited adult content — consider it a gift. Vidorey has thousands of hot videos ready now 🔥\nvidorey.web.app\n#FreeGift #FreePorn #AdultVideos #XXX #NSFW",
    "💪 Forget subscriptions, forget paywalls. Vidorey gives you the hottest adult content completely free 🔞\nvidorey.web.app\n#NoSubscription #FreePorn #FreeXXX #AdultContent #NSFW",
    "🌙 Night mode on, phone out, Vidorey open — your private adult entertainment starts now 😏\nvidorey.web.app\n#LateNight #FreeXXX #AdultContent #NSFW #PrivatePleasure",
    "🔥 Vidorey drops fresh adult content every single day. Free, HD, instant — no account ever needed 😈\nvidorey.web.app\n#DailyPorn #FreeAdultContent #HDVideos #XXX #NSFW",
    "💋 Your guilty pleasure is one tap away. Vidorey streams free XXX content 24/7, no strings attached 🥵\nvidorey.web.app\n#GuiltyPleasure #FreePorn #AdultContent #XXX #NSFW",
    "🌶️ Hot, fresh, free adult videos added every day on Vidorey. No login. No limits. Just pleasure 🔞\nvidorey.web.app\n#HotVideos #FreeXXX #AdultContent #NSFW #NoLimits",
    "⚡ Stream thousands of free adult videos in HD right now — no sign-up, no buffering on Vidorey 😍\nvidorey.web.app\n#FastStream #HDPorn #FreeAdultContent #XXX #NSFW",
    "🤤 Adult content this good should cost money. But Vidorey gives it all away for free, every day 😈\nvidorey.web.app\n#FreeXXX #AdultVideos #NSFW #FreePorn #BestAdultSite",
    "👑 The king of free adult content is Vidorey — updated daily, zero registration, HD quality 🔥\nvidorey.web.app\n#BestFreePorn #KingOfXXX #AdultContent #NSFW #FreeAdultVideos",
    "🎬 HD adult films, daily updates, zero cost, zero sign-up. Vidorey is simply the best 🔞\nvidorey.web.app\n#HDPorn #FreePorn #DailyUpdates #XXX #NSFW",
    "💫 Private. Free. Unlimited. Vidorey is the adult platform you've been searching for 😏\nvidorey.web.app\n#PrivatePorn #FreeXXX #UnlimitedContent #NSFW #AdultContent",
  ],
  POST_INTERVAL_MS: 3_600_000,   // auto-post 1x per jam

  // File persist post id yang sudah dikomentari
  REPLIED_STORE_PATH: __dirname + "/.replied-ids.json",
  REPLIED_STORE_MAX:  2000,
};
