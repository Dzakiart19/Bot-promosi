/**
 * scripts/capture-threads-docids.js
 * Menggunakan Playwright (headless Chromium) untuk menangkap doc_ids Threads
 * yang hanya tersedia di lazy-loaded JS chunks saat navigasi terjadi di browser.
 *
 * Usage: node scripts/capture-threads-docids.js
 *
 * Membutuhkan: THREADS_COOKIES environment variable
 */

"use strict";

const { chromium } = require("playwright");

const TARGET_OPS = ["CreatePost", "CreateReply", "SearchThreads"];

// Regex untuk menangkap doc_id dari request body GraphQL
const DOC_ID_RE = /doc_id=(\d{10,22})/;
// Regex untuk menangkap operasi dari variabel GraphQL
const OP_VARS_RE = /variables=([^&]+)/;

async function captureDocIds() {
  const cookies = process.env.THREADS_COOKIES;
  if (!cookies) throw new Error("THREADS_COOKIES tidak diset");

  // Parse cookies ke format Playwright
  const parsedCookies = cookies.split(";").map(pair => {
    const [name, ...rest] = pair.trim().split("=");
    return {
      name: name.trim(),
      value: rest.join("=").trim(),
      domain: ".threads.com",
      path: "/",
      secure: true,
      sameSite: "Lax",
    };
  }).filter(c => c.name && c.value);

  console.log("[PW] Launching Chromium headless...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    locale: "en-US",
    timezoneId: "America/New_York",
    viewport: { width: 1280, height: 800 },
  });

  // Set cookies
  await context.addCookies(parsedCookies);

  const captured = {};
  const postMediaIds = []; // Kumpulkan media IDs dari feed untuk test reply

  // Intercept semua request ke /api/graphql
  await context.route("**/api/graphql**", async (route, request) => {
    const body = request.postData() || "";
    const docIdMatch = body.match(DOC_ID_RE);
    if (!docIdMatch) return route.continue();

    const docId = docIdMatch[1];
    const varsMatch = body.match(OP_VARS_RE);
    let vars = {};
    try { vars = JSON.parse(decodeURIComponent(varsMatch?.[1] || "{}")); } catch {}

    // Identifikasi operasi berdasarkan variabel
    let opName = null;
    if (vars.text !== undefined && vars.media_type === "TEXT" && !vars.parent_post_id) {
      opName = "CreatePost";
    } else if (vars.text !== undefined && (vars.parent_post_id || vars.replied_to_post_id)) {
      opName = "CreateReply";
    } else if (vars.query !== undefined) {
      opName = "SearchThreads";
    }

    if (opName && !captured[opName]) {
      captured[opName] = docId;
      console.log(`[PW] ✓ Captured ${opName}: ${docId}`);
    } else if (!opName) {
      // Log all doc_ids for debugging
      console.log(`[PW] GraphQL doc_id ${docId} (vars keys: ${Object.keys(vars).join(",")})`);
    }

    return route.continue();
  });

  const page = await context.newPage();

  try {
    console.log("[PW] Navigating to threads.com...");
    await page.goto("https://www.threads.com/", { waitUntil: "networkidle", timeout: 30000 });
    console.log("[PW] Home page loaded");

    // 1. Trigger SEARCH — navigasi ke search page dengan keyword
    console.log("[PW] Navigating to search...");
    await page.goto("https://www.threads.com/search?q=travel&serp_type=default", {
      waitUntil: "networkidle", timeout: 30000,
    });
    console.log("[PW] Search page loaded");

    // Tunggu sebentar agar lazy chunks dan GraphQL requests selesai
    await page.waitForTimeout(5000);

    if (!captured.SearchThreads) {
      // Coba klik search input dan ketik ulang
      try {
        const searchInput = await page.$('input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i]');
        if (searchInput) {
          await searchInput.triple_click();
          await searchInput.type("travel");
          await page.keyboard.press("Enter");
          await page.waitForTimeout(5000);
        }
      } catch (e) {
        console.log("[PW] Search input click failed:", e.message);
      }
    }

    // 2. Trigger COMPOSE — klik tombol compose atau navigasi ke compose
    console.log("[PW] Attempting compose...");
    try {
      // Cari tombol compose / new post
      const composeBtn = await page.$('[aria-label*="compose" i], [aria-label*="new thread" i], [aria-label*="create" i], button:has-text("New thread"), a[href*="compose"]');
      if (composeBtn) {
        await composeBtn.click();
        await page.waitForTimeout(3000);
        console.log("[PW] Compose dialog opened");

        // Ketik teks di composer
        const textArea = await page.$('[contenteditable="true"], textarea');
        if (textArea) {
          await textArea.click();
          await textArea.type("test post from bot");
          await page.waitForTimeout(2000);
          // JANGAN submit — kita hanya perlu memicu load chunk, bukan benar-benar posting
        }
      } else {
        // Coba via keyboard shortcut atau URL
        await page.goto("https://www.threads.com/?intentType=create_thread", {
          waitUntil: "networkidle", timeout: 20000,
        });
        await page.waitForTimeout(5000);
      }
    } catch (e) {
      console.log("[PW] Compose trigger failed:", e.message);
    }

    // 3. Tunggu semua doc_ids tertangkap
    if (Object.keys(captured).length < TARGET_OPS.length) {
      console.log("[PW] Waiting for more doc_ids...");
      await page.waitForTimeout(5000);
    }

    // 4. Coba dapat CreatePost doc_id dengan BENAR-BENAR submit post test
    // (hanya jika belum tertangkap dan user set THREADS_TEST_POST=true)
    if (!captured.CreatePost && process.env.THREADS_TEST_POST === "true") {
      console.log("[PW] Attempting actual test post to capture CreatePost doc_id...");
      try {
        await page.goto("https://www.threads.com/", { waitUntil: "networkidle", timeout: 20000 });
        const composeBtn = await page.$('[aria-label*="compose" i], [aria-label*="new thread" i]');
        if (composeBtn) {
          await composeBtn.click();
          await page.waitForTimeout(2000);
          const textArea = await page.$('[contenteditable="true"], textarea');
          if (textArea) {
            await textArea.type("test - akan dihapus");
            await page.waitForTimeout(1000);
            // Cari tombol Post/Submit
            const postBtn = await page.$('button:has-text("Post"), button[type="submit"]');
            if (postBtn) {
              await postBtn.click();
              await page.waitForTimeout(5000);
            }
          }
        }
      } catch(e) {
        console.log("[PW] Test post failed:", e.message);
      }
    }

  } catch (err) {
    console.error("[PW] Error:", err.message);
  } finally {
    await browser.close();
  }

  return captured;
}

