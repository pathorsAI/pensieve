import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";
import { requireMember } from "@/lib/access";
import { newShareToken, shareUrl } from "@/lib/share";

/** GET /api/shares?org=<slug> — every live share in the workspace. */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("org") ?? "";
  const access = await requireMember(slug);
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await db
    .select({ id: schema.share.id, path: schema.share.documentPath,
      createdAt: schema.share.createdAt, expiresAt: schema.share.expiresAt })
    .from(schema.share)
    .where(eq(schema.share.organizationId, access.org.id));

  return NextResponse.json({ shares: rows.map((r) => ({ ...r, url: shareUrl(r.id) })) });
}

/**
 * POST /api/shares
 *   { org, path }              -> create (or return the existing) share link
 *   { org, path, revoke:true } -> revoke; the token dies with the row
 *
 * Any member may share, matching the rest of the app — no route checks
 * member.role today. If publishing should be owner-only, this is the place.
 */
export async function POST(req: Request) {
  const body = await req.json() as { org?: string; path?: string; revoke?: boolean };
  const access = await requireMember(body.org ?? "");
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const path = (body.path ?? "").replace(/\.(html|md)$/, "");
  if (!path.startsWith("/")) return NextResponse.json({ error: "bad path" }, { status: 400 });

  const owned = and(eq(schema.share.organizationId, access.org.id),
    eq(schema.share.documentPath, path));

  if (body.revoke) {
    await db.delete(schema.share).where(owned);
    return NextResponse.json({ ok: true, revoked: true });
  }

  // only documents that exist may be shared — otherwise a typo mints a live
  // token pointing at a path a later sync could fill in
  const docs = await db.select({ id: schema.document.id }).from(schema.document)
    .where(and(eq(schema.document.organizationId, access.org.id),
      eq(schema.document.path, path))).limit(1);
  if (!docs.length) return NextResponse.json({ error: "no such document" }, { status: 404 });

  const existing = await db.select({ id: schema.share.id }).from(schema.share).where(owned).limit(1);
  if (existing.length) return NextResponse.json({ token: existing[0].id, url: shareUrl(existing[0].id) });

  const token = newShareToken();
  await db.insert(schema.share).values({
    id: token, organizationId: access.org.id, documentPath: path,
    visibility: "link", createdBy: access.user.id,
  });
  return NextResponse.json({ token, url: shareUrl(token) });
}
