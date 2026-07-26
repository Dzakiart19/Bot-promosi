/**
 * lib/platforms/bluesky/replied-store.js
 * Persist daftar URI post Bluesky yang sudah di-reply ke disk,
 * supaya restart bot tidak menyebabkan reply dobel ke post yang sama.
 * Key: AT URI  (at://did:plc:xxx/app.bsky.feed.post/xxx)
 */

"use strict";

const fs  = require("fs");
const cfg = require("./config");

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(cfg.REPLIED_STORE_PATH, "utf8");
    cache = new Set(JSON.parse(raw));
  } catch {
    cache = new Set();
  }
  return cache;
}

function has(uri) {
  return load().has(uri);
}

function add(uri) {
  const set = load();
  set.add(uri);
  if (set.size > cfg.REPLIED_STORE_MAX) {
    const arr = Array.from(set);
    cache = new Set(arr.slice(arr.length - cfg.REPLIED_STORE_MAX));
  }
  try {
    fs.writeFileSync(cfg.REPLIED_STORE_PATH, JSON.stringify(Array.from(cache)));
  } catch {
    // Gagal simpan tidak boleh menghentikan bot
  }
}

module.exports = { has, add };
