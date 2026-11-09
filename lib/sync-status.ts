/**
 * How a sync source's last attempt should read, shared by the settings page,
 * the workspace shell and the document 404 page. Pure, so client code can use it.
 */

/**
 * A sync that has said "running" for this long is not running: the worker that
 * held it was cut off (waitUntil's post-response budget, a deploy, an OOM) before
 * it could record ok or error. Normal syncs finish in seconds.
 */
export const SYNC_STALE_MS = 5 * 60 * 1000;

export type SyncState = "never" | "running" | "interrupted" | "ok" | "error";

export type SyncStatusFields = {
  lastSyncAt?: string | Date | null;
  lastSyncStatus?: string | null;
  lastSyncStartedAt?: string | Date | null;
};

export function syncState(s: SyncStatusFields, now = Date.now()): SyncState {
  if (s.lastSyncStatus === "running") {
    const started = s.lastSyncStartedAt ? new Date(s.lastSyncStartedAt).getTime() : 0;
    return now - started > SYNC_STALE_MS ? "interrupted" : "running";
  }
  if (s.lastSyncStatus === "ok" || s.lastSyncStatus === "error") return s.lastSyncStatus;
  // rows from before status was recorded: a past success is all we know
  return s.lastSyncAt ? "ok" : "never";
}

/** "3 分鐘前" / "3 min ago", coarse on purpose. */
export function ago(t: string | Date | null | undefined, locale: "zh-TW" | "en" = "zh-TW", now = Date.now()): string {
  if (!t) return "—";
  const s = Math.max(0, Math.round((now - new Date(t).getTime()) / 1000));
  const [n, zh, en] = s < 60 ? [s, "秒", "s"] : s < 3600 ? [Math.round(s / 60), "分鐘", "min"]
    : s < 86400 ? [Math.round(s / 3600), "小時", "h"] : [Math.round(s / 86400), "天", "d"];
  return locale === "en" ? `${n} ${en} ago` : `${n} ${zh}前`;
}
