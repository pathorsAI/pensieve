import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";
import { requireMember } from "@/lib/access";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("org") ?? "";
  const access = await requireMember(slug);
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const docs = await db.select({
    path: schema.document.path, title: schema.document.title, date: schema.document.date,
    tags: schema.document.tags, links: schema.document.links,
  }).from(schema.document).where(eq(schema.document.organizationId, access.org.id));
  const ids = new Set(docs.map((d) => d.path));
  const nodes = docs.map((d) => ({
    id: d.path, title: d.title, date: d.date,
    dir: d.path.split("/").filter(Boolean).slice(0, -1)[0] ?? "root", tags: d.tags,
  }));
  const edges = docs.flatMap((d) =>
    (d.links as string[]).filter((l) => ids.has(l) && l !== d.path).map((l) => ({ from: d.path, to: l })));
  return NextResponse.json({ nodes, edges });
}
