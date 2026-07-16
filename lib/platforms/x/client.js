/**
 * lib/platforms/x/client.js
 * HTTP client tipis untuk GraphQL X (Twitter) — pakai cookie session asli
 * (auth_token + ct0) dari X_COOKIES, bukan guest token, karena posting
 * reply butuh akun login.
 */

"use strict";

const cfg = require("./config");
const { log } = require("../../core/logger");
const { generateTransactionId } = require("./transaction-id");

let cachedQueryIds = null;

/** Parse "auth_token=xxx; ct0=yyy" (atau urutan lain, spasi bebas) jadi object. */
function parseCookieString(raw) {
  const out = {};
  String(raw || "")
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const idx = pair.indexOf("=");
      if (idx === -1) return;
      out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    });
  return out;
}

function getCookies() {
  const raw = process.env.X_COOKIES;
  if (!raw) throw new Error("X_COOKIES belum diset (butuh 'auth_token=...; ct0=...')");
  const cookies = parseCookieString(raw);
  if (!cookies.auth_token || !cookies.ct0) {
    throw new Error("X_COOKIES harus berisi auth_token dan ct0");
  }
  return cookies;
}

/**
 * Header dasar untuk request GraphQL X. `method`+`path` (tanpa query string)
 * WAJIB diisi supaya x-client-transaction-id ikut dihitung — tanpa header
 * ini X membalas 404 di edge (Cloudflare) meski cookie valid.
 */
async function baseHeaders(cookies, method, path) {
  const txId = await generateTransactionId(method, path);
  return {
    "Authorization":          `Bearer ${cfg.BEARER}`,
    "Cookie":                 `auth_token=${cookies.auth_token}; ct0=${cookies.ct0}`,
    "x-csrf-token":           cookies.ct0,
    "x-twitter-active-user":  "yes",
    "x-twitter-auth-type":    "OAuth2Session",
    "x-twitter-client-language": "en",
    "x-client-transaction-id": txId,
    "User-Agent":             cfg.USER_AGENT,
    "Origin":                 cfg.ORIGIN,
    "Referer":                cfg.REFERER,
  };
}

async function fetchWithTimeout(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cari queryId GraphQL terbaru dari main.js bundle x.com (nama operasi
 * berubah query-id-nya tiap X rilis update). Fallback ke config kalau gagal.
 *
 * PENTING: request ke MAIN_JS_DISCOVERY_URL ("/home") WAJIB bawa cookie
 * login. Tanpa cookie, X mengirim bundle "entry-client-logged-out" yang
 * sama sekali tidak berisi queryId GraphQL (beda struktur dari bundle
 * "main.<hash>.js" versi logged-in).
 */
async function discoverQueryIds(cookies) {
  if (cachedQueryIds) return cachedQueryIds;
  try {
    const homeRes = await fetchWithTimeout(cfg.MAIN_JS_DISCOVERY_URL, {
      headers: {
        "User-Agent": cfg.USER_AGENT,
        "Cookie": `auth_token=${cookies.auth_token}; ct0=${cookies.ct0}`,
      },
    });
    const html = await homeRes.text();
    const jsMatch = html.match(/src="(https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/main\.[^"]+\.js)"/);
    if (!jsMatch) throw new Error("main.js tidak ditemukan di /home (cek cookie login)");

    const jsRes = await fetchWithTimeout(jsMatch[1], { headers: { "User-Agent": cfg.USER_AGENT } });
    const js = await jsRes.text();

    const found = {};
    for (const op of Object.keys(cfg.QUERY_ID_FALLBACK)) {
      // Format di bundle: queryId:"xxx",operationName:"yyy"
      // Atau (versi lain): operationName:"yyy",queryId:"xxx"
      const re1 = new RegExp(`queryId:"([^"]+)",operationName:"${op}"`);
      const re2 = new RegExp(`operationName:"${op}",queryId:"([^"]+)"`);
      const m = js.match(re1) || js.match(re2);
      found[op] = m ? m[1] : cfg.QUERY_ID_FALLBACK[op];
    }
    cachedQueryIds = found;
    log("INFO", `queryId discovered: ${JSON.stringify(found)}`);
  } catch (err) {
    log("WARN", `Gagal discover queryId terbaru (${err.message}), pakai fallback.`);
    cachedQueryIds = { ...cfg.QUERY_ID_FALLBACK };
  }
  return cachedQueryIds;
}

