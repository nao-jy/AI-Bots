export function contextFetch(
  context: Record<string, unknown>,
  endpoint: string,
  fetchImpl: typeof fetch = fetch,
): typeof fetch {
  return (input, init) => {
    if (
      typeof input === "string" &&
      input === endpoint &&
      typeof init?.body === "string"
    ) {
      const message: unknown = JSON.parse(init.body);
      if (message && typeof message === "object" && !Array.isArray(message)) {
        const request = message as {
          method?: string;
          params?: Record<string, unknown>;
        };
        if (request.method === "tools/call") {
          const meta = request.params?._meta;
          request.params = {
            ...request.params,
            _meta: {
              ...(meta && typeof meta === "object" && !Array.isArray(meta)
                ? meta
                : {}),
              "bot_manager/context": context,
            },
          };
          return fetchImpl(input, { ...init, body: JSON.stringify(request) });
        }
      }
    }
    return fetchImpl(input, init);
  };
}
