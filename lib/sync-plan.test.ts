// @ts-ignore Bun exposes this module at runtime; the app intentionally does not ship Bun's ambient types.
import { describe, expect, test } from "bun:test";
import { byteBatches, changedEntries } from "./sync-plan";

describe("byteBatches", () => {
  const len = (s: string) => s.length;

  test("groups items without exceeding the budget", () => {
    expect(byteBatches(["aa", "bb", "cc", "d"], len, 4)).toEqual([["aa", "bb"], ["cc", "d"]]);
  });

  test("an oversized item gets its own batch instead of being dropped", () => {
    expect(byteBatches(["a", "xxxxxx", "b"], len, 4)).toEqual([["a"], ["xxxxxx"], ["b"]]);
  });

  test("keeps every item exactly once, in order", () => {
    const items = Array.from({ length: 50 }, (_, i) => "x".repeat(i % 7));
    expect(byteBatches(items, len, 10).flat()).toEqual(items);
  });

  test("empty input yields no batches", () => {
    expect(byteBatches([], len, 4)).toEqual([]);
  });
});

describe("changedEntries", () => {
  const tree = [
    { path: "/a.png", sha: "1" },
    { path: "/b.png", sha: "2" },
    { path: "/c.png", sha: "3" },
    { path: "/d.png", sha: "4" },
  ];

  test("skips unchanged, fetches new / changed / sha-less rows", () => {
    const stored = new Map<string, string | null>([["/a.png", "1"], ["/b.png", "old"], ["/c.png", null]]);
    expect(changedEntries(tree, stored).map((e) => e.path)).toEqual(["/b.png", "/c.png", "/d.png"]);
  });

  test("nothing stored means everything is fetched", () => {
    expect(changedEntries(tree, new Map())).toHaveLength(4);
  });
});
