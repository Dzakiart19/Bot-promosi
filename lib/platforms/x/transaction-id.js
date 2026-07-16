/**
 * lib/platforms/x/transaction-id.js
 * X (Twitter) sekarang mewajibkan header "x-client-transaction-id" di semua
 * endpoint GraphQL — anti-bot measure. Tanpa header ini, endpoint kembali
 * HTTP 404 (bukan 401/403) meski cookie/auth valid, karena diblokir di edge
 * (Cloudflare) sebelum sampai ke backend.
 *
 * Pakai lib "x-client-transaction-id" (implementasi ulang algoritma resmi
 * X berbasis animasi SVG + indexing byte dari halaman). Lib ini butuh
 * ArrayBuffer.prototype.transfer, API yang baru stabil di Node 22+; Node 20
 * (versi di environment ini) belum punya, jadi kita polyfill manual dulu.
 */

"use strict";

if (typeof ArrayBuffer.prototype.transfer !== "function") {
  ArrayBuffer.prototype.transfer = function transfer(newByteLength) {
    const len = newByteLength === undefined ? this.byteLength : newByteLength;
    const dst = new ArrayBuffer(len);
    new Uint8Array(dst).set(new Uint8Array(this).subarray(0, Math.min(len, this.byteLength)));
    return dst;
  };
}

const { ClientTransaction, handleXMigration } = require("x-client-transaction-id");

let cachedTransaction = null;
let cachedAt = 0;
const TTL_MS = 30 * 60 * 1000; // regenerate tiap 30 menit (halaman/anim key bisa berubah)

async function getTransaction() {
  if (cachedTransaction && Date.now() - cachedAt < TTL_MS) return cachedTransaction;
  const doc = await handleXMigration();
  cachedTransaction = await ClientTransaction.create(doc);
  cachedAt = Date.now();
  return cachedTransaction;
}

/** Generate header x-client-transaction-id untuk satu request (method + path, tanpa query string). */
async function generateTransactionId(method, path) {
  const ct = await getTransaction();
  return ct.generateTransactionId(method, path);
}

module.exports = { generateTransactionId };
