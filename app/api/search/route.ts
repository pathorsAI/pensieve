import { NextResponse } from "next/server";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";
import { requireMember } from "@/lib/access";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const slug = u.searchParams.get("org") ?? "";
  const q = (u.searchParams.get("q") ?? "").trim();
  const access = await requireMember(slug);
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const pat = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  const rows = await db.select({
    path: schema.document.path, title: schema.document.title,
    date: schema.document.date, text: schema.document.text,
  }).from(schema.document)
    .where(and(eq(schema.document.organizationId, access.org.id),
      or(ilike(schema.document.title, pat), ilike(schema.document.text, pat),
         sql`${schema.document.tags}::text ilike ${pat}`)))
    .limit(30);

  const hits = rows.map((r) => {
    const i = r.text.toLowerCase().indexOf(q.toLowerCase());
    const snippet = i >= 0
      ? (i > 60 ? "…" : "") + r.text.slice(Math.max(0, i - 60), i + q.length + 90) + "…"
      : r.text.slice(0, 140);
    return { path: r.path, title: r.title, date: r.date, snippet };
  }).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return NextResponse.json({ hits });
}
