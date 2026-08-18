import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";
import { orgFromToken } from "@/lib/access";
import { extractMeta } from "@/lib/extract";

// CLI push: { mount?: "/", prune?: true, docs: [{ path, html }] }
export async function POST(req: Request) {
  const token = await orgFromToken(req);
  if (!token) return NextResponse.json({ error: "bad token" }, { status: 401 });
  const body = await req.json() as { mount?: string; prune?: boolean; docs: { path: string; html: string }[] };
  if (!Array.isArray(body.docs)) return NextResponse.json({ error: "docs required" }, { status: 400 });

  const mount = !body.mount || body.mount === "/" ? "" : body.mount.replace(/\/$/, "");
  const label = `cli:${mount || "/"}`;
  const seen: string[] = [];
  for (const d of body.docs) {
    const path = mount + (d.path.startsWith("/") ? d.path : "/" + d.path).replace(/\.html$/, "");
    const meta = extractMeta(d.html);
    seen.push(path);
    await db.insert(schema.document)
      .values({ id: crypto.randomUUID(), organizationId: token.organizationId, path, html: d.html, source: label, ...meta })
      .onConflictDoUpdate({
        target: [schema.document.organizationId, schema.document.path],
        set: { html: d.html, title: meta.title, date: meta.date, tags: meta.tags, links: meta.links, source: label, updatedAt: new Date() },
      });
  }
  let pruned = 0;
  if (body.prune) {
    const owned = await db.select().from(schema.document)
      .where(and(eq(schema.document.organizationId, token.organizationId), eq(schema.document.source, label)));
    for (const d of owned) if (!seen.includes(d.path)) { await db.delete(schema.document).where(eq(schema.document.id, d.id)); pruned++; }
  }
  return NextResponse.json({ ok: true, upserted: seen.length, pruned });
}
