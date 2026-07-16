/**
 * lib/platforms/telegram/index.js
 * Entry point platform Telegram — re-export semua yang dibutuhkan main loop.
 */

"use strict";

const config                                 = require("./config");
const { runSession, createMessageListener }  = require("./session");

module.exports = { config, runSession, createMessageListener };
