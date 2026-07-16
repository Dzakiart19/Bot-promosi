/**
 * lib/core/logger.js
 * Shared colored console logger + sleep utility.
 */

"use strict";

const C = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  cyan:    "\x1b[36m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  red:     "\x1b[31m",
  magenta: "\x1b[35m",
  blue:    "\x1b[34m",
};

const TAG_COLOR = {
  INFO:    C.cyan,
  SUCCESS: C.green,
  WARN:    C.yellow,
  ERROR:   C.red,
  MSG:     C.magenta,
  BOT:     C.blue,
};

function log(tag, msg, extra = "") {
  const ts    = new Date().toISOString().slice(11, 23);
  const color = TAG_COLOR[tag] || "";
  const ext   = extra ? ` ${C.yellow}${extra}${C.reset}` : "";
  console.log(`${color}[${ts}] [${tag}]${C.reset} ${msg}${ext}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { log, sleep, C };
