import { resources, type Locale, type TranslationKey } from "../i18n";
import { getRequestLocale } from "./request-context";

type Values = Record<string, string | number>;

function lookup(locale: Locale, key: TranslationKey): string {
  const path = key.split(".");
  const getValue = (resource: unknown) =>
    path.reduce<unknown>((value, part) => {
      if (!value || typeof value !== "object") return undefined;
      return (value as Record<string, unknown>)[part];
    }, resource);

  const localized = getValue(resources[locale].translation);
  const fallback = getValue(resources.ja.translation);
  return typeof localized === "string"
    ? localized
    : typeof fallback === "string"
      ? fallback
      : key;
}

export function t(key: TranslationKey, values?: Values): string {
  const locale = getRequestLocale() ?? "ja";
  return lookup(locale, key).replace(
    /{{\s*([^{}]+?)\s*}}/g,
    (match, name: string) => String(values?.[name] ?? match),
  );
}

Object.assign(globalThis, { __appServerTranslator: t });
