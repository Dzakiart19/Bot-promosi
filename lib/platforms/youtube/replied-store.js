/**
 * lib/platforms/youtube/replied-store.js
 * Persist daftar video ID yang sudah dikomentari ke disk,
 * supaya restart bot tidak menyebabkan komentar dobel ke video yang sama.
 */

"use strict";

const fs  = require("fs");
const cfg = require("./config");

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(cfg.COMMENTED_STORE_PATH, "utf8");
    cache = new Set(JSON.parse(raw));
  } catch {
    cache = new Set();
  }
  return cache;
}

function has(videoId) {
  return load().has(videoId);
}

function add(videoId) {
  const set = load();
  set.add(videoId);
  // Batasi ukuran — buang entri terlama kalau kelewat besar.
  if (set.size > cfg.COMMENTED_STORE_MAX) {
    const arr = Array.from(set);
    cache = new Set(arr.slice(arr.length - cfg.COMMENTED_STORE_MAX));
  }
  try {
    fs.writeFileSync(cfg.COMMENTED_STORE_PATH, JSON.stringify(Array.from(cache)));
  } catch {
    // Gagal simpan ke disk tidak boleh menghentikan bot
  }
}

module.exports = { has, add };
