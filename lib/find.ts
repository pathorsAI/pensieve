/**
 * Pure helpers for finding documents again — shared by the sidebar (client) and
 * /api/search (server). Kept free of db/DOM so they can be tested.
 */

export type FindFilters = {
  /** Path prefix without trailing slash, e.g. "/bd/liontravel". */
  folder?: string | null;
  /** "YYYY-MM" — matches meta date "YYYY-MM-DD". */
  month?: string | null;
  /** Compared case-insensitively: "BD" and "bd" are the same tag. */
  tag?: string | null;
};

export type Findable = { id: string; title: string; date?: string | null; tags: string[] };

const MONTH = /^\d{4}-\d{2}$/;
const CJK = /[㐀-鿿぀-ヿ가-힯]/;

/** A single CJK character is already a meaningful word (「獅」「案」); a single latin letter isn't. */
export function isSearchable(q: string): boolean {
  const s = q.trim();
  return s.length >= 2 || (s.length === 1 && CJK.test(s));
}

export const normTag = (t: string) => t.trim().toLowerCase();

/** Drop anything malformed so it never reaches SQL or a filter. */
export function cleanFilters(f: FindFilters): FindFilters {
  let folder = f.folder?.trim() || null;
  // trailing slashes off, without a regex (Sonar S5852: `/\/+$/` backtracks on long input)
  while (folder?.endsWith("/")) folder = folder.slice(0, -1) || null;
  return {
    folder: folder?.startsWith("/") ? folder : null,
    month: f.month && MONTH.test(f.month) ? f.month : null,
    tag: f.tag?.trim() ? normTag(f.tag) : null,
  };
}

export const hasFilters = (f: FindFilters) => !!(f.folder || f.month || f.tag);

export function matchesFilters(d: Findable, f: FindFilters): boolean {
  if (f.folder && !d.id.startsWith(f.folder + "/")) return false;
  if (f.month && !(d.date ?? "").startsWith(f.month)) return false;
  if (f.tag && !d.tags.some((t) => normTag(t) === f.tag)) return false;
  return true;
}

/** Browse without a query: everything matching the filters, newest first. */
export function filterDocs<T extends Findable>(docs: readonly T[], f: FindFilters): T[] {
  return docs.filter((d) => matchesFilters(d, f))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.title.localeCompare(b.title));
}

/** Months that actually have documents, newest first, with counts. */
export function monthOptions(docs: readonly Findable[]): { month: string; count: number }[] {
  const m = new Map<string, number>();
  for (const d of docs) {
    const k = d.date?.slice(0, 7);
    if (k && MONTH.test(k)) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].map(([month, count]) => ({ month, count })).sort((a, b) => b.month.localeCompare(a.month));
}

/** Tags merged case-insensitively (bd 78 + BD 70 → bd 148), most used first. */
export function tagOptions(docs: readonly Findable[]): { tag: string; count: number }[] {
  const m = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.tags.map(normTag))) if (t) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m].map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
