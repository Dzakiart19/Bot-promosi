/**
 * lib/platforms/x/config.js
 * Konfigurasi bot auto-reply X (Twitter).
 *
 * Beda arsitektur dari platform chat lain: tidak ada socket.io/match,
 * cuma siklus search → reply → sleep. Lihat session.js.
 */

"use strict";

module.exports = {
  // Endpoint
  API_BASE:   "https://x.com/i/api/graphql",
  ORIGIN:     "https://x.com",
  REFERER:    "https://x.com/search",
  USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",

  // Bearer token web publik X — dipakai semua client web x.com, bukan rahasia/per-akun.
  BEARER: "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",

  // queryId GraphQL berubah tiap X update bundle JS-nya — bot coba discover
  // otomatis dari main.js saat startup (lihat client.js#discoverQueryIds),
  // nilai di bawah cuma fallback kalau discovery gagal.
  QUERY_ID_FALLBACK: {
    SearchTimeline:    "hz_94eVAtrtQo_vO3my7Rw",
    CreateTweet:       "hIL9XdleMYEtVXOZVbr8Bg",
    HomeTimeline:      "HBaE3oKxO3hQ5L1VO5YkKQ",
    HomeLatestTimeline:"Rpk_1h8CIVJbHAf6UYxdYA",
  },
  // Discovery main.js WAJIB lewat halaman yang di-render dengan cookie
  // (mis. /home), karena homepage logged-out sekarang pakai bundle
  // "entry-client-logged-out" yang TIDAK berisi queryId GraphQL.
  MAIN_JS_DISCOVERY_URL: "https://x.com/home",

  // ─── KEYWORDS — mode REPLY ────────────────────────────────────────────────
  // Istilah niche adult / random-chat yang dipakai untuk mencari tweet lalu
  // di-reply dengan pesan promo. Bot pilih satu keyword acak per siklus.
  KEYWORDS: [
    // platform random chat
    "omegle", "omegle is back", "omegle alternative", "chatroulette",
    "CooMeet", "CamSurf", "Bazoocam", "Emerald Chat", "ChatHub",
    "Shagle", "Chatspin", "stranger chat", "random chat app",
    "video chat with strangers", "random video chat", "free random chat",
    "omek", "chat roulette",
    // platform porn utama
    "pornhub", "xvideos", "xnxx", "xhamster", "redtube", "youporn",
    "tube8", "spankbang", "Brazzers", "bangbros", "reality kings",
    "naughty america", "Chaturbate", "stripchat", "LiveJasmin",
    "MyFreeCams", "bongacams", "Cam4", "Jerkmate", "flirt4free",
    // OnlyFans / creator
    "OnlyFans", "OnlyFans free", "OF leaked", "fansly", "fansly leaked",
    "OnlyFans leaked",
    // istilah seksual populer
    "porn", "nsfw", "sex chat", "masturbation", "sexting", "horny",
    "sex videos", "xxx movies", "free porn site", "watch porn",
    "nude girls", "naked girls", "hot sex", "hardcore porn",
    "amateur porn", "homemade porn", "sex tape", "leaked nudes",
    "adult videos", "erotic", "nude chat", "live sex chat",
    "cam girl", "webcam sex", "strip chat", "dirty chat",
    "sex talk", "erotic chat", "adult chat",
    // kategori/fetish
    "milf", "teen porn", "lesbian porn", "anal sex", "blowjob",
    "hentai", "anime porn", "BDSM", "fetish porn", "foot fetish",
    "rule34", "BBW porn", "ebony porn", "Asian porn", "latina porn",
    "interracial porn", "big dick", "big boobs", "stepmom", "stepsister",
    "threesome", "gangbang", "creampie", "cam sex",
    // kata kasar populer (trending)
    "pussy", "cock", "boobs", "cum", "fap", "wank", "orgasm",
    "gay", "bisexual", "lesbian",
    // hookup / dating
    "hookup app", "casual sex", "one night stand", "sugar daddy",
    "sugar baby", "sex meeting", "hookup tonight",
  ],

  // ─── COMMENT_KEYWORDS — mode COMMENT ──────────────────────────────────────
  // Keyword yang lebih umum/broad untuk menemukan postingan publik berpotensial
  // impresi tinggi. Bot pilih satu keyword acak per siklus comment (5 menit).
  COMMENT_KEYWORDS: [
    // adult content broad
    "adult content", "xxx video", "xxx content", "free porn", "free xxx",
    "adult movies", "adult films", "adult video", "adult entertainment",
    "adult movies online", "free adult", "explicit content",
    "explicit videos", "mature content", "rated x", "18+ content",
    "18 plus", "nsfw content", "sexual content",
    // platform populer
    "OnlyFans", "only fans", "Chaturbate", "stripchat",
    // wanita / visual
    "hot girls", "sexy girls", "nude women", "naked", "nudes",
    "nude pics", "hot naked", "sexy naked", "nude content",
    "naked content", "hot women", "thick girls",
    // video
    "sex video", "sex videos", "hot video", "sexy videos",
    "erotic videos", "porn videos", "porn stream", "sex stream",
    "watch xxx", "watch sex", "free video xxx", "sex movies free",
    "sex movies", "xxx site", "porn website", "adult site",
    // live cam
    "live cam", "cam show", "webcam girls",
    // konten bocor / creator
    "leaked content", "OnlyFans content", "leaked nudes",
    "amateur sex", "homemade porn", "couple sex", "sex tape leaked",
    // trending terms
    "horny twitter", "NSFW twitter", "horny",
  ],

  // Isi reply — dipilih acak tiap siklus.
  // TIDAK ada hashtag inline di sini — hashtag diinjeksi otomatis oleh pickHashtags()
  // di session.js supaya total teks tidak melebihi 280 karakter X.
  REPLY_TEXTS: [
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
    "🔥 No account. No credit card. Just pure free XXX content every single day. Vidorey: https://vidorey.web.app",
    "Tired of paywalls and sign-ups? Vidorey gives you direct access to thousands of adult videos — free forever 🎬 https://vidorey.web.app",
    "🤫 Zero login, zero trace, all free. Vidorey is the private adult platform you needed 😈 https://vidorey.web.app",
    "Just found Vidorey 😍 free adult content, HD quality, updated daily — no sign-up whatsoever: https://vidorey.web.app",
    "💥 Unlimited free porn, zero registration, fresh content daily. This is Vidorey 🔞 https://vidorey.web.app",
    "⚡ Thousands of explicit HD videos loading instantly, streaming smooth, costing nothing — Vidorey: https://vidorey.web.app",
    "Hot. Free. Private. No nonsense. That's what Vidorey delivers 🥵 https://vidorey.web.app",
    "🎯 Every adult content category imaginable — all free, all HD, updated daily on Vidorey: https://vidorey.web.app",
    "😋 Free XXX videos on demand, no account required. Your next guilty pleasure: https://vidorey.web.app",
    "🌙 Late-night cravings sorted — thousands of free adult videos streaming right now on Vidorey: https://vidorey.web.app",
    "Skip the paywall. Skip the ads. Skip the sign-up. Just stream free adult content 🔥 https://vidorey.web.app",
    "💎 Premium-quality adult content at absolute zero cost. Vidorey delivers it daily: https://vidorey.web.app",
    "🚀 New adult videos every single day, free access forever, no login ever. That's Vidorey 😏 https://vidorey.web.app",
    "No pop-ups. No credit card. No account. Just the hottest free adult content around 🔞 https://vidorey.web.app",
    "🍒 Every XXX category, thousands of free scenes, zero registration. Vidorey: https://vidorey.web.app",
    "Why risk sketchy sites? Vidorey delivers safe, free, HD adult content every single day 💋 https://vidorey.web.app",
    "🔓 Unlimited free adult content, instant stream, HD quality, zero sign-up. Open Vidorey now: https://vidorey.web.app",
    "The adult platform you actually wanted — free, private, no BS, daily updates 😈 https://vidorey.web.app",
    "💣 Still paying for adult content? Vidorey streams thousands of free XXX videos daily: https://vidorey.web.app",
    "🎬 The freshest free adult videos, HD quality, updated every single day. Vidorey 🥵 https://vidorey.web.app",
    "Vidorey has the best free adult videos online and not enough people know about it 😍 https://vidorey.web.app",
    "🌶️ Spice up your night with free HD adult content, instant stream, zero login: https://vidorey.web.app",
    "No buffering. No paywall. Free XXX videos in perfect HD, right now 🔥 https://vidorey.web.app",
    "🥂 Unlimited free adult content, any time, any device. Vidorey never charges a cent: https://vidorey.web.app",
    "😩 Can't sleep? Thousands of free adult videos ready to stream — zero sign-up on Vidorey 🔞 https://vidorey.web.app",
    "Fresh adult content added every day — free, private, no account ever required 💦 https://vidorey.web.app",
    "🏆 The best free adult streaming site on the internet right now. No debate: https://vidorey.web.app",
    "One link. Zero sign-up. Unlimited free XXX content. Vidorey keeps it simple 😏 https://vidorey.web.app",
    "🌟 The internet's freshest free adult videos, updated daily, no registration — Vidorey: https://vidorey.web.app",
    "Free HD adult videos with ZERO registration? Yes, that's actually Vidorey 😮 https://vidorey.web.app",
    "🎁 Unlimited adult content, no strings, no sign-up needed. Your free gift: https://vidorey.web.app",
    "The adult site that respects your privacy. Free, fast, no account, no tracking 🔒 https://vidorey.web.app",
    "👁️ HD adult videos streaming free 24/7 — no registration, no fees, open right now: https://vidorey.web.app",
    "🌊 Thousands of XXX videos updated every single day — all completely free on Vidorey: https://vidorey.web.app",
    "Free adult content, no hassle, instant access. Vidorey is what you've been looking for 🥵 https://vidorey.web.app",
    "💫 Zero fees. Zero sign-up. 24/7 adult entertainment. Vidorey: https://vidorey.web.app",
    "🔑 Unlimited adult content, daily updates, HD quality, zero login. The secret is Vidorey: https://vidorey.web.app",
    "Adult content so good it should be paid — Vidorey keeps it 100% free always 😈 https://vidorey.web.app",
    "📱 Any device, HD stream, zero cost. Vidorey is your new adult content home 🔞 https://vidorey.web.app",
    "🌍 Millions stream free adult content on Vidorey daily — no registration, updated every day: https://vidorey.web.app",
  ],
  // Isi comment — dipilih acak tiap siklus.
  // TIDAK ada hashtag inline — diinjeksi oleh pickHashtags() di session.js.
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
    "🔥 No account. No credit card. Just pure free XXX content every single day. Vidorey: https://vidorey.web.app",
    "Tired of paywalls and sign-ups? Vidorey gives you direct access to thousands of adult videos — free forever 🎬 https://vidorey.web.app",
    "🤫 Zero login, zero trace, all free. Vidorey is the private adult platform you needed 😈 https://vidorey.web.app",
    "Just found Vidorey 😍 free adult content, HD quality, updated daily — no sign-up whatsoever: https://vidorey.web.app",
    "💥 Unlimited free porn, zero registration, fresh content daily. This is Vidorey 🔞 https://vidorey.web.app",
    "⚡ Thousands of explicit HD videos loading instantly, streaming smooth, costing nothing — Vidorey: https://vidorey.web.app",
    "Hot. Free. Private. No nonsense. That's what Vidorey delivers 🥵 https://vidorey.web.app",
    "🎯 Every adult content category imaginable — all free, all HD, updated daily on Vidorey: https://vidorey.web.app",
    "😋 Free XXX videos on demand, no account required. Your next guilty pleasure: https://vidorey.web.app",
    "🌙 Late-night cravings sorted — thousands of free adult videos streaming right now on Vidorey: https://vidorey.web.app",
    "Skip the paywall. Skip the ads. Skip the sign-up. Just stream free adult content 🔥 https://vidorey.web.app",
    "💎 Premium-quality adult content at absolute zero cost. Vidorey delivers it daily: https://vidorey.web.app",
    "🚀 New adult videos every single day, free access forever, no login ever. That's Vidorey 😏 https://vidorey.web.app",
    "No pop-ups. No credit card. No account. Just the hottest free adult content around 🔞 https://vidorey.web.app",
    "🍒 Every XXX category, thousands of free scenes, zero registration. Vidorey: https://vidorey.web.app",
    "Why risk sketchy sites? Vidorey delivers safe, free, HD adult content every single day 💋 https://vidorey.web.app",
    "🔓 Unlimited free adult content, instant stream, HD quality, zero sign-up. Open Vidorey now: https://vidorey.web.app",
    "The adult platform you actually wanted — free, private, no BS, daily updates 😈 https://vidorey.web.app",
    "💣 Still paying for adult content? Vidorey streams thousands of free XXX videos daily: https://vidorey.web.app",
    "🎬 The freshest free adult videos, HD quality, updated every single day. Vidorey 🥵 https://vidorey.web.app",
    "Vidorey has the best free adult videos online and not enough people know about it 😍 https://vidorey.web.app",
    "🌶️ Spice up your night with free HD adult content, instant stream, zero login: https://vidorey.web.app",
    "No buffering. No paywall. Free XXX videos in perfect HD, right now 🔥 https://vidorey.web.app",
    "🥂 Unlimited free adult content, any time, any device. Vidorey never charges a cent: https://vidorey.web.app",
    "😩 Can't sleep? Thousands of free adult videos ready to stream — zero sign-up on Vidorey 🔞 https://vidorey.web.app",
    "Fresh adult content added every day — free, private, no account ever required 💦 https://vidorey.web.app",
    "🏆 The best free adult streaming site on the internet right now. No debate: https://vidorey.web.app",
    "One link. Zero sign-up. Unlimited free XXX content. Vidorey keeps it simple 😏 https://vidorey.web.app",
    "🌟 The internet's freshest free adult videos, updated daily, no registration — Vidorey: https://vidorey.web.app",
    "Free HD adult videos with ZERO registration? Yes, that's actually Vidorey 😮 https://vidorey.web.app",
    "🎁 Unlimited adult content, no strings, no sign-up needed. Your free gift: https://vidorey.web.app",
    "The adult site that respects your privacy. Free, fast, no account, no tracking 🔒 https://vidorey.web.app",
    "👁️ HD adult videos streaming free 24/7 — no registration, no fees, open right now: https://vidorey.web.app",
    "🌊 Thousands of XXX videos updated every single day — all completely free on Vidorey: https://vidorey.web.app",
    "Free adult content, no hassle, instant access. Vidorey is what you've been looking for 🥵 https://vidorey.web.app",
    "💫 Zero fees. Zero sign-up. 24/7 adult entertainment. Vidorey: https://vidorey.web.app",
    "🔑 Unlimited adult content, daily updates, HD quality, zero login. The secret is Vidorey: https://vidorey.web.app",
    "Adult content so good it should be paid — Vidorey keeps it 100% free always 😈 https://vidorey.web.app",
    "📱 Any device, HD stream, zero cost. Vidorey is your new adult content home 🔞 https://vidorey.web.app",
    "🌍 Millions stream free adult content on Vidorey daily — no registration, updated every day: https://vidorey.web.app",
  ],

  // Teks auto-post (pilih acak tiap 1 jam) — bervariasi supaya tidak terlihat spam
  POST_TEXTS: [
    "🔥 Why scroll mindlessly when you can watch FREE XXX videos anytime? Vidorey has thousands of hot scenes updated daily — no sign-up, no fees, just pleasure 😈\n👉 https://vidorey.web.app\n#FreeXXX #AdultContent #NSFW #FreePorn #Vidorey",
    "💦 Feeling lonely tonight? Vidorey's got you covered with the hottest free porn movies streaming right now. No registration needed 🔞\n➡️ https://vidorey.web.app\n#FreePorn #PornVideos #NSFW #AdultVideos #XXX",
    "😏 The best free adult content platform just got better. Vidorey — daily updates, zero cost, total privacy.\nStream now: https://vidorey.web.app\n#FreeAdultContent #XXXVideos #NSFW #Vidorey #AdultContent",
    "🚨 Still paying for adult content? Stop. Vidorey gives you EVERYTHING for free — thousands of XXX videos, updated every day 🔥\nhttps://vidorey.web.app\n#FreeXXX #FreePorn #AdultVideos #NoRegistration #NSFW",
    "🥵 Hot videos, free access, no registration. That's Vidorey. Your new favorite guilty pleasure is one click away 😈\n👉 https://vidorey.web.app\n#HotVideos #FreeAdultContent #XXX #NSFW #FreePornVideos",
    "🎬 Bored? Vidorey has the freshest free porn uploaded daily. HD quality, instant stream, 100% private 🔞\nCheck it out: https://vidorey.web.app\n#FreePorn #PornHub #AdultContent #NSFW #HDPorn",
    "🌶️ Your daily dose of FREE adult content is waiting at Vidorey. No account needed — just open and enjoy 😏\nhttps://vidorey.web.app\n#FreeAdultContent #SexVideos #NSFW #XXX #Vidorey",
    "💋 Why pay for OnlyFans when Vidorey streams thousands of free XXX movies for you right now? No strings attached 🔥\n➡️ https://vidorey.web.app\n#OnlyFans #FreePorn #FreeXXX #NSFW #AdultContent",
    "😈 Private. Free. Hot. Vidorey is the adult platform you didn't know you needed. Daily updates, zero registration 🔞\nhttps://vidorey.web.app\n#FreeXXX #AdultVideos #NSFW #PornVideos #Vidorey",
    "🔞 Free XXX videos with no registration? Yes, that's real. Vidorey — the internet's best-kept secret for adult content 🥵\n👉 https://vidorey.web.app\n#XXXVideos #FreePorn #FreeAdultContent #NSFW #NoRegistration",
    "💥 Forget the paywalls. Vidorey gives you unlimited free access to the hottest adult videos online. Stream now 😏\nhttps://vidorey.web.app\n#FreeAdultContent #FreePorn #XXX #NSFW #HotVideos",
    "🍑 New hot videos added every single day at Vidorey — completely FREE, no account needed. Your pleasure is just one tap away 🔥\n➡️ https://vidorey.web.app\n#FreePornVideos #AdultContent #NSFW #FreeXXX #DailyUpdates",
    "🤫 Shhh... Vidorey is where adults go for free, private, and unlimited XXX content. No login, no tracking, just fun 😈\nhttps://vidorey.web.app\n#FreeXXX #AdultContent #NSFW #PrivatePleasure #Vidorey",
    "⚡ Fast. Free. Hot. Vidorey streams the best adult content with zero cost and zero registration. Try it now 🔞\nhttps://vidorey.web.app\n#FreePorn #AdultVideos #NSFW #XXXVideos #FreeAdultContent",
    "👀 Looking for free adult content that actually works? Vidorey has thousands of videos ready to stream right now — no sign-up 🥵\nhttps://vidorey.web.app\n#FreeAdultContent #FreePorn #NSFW #XXX #NoSignUp",
    "🏆 Rated the best free adult site online — no contest. Vidorey streams HD XXX videos daily with zero registration 😈\nhttps://vidorey.web.app\n#BestFreePorn #FreeXXX #AdultContent #NSFW #HDPorn",
    "🎯 One website. Thousands of free adult videos. Zero sign-up. Daily updates. That's Vidorey 🔥\nhttps://vidorey.web.app\n#FreePorn #AdultVideos #XXX #NSFW #FreeAdultContent",
    "🌟 The adult site that respects your privacy — no login, no tracking, just pure free content 🔒\nVidorey: https://vidorey.web.app\n#PrivatePorn #FreeXXX #NSFW #AdultContent #NoTracking",
    "💎 Why settle for sketchy sites? Vidorey delivers safe, free, HD adult content every single day 😏\nhttps://vidorey.web.app\n#SafePorn #FreeAdultContent #HDPorn #XXX #NSFW",
    "🚀 Thousands of new adult videos, free forever, no login required. Vidorey never stops delivering 🔞\nhttps://vidorey.web.app\n#FreeXXX #DailyUpdates #AdultContent #NSFW #FreePornVideos",
    "📱 Phone, tablet, laptop — Vidorey streams free HD adult content on any device, zero sign-up 💦\nhttps://vidorey.web.app\n#MobilePorn #FreeAdultContent #HDPorn #XXX #NSFW",
    "🌍 The world's best free adult content platform is already waiting for you. Open Vidorey now 😍\nhttps://vidorey.web.app\n#FreeXXX #AdultContent #NSFW #FreePorn #Vidorey",
    "🍒 Every XXX category you can think of — all free, all HD, updated every day on Vidorey 🥵\nhttps://vidorey.web.app\n#XXXVideos #FreeAdultContent #NSFW #HardcorePorn #FreePorn",
    "🔓 Your access to unlimited free adult content starts here. No walls. No fees. No account. Vidorey 😈\nhttps://vidorey.web.app\n#FreeXXX #AdultContent #NSFW #NoRegistration #FreePorn",
    "🎁 Free unlimited adult content — consider it a gift. Vidorey has thousands of hot videos ready now 🔥\nhttps://vidorey.web.app\n#FreeGift #FreePorn #AdultVideos #XXX #NSFW",
    "💪 Forget subscriptions, forget paywalls. Vidorey gives you the hottest adult content completely free 🔞\nhttps://vidorey.web.app\n#NoSubscription #FreePorn #FreeXXX #AdultContent #NSFW",
    "🌙 Night mode on, phone out, Vidorey open — your private adult entertainment starts now 😏\nhttps://vidorey.web.app\n#LateNight #FreeXXX #AdultContent #NSFW #PrivatePleasure",
    "🔥 Vidorey drops fresh adult content every single day. Free, HD, instant — no account ever needed 😈\nhttps://vidorey.web.app\n#DailyPorn #FreeAdultContent #HDVideos #XXX #NSFW",
    "💋 Your guilty pleasure is one tap away. Vidorey streams free XXX content 24/7, no strings attached 🥵\nhttps://vidorey.web.app\n#GuiltyPleasure #FreePorn #AdultContent #XXX #NSFW",
    "🌶️ Hot, fresh, free adult videos added every day on Vidorey. No login. No limits. Just pleasure 🔞\nhttps://vidorey.web.app\n#HotVideos #FreeXXX #AdultContent #NSFW #NoLimits",
    "⚡ Stream thousands of free adult videos in HD right now — no sign-up, no buffering on Vidorey 😍\nhttps://vidorey.web.app\n#FastStream #HDPorn #FreeAdultContent #XXX #NSFW",
    "🤤 Adult content this good should cost money. But Vidorey gives it all away for free, every day 😈\nhttps://vidorey.web.app\n#FreeXXX #AdultVideos #NSFW #FreePorn #BestAdultSite",
    "👑 The king of free adult content is Vidorey — updated daily, zero registration, HD quality 🔥\nhttps://vidorey.web.app\n#BestFreePorn #KingOfXXX #AdultContent #NSFW #FreeAdultVideos",
    "🎬 HD adult films, daily updates, zero cost, zero sign-up. Vidorey is simply the best 🔞\nhttps://vidorey.web.app\n#HDPorn #FreePorn #DailyUpdates #XXX #NSFW",
    "💫 Private. Free. Unlimited. Vidorey is the adult platform you've been searching for all along 😏\nhttps://vidorey.web.app\n#PrivatePorn #FreeXXX #UnlimitedContent #NSFW #AdultContent",
  ],
  POST_INTERVAL_MS: 3600000,   // auto-post 1x per jam

  // Auto-comment: aktifkan mode comment ke home timeline (bergantian dengan reply keyword)
  // true  → tiap siklus ganjil = reply keyword, tiap siklus genap = comment home timeline
  // false → hanya mode reply keyword saja
  COMMENT_MODE_ENABLED: true,
  HOME_TIMELINE_COUNT:  20,    // jumlah tweet diambil dari home timeline per siklus

  // Timing
  LOOP_DELAY_MS:        300000,   // delay antar siklus comment (5 menit)
  REPLY_INTERVAL_MS:   3600000,   // reply keyword hanya 1x per jam
  SEARCH_COUNT_PER_KW:  20,
  REQUEST_TIMEOUT_MS:   15000,

  // ─── HASHTAG POOL ─────────────────────────────────────────────────────────
  // Pool hashtag yang dirotasi secara acak di setiap reply/comment/post.
  // Session.js akan pilih subset acak (HASHTAG_PICK_COUNT) dari pool ini
  // dan menempelkannya di akhir teks — supaya tiap kiriman punya kombinasi
  // hashtag yang berbeda dan tidak terlihat copy-paste.
  HASHTAG_POOL: [
    "#anal", "#blowjob", "#deepthroat", "#cumshot", "#creampie",
    "#doggy", "#cowgirl", "#squirt", "#titfuck", "#hardcore",
    "#rough", "#xxx", "#porn", "#nsfw", "#adult",
    "#kinky", "#bdsm", "#fetiche", "#sex", "#sexvideo",
    "#hot", "#dirty", "#naughty", "#xxxvideo", "#pornstar",
    "#threesome", "#orgy", "#gangbang", "#cum", "#dick", "#pussy",
  ],
  HASHTAG_PICK_COUNT: 5,   // hashtag dipilih acak per kiriman REPLY/COMMENT
  HASHTAG_PICK_COUNT_POST: 3, // POST_TEXTS sudah punya hashtag inline — tambah sedikit saja

  // File persist tweet id yang sudah dibalas, supaya tidak dobel reply
  // setelah bot restart.
  REPLIED_STORE_PATH: __dirname + "/.replied-ids.json",
  REPLIED_STORE_MAX:  2000,
};