async function main() {
  console.log("=".repeat(60));
  console.log("  Threads doc_id Capture (Playwright)");
  console.log("=".repeat(60));

  try {
    const docIds = await captureDocIds();

    console.log("\n" + "=".repeat(60));
    console.log("  HASIL:");
    console.log("=".repeat(60));

    if (Object.keys(docIds).length === 0) {
      console.log("❌ Tidak ada doc_id yang berhasil ditangkap.");
      console.log("\nPenyebab: GraphQL requests mungkin tidak terpicu karena:");
      console.log("  1. Halaman sudah cache hasil dari server");
      console.log("  2. Compose button tidak ditemukan");
      console.log("  3. Session expired");
      console.log("\nAlternatif manual:");
      console.log("  Buka threads.com → DevTools → Network → Filter 'graphql'");
      console.log("  Buat post/search → cari 'doc_id' di Request Payload");
      console.log("  Lalu set: THREADS_DOC_CREATEPOST=<id> THREADS_DOC_SEARCH=<id>");
    } else {
      for (const [op, id] of Object.entries(docIds)) {
        console.log(`  ${op}: ${id}`);
      }
      console.log("\n✓ Salin ke config.js atau set sebagai env var:");
      if (docIds.CreatePost) console.log(`  THREADS_DOC_CREATEPOST=${docIds.CreatePost}`);
      if (docIds.CreateReply) console.log(`  THREADS_DOC_CREATEREPLY=${docIds.CreateReply}`);
      if (docIds.SearchThreads) console.log(`  THREADS_DOC_SEARCH=${docIds.SearchThreads}`);
    }

    return docIds;
  } catch (err) {
    console.error("FATAL:", err.message);
    process.exit(1);
  }
}

main();
