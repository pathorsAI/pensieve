import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/access";

type Row = { path: string; title: string; date: string | null; text: string };

export async function GET(req: Request) {
  const u = new URL(req.url);
  const slug = u.searchParams.get("org") ?? "";
  const q = (u.searchParams.get("q") ?? "").trim();
  const access = await requireMember(slug);
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const pat = "%" + q.replace(/[%_\\]/g, (m) => "\\" + m) + "%";
  let rows: Row[] = [];
  try {
    // English terms rank via ts_rank_cd over the generated tsvector (BM25-family);
    // CJK and substrings come in through the trigram/ILIKE branch, ranked by similarity.
    const r = await db.execute(sql`
      select path, title, date, text,
        ts_rank_cd(tsv, websearch_to_tsquery('english', ${q})) as rank,
        greatest(similarity(title, ${q}), similarity(left(text, 4000), ${q})) as sim
      from document
      where organization_id = ${access.org.id} and (
        tsv @@ websearch_to_tsquery('english', ${q})
        or title ilike ${pat} or text ilike ${pat} or tags::text ilike ${pat})
      order by rank desc, sim desc, date desc nulls last
      limit 30`);
    rows = r.rows as unknown as Row[];
  } catch {
    // minimal fallback for databases without pg_trgm
    const r = await db.execute(sql`
      select path, title, date, text from document
      where organization_id = ${access.org.id}
        and (title ilike ${pat} or text ilike ${pat} or tags::text ilike ${pat})
      order by date desc nulls last limit 30`);
    rows = r.rows as unknown as Row[];
  }

  const hits = rows.map((r) => {
    const i = r.text.toLowerCase().indexOf(q.toLowerCase());
    const snippet = i >= 0
      ? (i > 60 ? "…" : "") + r.text.slice(Math.max(0, i - 60), i + q.length + 90) + "…"
      : r.text.slice(0, 140);
    return { path: r.path, title: r.title, date: r.date, snippet };
  });
  return NextResponse.json({ hits });
}
