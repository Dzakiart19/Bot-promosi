/**
 * lib/platforms/duckchat/index.js
 * Entry point platform DuckChat — re-export semua yang dibutuhkan main loop.
 */

"use strict";

const config            = require("./config");
const { createGuest }   = require("./guest");
const { runSession }    = require("./session");

module.exports = { config, createGuest, runSession };
