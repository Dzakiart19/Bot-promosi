/**
 * lib/platforms/quora/replied-store.js
 * Persist daftar slug/URL pertanyaan Quora yang sudah dijawab,
 * supaya restart bot tidak menyebabkan duplikasi jawaban.
 */

"use strict";

const fs  = require("fs");
const cfg = require("./config");

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = new Set(JSON.parse(fs.readFileSync(cfg.ANSWERED_STORE_PATH, "utf8")));
  } catch {
    cache = new Set();
  }
  return cache;
}

function has(key)  { return load().has(key); }

function add(key) {
  const set = load();
  set.add(key);
  if (set.size > cfg.ANSWERED_STORE_MAX) {
    const arr = Array.from(set);
    cache = new Set(arr.slice(arr.length - cfg.ANSWERED_STORE_MAX));
  }
  try {
    fs.writeFileSync(cfg.ANSWERED_STORE_PATH, JSON.stringify(Array.from(cache)));
  } catch {}
}

module.exports = { has, add };
