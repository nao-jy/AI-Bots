import { tool } from "ai";
import { z } from "zod";
import { TIMEOUT_MS } from "./consts";

const SEARXNG_URL = process.env.SEARXNG_URL;

type SearxResult = { title: string; url: string; content?: string };

export const SearXNGWebSearch = tool({
  description:
    "Webを検索し、タイトル・URL・抜粋の一覧を返す。最新情報や知らない事柄を調べるときに使う。",
  inputSchema: z.object({
    query: z.string().min(1).describe("検索クエリ"),
    maxResults: z.number().int().min(1).max(10).default(5),
  }),
  execute: async ({ query, maxResults }) => {
    try {
      if (SEARXNG_URL === undefined) {
        throw new Error("SEARXNG_URL is not defined");
      }
      const url = new URL("/search", SEARXNG_URL);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) return { error: `search failed: HTTP ${res.status}` };
      const data = (await res.json()) as { results?: SearxResult[] };
      return {
        results: (data.results ?? []).slice(0, maxResults).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content ?? "",
        })),
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
});