/**
 * Verifikasi cookie masih valid.
 * Endpoint REST lama (account/settings.json, verify_credentials.json) sudah
 * dihapus X (selalu 404 walau cookie valid) — verifikasi sekarang dilakukan
 * dengan hit halaman "/home" berbekal cookie: kalau X masih mengembalikan
 * bundle logged-in (main.<hash>.js), berarti sesi valid.
 */
async function verifyLogin(cookies) {
  const res = await fetchWithTimeout("https://x.com/home", {
    headers: {
      "User-Agent": cfg.USER_AGENT,
      "Cookie": `auth_token=${cookies.auth_token}; ct0=${cookies.ct0}`,
    },
  });
  if (!res.ok) throw new Error(`Cookie X tidak valid / expired (HTTP ${res.status})`);
  const html = await res.text();
  const isLoggedIn = /client-web\/main\.[^"]+\.js/.test(html);
  if (!isLoggedIn) {
    throw new Error("Cookie X tidak valid / expired (redirect ke halaman login)");
  }
  const twidMatch = html.match(/"userId":"(\d+)"/) || html.match(/twid=u%3D(\d+)/);
  return { screenName: null, userId: twidMatch ? twidMatch[1] : "" };
}

const SEARCH_FEATURES = {
  rweb_video_screen_enabled: false,
  payments_enabled: false,
  rweb_xchat_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: false,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  responsive_web_grok_show_grok_translated_post: false,
  responsive_web_grok_analysis_button_from_backend: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

const CREATE_TWEET_FEATURES = {
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: false,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  articles_preview_enabled: true,
  rweb_video_timestamps_enabled: true,
  rweb_video_screen_enabled: false,
  payments_enabled: false,
  rweb_xchat_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
};

/** Cari tweet berdasarkan keyword, kembalikan list {id, text, userId}. */
async function searchTweets(cookies, keyword) {
  const queryIds = await discoverQueryIds(cookies);
  const variables = {
    rawQuery: keyword,
    count:    cfg.SEARCH_COUNT_PER_KW,
    querySource: "typed_query",
    product: "Latest",
  };
  const path = `/i/api/graphql/${queryIds.SearchTimeline}/SearchTimeline`;
  const url = `https://x.com${path}` +
    `?variables=${encodeURIComponent(JSON.stringify(variables))}` +
    `&features=${encodeURIComponent(JSON.stringify(SEARCH_FEATURES))}`;

  const res = await fetchWithTimeout(url, { headers: await baseHeaders(cookies, "GET", path) });
  const bodyText = await res.text();
  if (!res.ok) throw new Error(`SearchTimeline HTTP ${res.status}: ${bodyText.slice(0, 200)}`);

  let data;
  try { data = JSON.parse(bodyText); } catch { throw new Error("SearchTimeline: respons bukan JSON valid"); }

  const results = [];
  const instructions =
    data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions || [];
  for (const instr of instructions) {
    for (const entry of instr.entries || []) {
      const tweetResult = entry?.content?.itemContent?.tweet_results?.result;
      if (!tweetResult || tweetResult.__typename !== "Tweet") continue;
      const id      = tweetResult.rest_id;
      const text    = tweetResult.legacy?.full_text;
      const userId  = tweetResult.legacy?.user_id_str;
      const isReply = !!tweetResult.legacy?.in_reply_to_status_id_str;
      if (id && text) results.push({ id, text, userId, isReply });
    }
  }
  return results;
}

/** Post reply ke tweetId. */
async function postReply(cookies, tweetId, text) {
  const queryIds = await discoverQueryIds(cookies);
  const path = `/i/api/graphql/${queryIds.CreateTweet}/CreateTweet`;
  const url = `https://x.com${path}`;
  const body = {
    variables: {
      tweet_text: text,
      reply: { in_reply_to_tweet_id: tweetId, exclude_reply_user_ids: [] },
      dark_request: false,
      media: { media_entities: [], possibly_sensitive: false },
      semantic_annotation_ids: [],
      disallowed_reply_options: null,
    },
    features: CREATE_TWEET_FEATURES,
    queryId: queryIds.CreateTweet,
  };

  const headers = await baseHeaders(cookies, "POST", path);
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const bodyText = await res.text();
  if (!res.ok) throw new Error(`CreateTweet HTTP ${res.status}: ${bodyText.slice(0, 300)}`);

  let data;
  try { data = JSON.parse(bodyText); } catch { throw new Error("CreateTweet: respons bukan JSON valid"); }
  if (data.errors && data.errors.length) {
    throw new Error(`CreateTweet API error: ${data.errors.map((e) => e.message).join("; ")}`);
  }
  const newId = data?.data?.create_tweet?.tweet_results?.result?.rest_id;
  return { id: newId || null, raw: data };
}

const HOME_TIMELINE_FEATURES = {
  rweb_video_screen_enabled: false,
  payments_enabled: false,
  rweb_xchat_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

/**
 * Ambil tweet kandidat untuk di-comment.
 *
 * Awalnya menggunakan HomeTimeline/HomeLatestTimeline GraphQL, tapi X kini
 * memuat queryId kedua operasi tersebut via lazy-loaded JS chunk yang tidak
 * bisa di-extract tanpa menjalankan browser penuh (tidak ada di main.js maupun
 * chunk statis lainnya). Selalu mengembalikan {"message":"Query not found"}.
 *
 * Solusi: pakai SearchTimeline (queryId stabil, sudah terbukti berfungsi)
 * dengan COMMENT_KEYWORDS — keyword umum/adult yang menghasilkan tweet publik
 * berpotensial impresi tinggi, berbeda dari KEYWORDS yang dipakai mode reply.
 * Hanya tweet root (bukan reply) yang dikembalikan supaya comment terlihat.
 */
async function fetchHomeTimeline(cookies) {
  const keyword = cfg.COMMENT_KEYWORDS[
    Math.floor(Math.random() * cfg.COMMENT_KEYWORDS.length)
  ];

  log("INFO", `[COMMENT] Cari tweet untuk dikomentari: "${keyword}"`);

  const results = await searchTweets(cookies, keyword);

  // Filter: hanya tweet root (bukan reply ke tweet lain)
  const roots = results.filter((t) => !t.isReply);
  log("INFO", `[COMMENT] ${roots.length} tweet root ditemukan dari ${results.length} hasil`);
  return roots;
}

/**
 * Buat tweet baru tanpa reply — standalone post biasa.
 * Digunakan untuk mode auto-post 1 jam sekali.
 */
async function postTweet(cookies, text) {
  const queryIds = await discoverQueryIds(cookies);
  const path = `/i/api/graphql/${queryIds.CreateTweet}/CreateTweet`;
  const url  = `https://x.com${path}`;
  const body = {
    variables: {
      tweet_text:              text,
      dark_request:            false,
      media:                   { media_entities: [], possibly_sensitive: false },
      semantic_annotation_ids: [],
      disallowed_reply_options: null,
    },
    features: CREATE_TWEET_FEATURES,
    queryId:  queryIds.CreateTweet,
  };

  const headers = await baseHeaders(cookies, "POST", path);
  const res = await fetchWithTimeout(url, {
    method:  "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const bodyText = await res.text();
  if (!res.ok) throw new Error(`PostTweet HTTP ${res.status}: ${bodyText.slice(0, 300)}`);

  let data;
  try { data = JSON.parse(bodyText); } catch { throw new Error("PostTweet: respons bukan JSON valid"); }
  if (data.errors && data.errors.length) {
    throw new Error(`PostTweet API error: ${data.errors.map((e) => e.message).join("; ")}`);
  }
  const newId = data?.data?.create_tweet?.tweet_results?.result?.rest_id;
  return { id: newId || null, raw: data };
}

module.exports = {
  getCookies,
  verifyLogin,
  searchTweets,
  postReply,
  postTweet,
  fetchHomeTimeline,
  discoverQueryIds,
};
