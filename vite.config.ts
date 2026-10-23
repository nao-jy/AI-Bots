import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { env } from "node:process";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    allowedHosts: [
      ...(env.CLOUDFLARE_TUNNEL_DOMAIN === undefined
        ? []
        : [env.CLOUDFLARE_TUNNEL_DOMAIN]),
    ],
  },
});
