// @ts-ignore Bun exposes this module at runtime; the app intentionally does not ship Bun's ambient types.
import { describe, expect, test } from "bun:test";
import { metaDescription, plainText } from "./extract";

describe("metaDescription", () => {
  test("either attribute order", () => {
    expect(metaDescription('<meta name="description" content="雄獅報價">')).toBe("雄獅報價");
    expect(metaDescription("<meta content='Q4 retro' name='description' />")).toBe("Q4 retro");
  });
  test("missing or empty", () => {
    expect(metaDescription("<title>x</title>")).toBeNull();
    expect(metaDescription('<meta name="description" content="  ">')).toBeNull();
  });
});

describe("plainText", () => {
  test("description is searchable and leads the text", () => {
    const html = '<head><meta name="description" content="給雄獅的導入時程"><style>a{}</style></head><body><p>正文</p></body>';
    expect(plainText(html)).toBe("給雄獅的導入時程 · 正文");
  });
  test("no description, unchanged behaviour", () => {
    expect(plainText("<p>a &amp; b</p>")).toBe("a b");
  });
});
