import type { DirectoryEntry } from "../../.server/features/filesystem/api";

export type SortKey = "name" | "size" | "updatedAt";
export const nameOf = (entry: DirectoryEntry) =>
  entry.path.replace(/\/$/, "").split("/").at(-1) ?? "";

export function sortDirectoryEntries(
  entries: DirectoryEntry[],
  sort: { key: SortKey; descending: boolean },
  locale: string,
) {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    const aName = nameOf(a),
      bName = nameOf(b);
    let value =
      sort.key === "name"
        ? aName.localeCompare(bName, locale, {
            numeric: true,
            sensitivity: "base",
          })
        : sort.key === "size"
          ? (a.size ?? -1) - (b.size ?? -1)
          : (a.updatedAt ? Date.parse(a.updatedAt) : 0) -
            (b.updatedAt ? Date.parse(b.updatedAt) : 0);
    if (!value)
      value = aName.localeCompare(bName, locale, {
        numeric: true,
        sensitivity: "base",
      });
    return sort.descending ? -value : value;
  });
}
