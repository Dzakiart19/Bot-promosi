/**
 * lib/platforms/facebook/replied-store.js
 * Persist set post ID yang sudah dikomentari ke disk,
 * supaya tidak dobel comment setelah bot restart.
 * Pola identik dengan X bot / GETTR bot.
 */

"use strict";

const fs  = require("fs");
const cfg = require("./config");

let _store = null;

function load() {
  if (_store) return;
  try {
    const raw = fs.readFileSync(cfg.REPLIED_STORE_PATH, "utf8");
    _store = new Set(JSON.parse(raw));
  } catch {
    _store = new Set();
  }
}

function save() {
  const arr = [..._store].slice(-cfg.REPLIED_STORE_MAX);
  _store = new Set(arr);
  fs.writeFileSync(cfg.REPLIED_STORE_PATH, JSON.stringify(arr), "utf8");
}

function has(id) {
  load();
  return _store.has(String(id));
}

function add(id) {
  load();
  _store.add(String(id));
  save();
}

module.exports = { has, add };
