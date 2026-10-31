export type EntityRecord = { id: number; updated: string } & Record<
  string,
  string | number
>;

export type EntityOption = { label: string; value: string };
export type PublicIdSlot = "first" | "second";
