import type { TranslationMessage } from "../i18n";

export type EntityRecord = { id: string; updated: string } & Record<
  string,
  string | number | boolean
>;

export type EntityOption = {
  label: string | TranslationMessage;
  value: string;
};
export type PublicIdSlot = "first" | "second";
