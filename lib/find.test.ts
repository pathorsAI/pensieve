// @ts-ignore Bun exposes this module at runtime; the app intentionally does not ship Bun's ambient types.
import { describe, expect, test } from "bun:test";
import { cleanFilters, filterDocs, isSearchable, monthOptions, tagOptions } from "./find";

const docs = [
  { id: "/bd/liontravel/proposal", title: "雄獅提案", date: "2026-10-03", tags: ["BD", "proposal"] },
  { id: "/clients/liontravel/retro", title: "雄獅 retro", date: "2026-09-20", tags: ["bd"] },
  { id: "/pathors/search", title: "搜尋設計", date: "2026-10-12", tags: ["design"] },
  { id: "/notes/undated", title: "沒日期", date: null, tags: [] },
];

describe("isSearchable", () => {
  test("one CJK char is enough, one latin letter is not", () => {
    expect(isSearchable("獅")).toBe(true);
    expect(isSearchable("a")).toBe(false);
    expect(isSearchable(" ab ")).toBe(true);
    expect(isSearchable("  ")).toBe(false);
  });
});

describe("cleanFilters", () => {
  test("drops malformed values and normalizes", () => {
    expect(cleanFilters({ folder: "/bd/", month: "2026-10", tag: " BD " }))
      .toEqual({ folder: "/bd", month: "2026-10", tag: "bd" });
    expect(cleanFilters({ folder: "bd", month: "2026-1", tag: "" }))
      .toEqual({ folder: null, month: null, tag: null });
  });
});

describe("filterDocs", () => {
  test("month + folder, newest first", () => {
    expect(filterDocs(docs, { month: "2026-10" }).map((d) => d.id))
      .toEqual(["/pathors/search", "/bd/liontravel/proposal"]);
    expect(filterDocs(docs, { folder: "/bd" }).map((d) => d.id)).toEqual(["/bd/liontravel/proposal"]);
  });
  test("folder prefix does not match sibling names", () => {
    expect(filterDocs(docs, { folder: "/bd/lion" })).toEqual([]);
  });
  test("tag is case-insensitive", () => {
    expect(filterDocs(docs, { tag: "bd" }).length).toBe(2);
  });
});

describe("options", () => {
  test("months newest first, undated skipped", () => {
    expect(monthOptions(docs)).toEqual([{ month: "2026-10", count: 2 }, { month: "2026-09", count: 1 }]);
  });
  test("tags merged across case", () => {
    expect(tagOptions(docs)[0]).toEqual({ tag: "bd", count: 2 });
  });
});
