import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";
import { requireMember } from "@/lib/access";
import { runSync, installationOwner, installationCanSee, type SyncTrigger } from "@/lib/github";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("org") ?? "";
  const access = await requireMember(slug);
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rows = await db.select().from(schema.syncSource).where(eq(schema.syncSource.organizationId, access.org.id));
  return NextResponse.json({ sources: rows });
}

// { org, repo, branch?, folder?, mount?, installationId } → create source
// { org, syncId, full? } → run a sync now (full re-downloads every blob)
// { org, updateId, branch?, folder?, mount? } → edit then resync (prune moves old paths)
// { org, deleteId } → remove source and every document it owns
type Body = Record<string, string>;

/** The source with this id, but only if it belongs to the caller's workspace. */
async function ownedSource(id: string, orgId: string) {
  const rows = await db.select().from(schema.syncSource).where(eq(schema.syncSource.id, id));
  return rows.length && rows[0].organizationId === orgId ? rows[0] : null;
}

const notFound = () => NextResponse.json({ error: "not found" }, { status: 404 });

async function syncResponse(source: typeof schema.syncSource.$inferSelect, trigger: SyncTrigger, full = false) {
  try {
    const r = await runSync(source, trigger, { full });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

async function deleteSource(body: Body, orgId: string) {
  if (!(await ownedSource(body.deleteId, orgId))) return notFound();
  await db.delete(schema.document).where(eq(schema.document.source, `github:${body.deleteId}`));
  await db.delete(schema.syncSource).where(eq(schema.syncSource.id, body.deleteId));
  return NextResponse.json({ ok: true, deleted: true });
}

async function updateSource(body: Body, orgId: string) {
  const current = await ownedSource(body.updateId, orgId);
  if (!current) return notFound();
  await db.update(schema.syncSource).set({
    branch: body.branch ?? current.branch, folder: body.folder ?? current.folder,
    mount: body.mount || current.mount,
  }).where(eq(schema.syncSource.id, body.updateId));
  const fresh = (await db.select().from(schema.syncSource).where(eq(schema.syncSource.id, body.updateId)))[0];
  return syncResponse(fresh, "edit");
}

async function syncNow(body: Body, orgId: string) {
  const source = await ownedSource(body.syncId, orgId);
  if (!source) return notFound();
  return syncResponse(source, body.created ? "create" : "manual", !!body.full);
}

// create. repo and installationId arrive from the client, so neither can be
// trusted: /api/github/installations can see every installation of the App,
// and without these checks any member could mount another workspace's private
// repo into their own by pairing its id with that installation.
async function createSource(body: Body, orgId: string) {
  if (!body.repo || !body.installationId)
    return NextResponse.json({ error: "repo and installationId are required" }, { status: 400 });

  const owner = await installationOwner(body.installationId);
  if (owner && owner !== orgId)
    return NextResponse.json({ error: "that installation is in use by another workspace" }, { status: 403 });

  if (!(await installationCanSee(body.installationId, body.repo)))
    return NextResponse.json({ error: "that installation cannot access that repo" }, { status: 403 });

  const id = crypto.randomUUID();
  await db.insert(schema.syncSource).values({
    id, organizationId: orgId, type: "github",
    repo: body.repo, branch: body.branch || "main", folder: body.folder || "",
    mount: body.mount || "/", installationId: body.installationId,
  });
  return NextResponse.json({ ok: true, id });
}

export async function POST(req: Request) {
  const body = await req.json() as Body;
  const access = await requireMember(body.org ?? "");
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const orgId = access.org.id;
  if (body.deleteId) return deleteSource(body, orgId);
  if (body.updateId) return updateSource(body, orgId);
  if (body.syncId) return syncNow(body, orgId);
  return createSource(body, orgId);
}
