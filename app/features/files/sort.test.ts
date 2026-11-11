import { describe, expect, it } from "vitest";
import { nameOf, sortDirectoryEntries } from "./sort";
import type { DirectoryEntry } from "../../.server/features/filesystem/api";

const entries: DirectoryEntry[] = [
  { path: "root/file10.txt", type: "file", size: 1, updatedAt: "2025-01-01" },
  { path: "root/file2.txt", type: "file", size: 10, updatedAt: "2026-01-01" },
  { path: "root/folder/", type: "directory", size: null, updatedAt: null },
];
const names = (key: "name" | "size" | "updatedAt", descending: boolean) =>
  sortDirectoryEntries(entries, { key, descending }, "en").map(nameOf);

describe("file browser sorting", () => {
  it("keeps folders first and sorts names naturally in either direction", () => {
    expect(names("name", false)).toEqual(["folder", "file2.txt", "file10.txt"]);
    expect(names("name", true)).toEqual(["folder", "file10.txt", "file2.txt"]);
  });
  it("sorts by numeric size and modification date", () => {
    expect(names("size", false)).toEqual(["folder", "file10.txt", "file2.txt"]);
    expect(names("updatedAt", true)).toEqual([
      "folder",
      "file2.txt",
      "file10.txt",
    ]);
  });
});
