/**
 * lib/platforms/x/replied-store.js
 * Persist daftar tweet id yang sudah dibalas ke disk, supaya restart bot
 * tidak menyebabkan reply dobel ke tweet yang sama.
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

function has(tweetId) {
  return load().has(tweetId);
}

function add(tweetId) {
  const set = load();
  set.add(tweetId);
  // Batasi ukuran — buang entri terlama kalau kelewat besar.
  if (set.size > cfg.REPLIED_STORE_MAX) {
    const arr = Array.from(set);
    cache = new Set(arr.slice(arr.length - cfg.REPLIED_STORE_MAX));
  }
  try {
    fs.writeFileSync(cfg.REPLIED_STORE_PATH, JSON.stringify(Array.from(cache)));
  } catch (err) {
    // Gagal simpan ke disk tidak boleh menghentikan bot — cukup log di caller.
  }
}

module.exports = { has, add };
