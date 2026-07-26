/**
 * lib/platforms/quora/session.js
 * Satu siklus Quora Bot:
 *   1. Pilih keyword acak
 *   2. Search pertanyaan relevan
 *   3. Pilih pertanyaan yang belum dijawab
 *   4. Fetch qid dari halaman pertanyaan
 *   5. Post jawaban promo
 *   6. Tandai sudah dijawab
 *
 * Tidak ada socket/match — polanya sama dengan X/GETTR/Bluesky Bot.
 */

"use strict";

const cfg          = require("./config");
const { log, sleep } = require("../../core/logger");
const { stats, pushEvent } = require("../../core/stats");
const { searchQuestions, getQuestionId, postAnswer } = require("./client");
const answeredStore = require("./replied-store");
const sentLog       = require("./sent-log");

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * @param {{ cookies: string, formkey: string }} ctx
 * @returns {Promise<string>} reason
 */
async function runAnswerSession(ctx) {
  stats.status = "searching";

  const keyword = pick(cfg.SEARCH_KEYWORDS);
  log("BOT", `[Quora] Cari pertanyaan: "${keyword}"`);
  pushEvent("search", `Cari: "${keyword}"`);

  // ── 1. Search ──────────────────────────────────────────────────────────────
  let candidates;
  try {
    candidates = await searchQuestions(ctx.cookies, ctx.formkey, keyword);
  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    log("ERROR", `[Quora] Search gagal: ${err.message}`);
    pushEvent("error", `Search gagal: ${err.message}`);
    return "search-error";
  }

  log("INFO", `[Quora] ${candidates.length} pertanyaan ditemukan untuk "${keyword}"`);

  // ── 2. Pilih yang belum dijawab ────────────────────────────────────────────
  const target = candidates.find((q) => !answeredStore.has(q.slug));

  if (!target) {
    stats.totalNoMatch++;
    log("INFO", `[Quora] Semua pertanyaan untuk "${keyword}" sudah dijawab`);
    pushEvent("search", `Semua pertanyaan sudah dijawab untuk "${keyword}"`);
    return "no-target";
  }

  log("INFO", `[Quora] Target: ${target.url}`);
  stats.status = "matched";
  stats.totalMatches++;
  stats.lastMatchAt = Date.now();
  pushEvent("match", `Target: ${target.title.slice(0, 80)}`);

  // ── 3. Fetch qid ───────────────────────────────────────────────────────────
  let qid = target.qid;
  if (!qid) {
    try {
      qid = await getQuestionId(ctx.cookies, target.url);
    } catch (err) {
      log("WARN", `[Quora] Gagal ambil qid dari ${target.url}: ${err.message}`);
    }
  }

  if (!qid) {
    // Tandai tetap agar tidak dicoba lagi (mungkin pertanyaan dihapus/private)
    answeredStore.add(target.slug);
    log("WARN", `[Quora] qid tidak ditemukan untuk "${target.slug}" — skip`);
    pushEvent("warn", `qid tidak ditemukan: ${target.slug}`);
    return "no-qid";
  }

  log("INFO", `[Quora] qid=${qid} untuk "${target.slug}"`);

  // ── 4. Post jawaban ────────────────────────────────────────────────────────
  const answerText = pick(cfg.ANSWER_TEXTS);
  log("BOT", `[Quora] → Posting jawaban (${answerText.length} char)...`);

  try {
    await sleep(2000); // Delay kecil agar tidak terlalu agresif

    const result = await postAnswer(ctx.cookies, ctx.formkey, qid, answerText);
    answeredStore.add(target.slug);

    const answerUrl = result.aid
      ? `${cfg.BASE_URL}/answer/${result.aid}`
      : null;

    stats.totalReplies++;
    stats.totalMsgSent++;
    stats.lastReplyAt = Date.now();

    sentLog.addEntry({
      questionUrl:   target.url,
      questionTitle: target.title,
      answerUrl,
    });

    log("SUCCESS", `[Quora] Jawaban terkirim${result.aid ? ` → aid=${result.aid}` : " (aid unknown)"}`);
    pushEvent("reply", `[Quora] → ${target.title.slice(0, 60)}`);
    return "answer-sent";

  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt  = Date.now();
    stats.lastErrorMsg = err.message;
    log("ERROR", `[Quora] Gagal posting jawaban: ${err.message}`);
    pushEvent("error", `Jawaban gagal: ${err.message}`);
    return "answer-error";
  }
}

module.exports = { runAnswerSession };
