// @ts-ignore Bun exposes this module at runtime; the app intentionally does not ship Bun's ambient types.
import { describe, expect, test } from "bun:test";
import { domainFromEmail, normalizeDomain } from "./domain";

describe("domain access normalization", () => {
  test("normalizes exact company domains", () => {
    expect(normalizeDomain(" @Pathors.COM. ")).toBe("pathors.com");
    expect(domainFromEmail("person+seo@Pathors.COM")).toBe("pathors.com");
  });

  test("rejects malformed domains and emails", () => {
    expect(normalizeDomain("pathors")).toBeNull();
    expect(normalizeDomain("pathors.com.evil..com")).toBeNull();
    expect(domainFromEmail("not-an-email")).toBeNull();
  });

  test("does not confuse a suffix with the exact domain", () => {
    expect(domainFromEmail("person@evilpathors.com")).toBe("evilpathors.com");
    expect(domainFromEmail("person@sub.pathors.com")).toBe("sub.pathors.com");
  });
});
