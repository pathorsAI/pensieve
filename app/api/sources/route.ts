import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";
import { requireMember } from "@/lib/access";
import { syncGithubSource } from "@/lib/github";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("org") ?? "";
  const access = await requireMember(slug);
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rows = await db.select().from(schema.syncSource).where(eq(schema.syncSource.organizationId, access.org.id));
  return NextResponse.json({ sources: rows });
}

// { org, repo, branch?, folder?, mount?, installationId } → create source
// { org, syncId } → run a sync now
// { org, updateId, branch?, folder?, mount? } → edit then resync (prune moves old paths)
// { org, deleteId } → remove source and every document it owns
export async function POST(req: Request) {
  const body = await req.json() as Record<string, string>;
  const access = await requireMember(body.org ?? "");
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (body.deleteId) {
    const rows = await db.select().from(schema.syncSource).where(eq(schema.syncSource.id, body.deleteId));
    if (!rows.length || rows[0].organizationId !== access.org.id)
      return NextResponse.json({ error: "not found" }, { status: 404 });
    await db.delete(schema.document).where(eq(schema.document.source, `github:${body.deleteId}`));
    await db.delete(schema.syncSource).where(eq(schema.syncSource.id, body.deleteId));
    return NextResponse.json({ ok: true, deleted: true });
  }

  if (body.updateId) {
    const rows = await db.select().from(schema.syncSource).where(eq(schema.syncSource.id, body.updateId));
    if (!rows.length || rows[0].organizationId !== access.org.id)
      return NextResponse.json({ error: "not found" }, { status: 404 });
    await db.update(schema.syncSource).set({
      branch: body.branch ?? rows[0].branch, folder: body.folder ?? rows[0].folder,
      mount: body.mount || rows[0].mount,
    }).where(eq(schema.syncSource.id, body.updateId));
    const fresh = (await db.select().from(schema.syncSource).where(eq(schema.syncSource.id, body.updateId)))[0];
    try {
      const r = await syncGithubSource(fresh);
      return NextResponse.json({ ok: true, ...r });
    } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
  }

  if (body.syncId) {
    const rows = await db.select().from(schema.syncSource).where(eq(schema.syncSource.id, body.syncId));
    if (!rows.length || rows[0].organizationId !== access.org.id)
      return NextResponse.json({ error: "not found" }, { status: 404 });
    try {
      const r = await syncGithubSource(rows[0]);
      return NextResponse.json({ ok: true, ...r });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  const id = crypto.randomUUID();
  await db.insert(schema.syncSource).values({
    id, organizationId: access.org.id, type: "github",
    repo: body.repo, branch: body.branch || "main", folder: body.folder || "",
    mount: body.mount || "/", installationId: body.installationId || null,
  });
  return NextResponse.json({ ok: true, id });
}
