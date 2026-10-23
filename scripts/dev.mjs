import { spawn } from "node:child_process";
import dotenv from "dotenv";

dotenv.config();

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("npm run dev 経由で起動してください。");
  process.exit(1);
}

const children = [];
let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;

  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
  }
}

function start(command, args, label) {
  const child = spawn(command, args, { stdio: "inherit" });
  children.push(child);

  child.on("error", (error) => {
    console.error(`${label} の起動に失敗しました: ${error.message}`);
    shutdown(1);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const exitCode = code ?? (signal ? 1 : 0);
    if (exitCode !== 0) {
      console.error(`${label} が終了しました (code: ${exitCode})`);
    }
    shutdown(exitCode);
  });

  return child;
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

start(process.execPath, [npmCli, "run", "dev:app"], "React Router");

if (process.env.CLOUDFLARE_TOKEN) {
  start(
    "cloudflared",
    ["tunnel", "run", "--token", process.env.CLOUDFLARE_TOKEN],
    "cloudflared",
  );
} else {
  console.warn("CLOUDFLARE_TOKEN が未設定のため、Cloudflare Tunnel を起動しません。");
}
