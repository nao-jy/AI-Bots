import { spawn } from "node:child_process";

const token = process.env.CLOUDFLARE_TOKEN;
if (!token?.trim()) {
  console.error("CLOUDFLARE_TOKEN is required to start the production tunnel.");
  process.exit(1);
}

const children = [];
let stopping = false;

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  const timer = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }, 8000);
  timer.unref();
}

function start(command, args, options = {}) {
  const child = spawn(command, args, { stdio: "inherit", ...options });
  children.push(child);
  child.on("error", (error) => {
    console.error(`Failed to start ${command}: ${error.message}`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (stopping) return;
    console.error(`${command} exited (code: ${code}, signal: ${signal})`);
    shutdown(1);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start(process.execPath, ["scripts/production-server.mjs"]);
start("cloudflared", ["tunnel", "--no-autoupdate", "run"], {
  env: { ...process.env, TUNNEL_TOKEN: token },
});
