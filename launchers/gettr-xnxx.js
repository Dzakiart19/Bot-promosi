const { spawn } = require("child_process");

const BOTS = [
  { name: "GETTR Bot", script: "bot/gettr-bot.js", port: 3008 },
  { name: "XNXX Bot",  script: "bot/xnxx-bot.js",  port: 3013 },
];

function startBot({ name, script, port }) {
  console.log(`[launcher] Memulai ${name} di port ${port}...`);

  const env  = { ...process.env, PORT: String(port) };
  const proc = spawn(process.execPath, [script], {
    env,
    stdio: "inherit",
    cwd:   process.cwd(),
  });

  proc.on("error", (err) => {
    console.error(`[launcher] ${name} spawn error: ${err.message}`);
  });

  proc.on("exit", (code, signal) => {
    if (signal === "SIGTERM" || signal === "SIGINT") {
      console.log(`[launcher] ${name} dihentikan (${signal})`);
      return;
    }
    console.warn(`[launcher] ${name} keluar (code=${code}) — restart dalam 5 detik...`);
    setTimeout(() => startBot({ name, script, port }), 5_000);
  });

  return proc;
}

const procs = BOTS.map(startBot);

function shutdown(signal) {
  console.log(`\n[launcher] Terima ${signal} — menghentikan semua bot...`);
  for (const p of procs) {
    try { p.kill("SIGTERM"); } catch { /* sudah keluar */ }
  }
  setTimeout(() => process.exit(0), 3_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

console.log(`[launcher] GETTR Bot (3008) + XNXX Bot (3013) aktif.`);
