/**
 * lib/core/country-filter.js
 * Blocklist negara partner — dipakai semua platform yang protokolnya
 * mengekspos info negara partner (lihat catatan per-platform di bawah).
 *
 * Cara pakai: `isBlockedCountry(value)` menerima ISO-2 code ("IN") ATAU
 * nama negara ("India") dan mengembalikan true/false, case-insensitive.
 *
 * Status ketersediaan data negara partner per platform (hasil recon):
 *   - OpenTalk : peerCountry (ISO-2) tersedia di event "matched"      → didukung
 *   - Chatib   : field country/country_code (ISO-2) ada di daftar     → didukung
 *                user online (existing_users/new_user)
 *   - Yapping  : match_found tidak membawa info negara partner        → TIDAK didukung
 *   - SillyChat: event "matched" tidak membawa info negara partner    → TIDAK didukung
 *   - DuckChat : chat_found/profiles tidak membawa info negara        → TIDAK didukung
 *
 * Untuk 3 platform terakhir, filter negara tidak bisa diterapkan sampai
 * ditemukan sumber data negara partner di protokol mereka (butuh recon ulang
 * kalau platform tsb mengubah/menambah field baru).
 */

"use strict";

// Negara yang di-blok — key = ISO-2 code, value = nama untuk logging.
// Kosong = full access, semua negara partner diterima (tidak ada yang di-skip).
const BLOCKED_COUNTRIES = {};

// Reverse lookup nama → code, untuk kasus platform kirim nama penuh alih-alih ISO-2.
const NAME_TO_CODE = Object.fromEntries(
  Object.entries(BLOCKED_COUNTRIES).map(([code, name]) => [name.toLowerCase(), code])
);

// Negara prioritas — TIDAK mengubah keputusan skip/lanjut sesi (server tidak
// bisa diminta match negara tertentu), hanya ditandai khusus di log & dashboard
// supaya match dari negara-negara ini gampang dipantau.
const PRIORITY_COUNTRIES = {
  US: "Amerika Serikat",
  CA: "Kanada",
  GB: "Inggris",
  AU: "Australia",
  SG: "Singapura",
  SA: "Arab Saudi",
  SE: "Swedia",
  FI: "Finlandia",
  CH: "Swiss",
  DE: "Jerman",
  FR: "Prancis",
  NL: "Belanda",
  BE: "Belgia",
  AT: "Austria",
  JP: "Jepang",
  AE: "Uni Emirat Arab",
  QA: "Qatar",
  NZ: "Selandia Baru",
  DK: "Denmark",
  LU: "Luksemburg",
};

const PRIORITY_NAME_TO_CODE = Object.fromEntries(
  Object.entries(PRIORITY_COUNTRIES).map(([code, name]) => [name.toLowerCase(), code])
);

/**
 * Cek apakah suatu nilai negara (ISO-2 code atau nama) ada di daftar prioritas.
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
function isPriorityCountry(value) {
  if (!value || typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  if (v.length === 2 && PRIORITY_COUNTRIES[v.toUpperCase()]) return true;
  if (PRIORITY_NAME_TO_CODE[v]) return true;
  return false;
}

/**
 * Cek apakah suatu nilai negara (ISO-2 code atau nama) ada di blocklist.
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
function isBlockedCountry(value) {
  if (!value || typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  if (v.length === 2 && BLOCKED_COUNTRIES[v.toUpperCase()]) return true;
  if (NAME_TO_CODE[v]) return true;
  return false;
}

/** Nama negara untuk logging (fallback ke value asli kalau tidak dikenal). */
function countryLabel(value) {
  if (!value) return "?";
  const v = value.trim();
  if (v.length === 2 && BLOCKED_COUNTRIES[v.toUpperCase()]) return `${BLOCKED_COUNTRIES[v.toUpperCase()]} (${v.toUpperCase()})`;
  return v;
}

/** Nama negara prioritas untuk logging (fallback ke value asli kalau tidak dikenal). */
function priorityLabel(value) {
  if (!value) return "?";
  const v = value.trim();
  if (v.length === 2 && PRIORITY_COUNTRIES[v.toUpperCase()]) return `${PRIORITY_COUNTRIES[v.toUpperCase()]} (${v.toUpperCase()})`;
  return v;
}

module.exports = {
  BLOCKED_COUNTRIES,
  isBlockedCountry,
  countryLabel,
  PRIORITY_COUNTRIES,
  isPriorityCountry,
  priorityLabel,
};
