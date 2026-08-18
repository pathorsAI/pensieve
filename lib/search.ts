import { sql } from "drizzle-orm";
import { db } from "./db";

export type Hit = {
  path: string; title: string; date: string | null; tags: string[];
  snippet: string;      // plain text, no markup
  marked: string;       // same snippet, matched terms wrapped in SEL_A…SEL_B
  score: number;
};

// Private-use sentinels around matched terms — kept in sync with components/search-palette.tsx.
const SEL_A = "\uE000";
const SEL_B = "\uE001";
const HEADLINE = `StartSel=${SEL_A}, StopSel=${SEL_B}, MaxWords=35, MinWords=15, ShortWord=3, HighlightAll=false`;
const CJK = /[㐀-鿿぀-ヿ가-힯]/;
const WINDOW = 170, LEAD = 60;

type Row = {
  path: string; title: string; date: string | null; tags: string[] | null;
  snip: string | null; pos: number | string | null; score: number | string | null;
  hl?: boolean | null;
};

const strip = (s: string) => s.replace(/[\uE000\uE001]/g, "");
const esc = (s: string) => s.replace(/[%_\\]/g, (m) => "\\" + m);

/** Wrap literal occurrences of the query terms — ts_headline can't do CJK with the english config. */
function markLiteral(text: string, q: string) {
  const terms = q.split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!terms.length) return text;
  const re = new RegExp(terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)).join("|"), "gi");
  return text.replace(re, (m) => SEL_A + m + SEL_B);
}

function toHits(rows: Row[], q: string): Hit[] {
  return rows.map((r) => {
    const raw = r.snip ?? "";
    const pos = Number(r.pos ?? 0);
    const lead = pos > LEAD ? "…" : "";
    const tail = raw.length >= WINDOW ? "…" : "";
    // ts_headline already marked the FTS rows; the substring windows still need it.
    const marked = r.hl ? raw : lead + markLiteral(raw, q) + tail;
    return {
      path: r.path, title: r.title, date: r.date,
      tags: Array.isArray(r.tags) ? r.tags : [],
      snippet: strip(marked), marked, score: Number(r.score ?? 0),
    };
  });
}

/**
 * Hybrid full-text + trigram search over one organization's documents.
 * One round trip: rank in a CTE, then build snippets only for the rows that survived the limit.
 */
export async function searchDocuments(
  orgId: string, q: string, opts?: { limit?: number }
): Promise<Hit[]> {
  const query = q.trim();
  if (!query) return [];
  const limit = Math.min(100, Math.max(1, Math.trunc(opts?.limit ?? 30)));
  const pat = "%" + esc(query) + "%";
  const cjk = CJK.test(query);

  try {
    if (cjk) {
      // websearch_to_tsquery('english', …) is empty for Chinese, so a zero ts_rank_cd would
      // flatten the ordering — rank on trigram similarity and match position instead.
      // Terms are ANDed: 「工程 設計」 has no english tokenizer to split it for us.
      const terms = query.split(/\s+/).filter(Boolean);
      const pats = terms.map((t) => "%" + esc(t) + "%");
      const score = sql.join(terms.map((t, i) => sql`
        (case when title ilike ${pats[i]} then 0.50 else 0 end)
        + (case when tags::text ilike ${pats[i]} then 0.10 else 0 end)
        + (case when strpos(lower(text), lower(${t})) > 0
             then 0.25 * greatest(0.25, 1 - strpos(lower(text), lower(${t}))::float8 / 4000) else 0 end)
        + 0.30 * greatest(similarity(title, ${t}), word_similarity(${t}, title),
             similarity(left(text, 4000), ${t}))`), sql` + `);
      const match = sql.join(terms.map((t, i) =>
        sql`(title ilike ${pats[i]} or text ilike ${pats[i]} or tags::text ilike ${pats[i]})`), sql` and `);
      const pos = sql.join(terms.map((t) => sql`nullif(strpos(lower(text), lower(${t})), 0)`), sql`, `);
      const r = await db.execute(sql`
        with m as (
          select path, title, date, tags, text,
            coalesce(${pos}, 0) as pos,
            (${score}) / ${terms.length} as score
          from document
          where organization_id = ${orgId} and ((${match}) or ${query} <% title)
          order by score desc, date desc nulls last limit ${limit}
        )
        select path, title, date, tags, score, pos,
          case when pos > 0 then substr(text, greatest(1, pos - ${LEAD}), ${WINDOW})
               else left(text, 150) end as snip
        from m order by score desc, date desc nulls last`);
      return toHits(r.rows as unknown as Row[], query);
    }

    // Title carries weight A in document.tsv, body B, so ts_rank_cd already floats titles;
    // rank/(rank+0.4) squashes it into 0…1 so the trigram half can outrank a weak body hit.
    // word_similarity beside similarity: plain similarity collapses when a short query
    // is measured against a long title ("retro" scores .29 there, word_similarity 1.0).
    const r = await db.execute(sql`
      with tq as (select websearch_to_tsquery('english', ${query}) as q),
      b as (
        select d.path, d.title, d.date, d.tags, d.text, tq.q as tsq,
          (d.tsv @@ tq.q) as hl,
          ts_rank_cd(d.tsv, tq.q) as rank,
          strpos(lower(d.text), lower(${query})) as pos,
          greatest(similarity(d.title, ${query}), word_similarity(${query}, d.title)) as tsim,
          similarity(left(d.text, 4000), ${query}) as bsim,
          (d.title ilike ${pat}) as tmatch
        from document d, tq
        where d.organization_id = ${orgId}
          and (d.tsv @@ tq.q or d.title ilike ${pat} or d.text ilike ${pat}
            or d.tags::text ilike ${pat} or ${query} <% d.title)
      ),
      m as (
        select *,
          0.55 * (rank / (rank + 0.4))
          + 0.45 * greatest(tsim, bsim * 0.6)
          + (case when tmatch then 0.15 else 0 end) as score
        from b order by score desc, date desc nulls last limit ${limit}
      )
      select path, title, date, tags, score, pos, hl,
        case when hl then ts_headline('english', text, tsq, ${HEADLINE})
             when pos > 0 then substr(text, greatest(1, pos - ${LEAD}), ${WINDOW})
             else left(text, 150) end as snip
      from m order by score desc, date desc nulls last`);
    return toHits(r.rows as unknown as Row[], query);
  } catch {
    // minimal fallback for databases without pg_trgm
    const r = await db.execute(sql`
      select path, title, date, tags,
        strpos(lower(text), lower(${query})) as pos,
        (case when title ilike ${pat} then 0.6 else 0.3 end) as score,
        case when strpos(lower(text), lower(${query})) > 0
             then substr(text, greatest(1, strpos(lower(text), lower(${query})) - ${LEAD}), ${WINDOW})
             else left(text, 150) end as snip
      from document
      where organization_id = ${orgId}
        and (title ilike ${pat} or text ilike ${pat} or tags::text ilike ${pat})
      order by score desc, date desc nulls last limit ${limit}`);
    return toHits(r.rows as unknown as Row[], query);
  }
}
