import { appLogger } from "../logger/app-logger";

/** Convert values entered in the string-only adapter config form for SDK factories. */
export function parseAdapterArgs(
  args: Record<string, string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => {
      const trimmed = value.trim();
      if (trimmed === "true" || trimmed === "false") {
        return [key, trimmed === "true"];
      }

      const number = Number(value);
      if (trimmed !== "" && Number.isFinite(number)) {
        return [key, number];
      }

      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          return [key, JSON.parse(trimmed)];
        } catch (error) {
          appLogger.error(error);
        }
      }

      return [key, value];
    }),
  );
}
