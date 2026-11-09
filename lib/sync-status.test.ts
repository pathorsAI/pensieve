// @ts-ignore Bun exposes this module at runtime; the app intentionally does not ship Bun's ambient types.
import { describe, expect, test } from "bun:test";
import { SYNC_STALE_MS, syncState } from "./sync-status";

describe("syncState", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  test("never synced", () => expect(syncState({}, now)).toBe("never"));
  test("legacy row with only lastSyncAt reads as ok", () =>
    expect(syncState({ lastSyncAt: "2026-11-01T00:00:00Z" }, now)).toBe("ok"));
  test("fresh running stays running", () =>
    expect(syncState({ lastSyncStatus: "running", lastSyncStartedAt: new Date(now - 10_000) }, now)).toBe("running"));
  test("running past the stale window was cut off", () =>
    expect(syncState({ lastSyncStatus: "running", lastSyncStartedAt: new Date(now - SYNC_STALE_MS - 1) }, now))
      .toBe("interrupted"));
  test("error wins over an older success", () =>
    expect(syncState({ lastSyncStatus: "error", lastSyncAt: "2026-11-01T00:00:00Z" }, now)).toBe("error"));
});
