import express from "express";
import { createRequestHandler } from "@react-router/express";

process.env.NODE_ENV ??= "production";
const build = await import("../build/server/index.js");

const app = express();
app.disable("x-powered-by");
// cloudflared connects over loopback; do not trust headers from other peers.
app.set("trust proxy", "loopback");
app.use((req, _res, next) => {
  // Cloudflare preserves Host, while X-Forwarded-Host may come from a client.
  delete req.headers["x-forwarded-host"];
  next();
});
app.use("/assets", express.static("build/client/assets", { immutable: true, maxAge: "1y" }));
app.use(express.static("build/client"));
app.all("/{*splat}", createRequestHandler({ build, mode: process.env.NODE_ENV }));

const server = app.listen(Number(process.env.PORT || 3000), process.env.HOST || "127.0.0.1", () => {
  console.log(`Server listening on ${server.address().address}:${server.address().port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => server.close());
}
