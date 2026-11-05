/**
 * Pure helpers for syncGithubSource, kept free of db/fetch so they can be tested.
 *
 * Why they exist: the sync used to fetch every asset blob on every push and write
 * them all in ONE insert. Neon's HTTP driver caps a request at 64 MB, and once
 * pathors-docs' assets passed ~63 MB of base64 that insert started failing on
 * every push — after the documents had already been written, so new pages showed
 * up while their images 404'd.
 */

/** Keep each write well under Neon's 64 MB HTTP request cap (and Workers' 128 MB memory). */
export const WRITE_BUDGET_BYTES = 8 * 1024 * 1024;

/**
 * Split items into consecutive groups whose summed size stays within budget.
 * An item larger than the budget on its own still gets a group of one —
 * it can't be split, and refusing it would silently drop the file.
 */
export function byteBatches<T>(items: readonly T[], size: (item: T) => number, budget = WRITE_BUDGET_BYTES): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const n = size(item);
    if (cur.length && bytes + n > budget) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(item);
    bytes += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Which tree entries actually need their blob fetched: new paths, and paths whose
 * git blob sha differs from the one stored. A stored sha of null (rows written
 * before the sha column existed) always counts as changed, so the first sync after
 * deploy backfills every sha once.
 */
export function changedEntries<T extends { path: string; sha: string }>(
  entries: readonly T[],
  stored: ReadonlyMap<string, string | null>,
): T[] {
  return entries.filter((e) => stored.get(e.path) !== e.sha);
}
