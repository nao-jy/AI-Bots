import type { TranslationMessage } from "../i18n";

export type EntityRecord = { id: number; updated: string } & Record<
  string,
  string | number
>;

export type EntityOption = {
  label: string | TranslationMessage;
  value: string;
};
export type PublicIdSlot = "first" | "second";
