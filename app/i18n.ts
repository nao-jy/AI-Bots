import i18next, { type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";
import { ja } from "./locales/ja";

export const resources = {
  ja: { translation: ja },
  en: { translation: en },
} as const;

export type Locale = "ja" | "en";
export const DEFAULT_LOCALE: Locale = "ja";
export const LOCALE_COOKIE = "app_locale";

export function isLocale(value: string): value is Locale {
  return value === "ja" || value === "en";
}

export function getLocaleFromCookie(cookieHeader: string | null): Locale {
  const localeCookie = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  const value = localeCookie?.slice(LOCALE_COOKIE.length + 1);
  if (!value) return DEFAULT_LOCALE;
  try {
    const decoded = decodeURIComponent(value);
    return isLocale(decoded) ? decoded : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function getInitialLocale(): Locale {
  return typeof document === "undefined"
    ? DEFAULT_LOCALE
    : getLocaleFromCookie(document.cookie);
}

function initializeInstance(instance: I18nInstance, locale: Locale) {
  instance.use(initReactI18next);
  void instance.init({
    resources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: "translation",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export async function createRequestI18n(locale: Locale): Promise<I18nInstance> {
  const instance = i18next.createInstance();
  await instance.init({
    resources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: "translation",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}

type Join<K extends string, V> = V extends string ? `${K}.${V}` : never;
export type TranslationKey<T = typeof resources.ja.translation> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : Join<K, TranslationKey<T[K]>>;
}[keyof T & string];

export type NavigationLabelKey = Extract<
  TranslationKey,
  `navigation.${string}`
>;

export type TranslationMessage = {
  key: TranslationKey;
  values?: Record<string, string | number>;
};

export function localizedMessage(
  key: TranslationKey,
  values?: Record<string, string | number>,
): TranslationMessage {
  return { key, values };
}

const i18n = i18next.createInstance();
if (typeof document !== "undefined")
  initializeInstance(i18n, getInitialLocale());

type ServerTranslator = (
  key: TranslationKey,
  values?: Record<string, string | number>,
) => string;

function isKnownKey(value: string): value is TranslationKey {
  let current: unknown = resources.ja.translation;
  for (const part of value.split(".")) {
    if (!current || typeof current !== "object") return false;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string";
}

function fallbackTranslate(
  key: TranslationKey,
  values?: Record<string, string | number>,
) {
  let current: unknown = resources.ja.translation;
  for (const part of key.split(".")) {
    if (!current || typeof current !== "object") return key;
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current !== "string") return key;
  return current.replace(/{{\s*([^{}]+?)\s*}}/g, (match, name: string) =>
    String(values?.[name] ?? match),
  );
}

export function t(
  key: TranslationKey,
  values?: Record<string, string | number>,
): string {
  if (typeof document === "undefined") {
    const serverTranslator = (
      globalThis as typeof globalThis & {
        __appServerTranslator?: ServerTranslator;
      }
    ).__appServerTranslator;
    return serverTranslator?.(key, values) ?? fallbackTranslate(key, values);
  }
  return i18n.t(key, values);
}

export function tMessage(message: string | TranslationMessage): string {
  if (typeof message !== "string") return t(message.key, message.values);
  return isKnownKey(message) ? t(message) : message;
}

export default i18n;
