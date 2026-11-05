import { tool } from "ai";
import { z } from "zod";
import { TIMEOUT_MS } from "./consts";
import { t } from "~/.server/i18n";

const SEARXNG_URL = process.env.SEARXNG_URL;

type SearxResult = { title: string; url: string; content?: string };

export function getSearXNGWebSearch() {
  return tool({
    description: t("server.webSearchToolDescription"),
    inputSchema: z.object({
      query: z.string().min(1).describe(t("server.webSearchQuery")),
      maxResults: z.number().int().min(1).max(10).default(5),
    }),
    execute: async ({ query, maxResults }) => {
      try {
        if (SEARXNG_URL === undefined) {
          throw new Error(t("server.webSearchServiceNotConfigured"));
        }
        const url = new URL("/search", SEARXNG_URL);
        url.searchParams.set("q", query);
        url.searchParams.set("format", "json");
        const res = await fetch(url, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok)
          return {
            error: t("server.webSearchRequestFailed", { 0: res.status }),
          };
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
}
