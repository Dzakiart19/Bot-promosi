/**
 * lib/platforms/xnxx/replied-store.js
 * Persist daftar video_id XNXX yang sudah dikomentari ke disk,
 * supaya restart bot tidak menyebabkan komentar dobel.
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

function has(videoId) {
  return load().has(String(videoId));
}

function add(videoId) {
  const set = load();
  set.add(String(videoId));
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
