import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireMember } from "@/lib/access";
import { db } from "@/lib/db";
import { backfillAutomaticMemberships } from "@/lib/domain-access";
import { normalizeDomain } from "@/lib/domain";
import * as schema from "@/lib/schema";

const canManage = (role: string) => role === "owner" || role === "admin";

async function accessFor(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("org") ?? "";
  const access = slug ? await requireMember(slug) : null;
  return { slug, access };
}

export async function GET(request: NextRequest) {
  const { access } = await accessFor(request);
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const domains = await db.select({
    id: schema.organizationDomain.id,
    domain: schema.organizationDomain.domain,
    autoJoin: schema.organizationDomain.autoJoin,
  }).from(schema.organizationDomain)
    .where(eq(schema.organizationDomain.organizationId, access.org.id));
  return NextResponse.json({ domains, canManage: canManage(access.role) });
}

export async function POST(request: NextRequest) {
  const { access } = await accessFor(request);
  if (!access || !canManage(access.role)) {
    return NextResponse.json({ error: "owner or admin required" }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { domain?: unknown; autoJoin?: unknown } | null;
  const domain = typeof body?.domain === "string" ? normalizeDomain(body.domain) : null;
  if (!domain) return NextResponse.json({ error: "invalid domain" }, { status: 400 });

  const existing = await db.select({ organizationId: schema.organizationDomain.organizationId })
    .from(schema.organizationDomain)
    .where(eq(schema.organizationDomain.domain, domain))
    .limit(1);
  if (existing.length && existing[0].organizationId !== access.org.id) {
    return NextResponse.json({ error: "domain belongs to another workspace" }, { status: 409 });
  }

  await db.insert(schema.organizationDomain).values({
    id: crypto.randomUUID(), organizationId: access.org.id, domain, autoJoin: body?.autoJoin !== false,
  }).onConflictDoUpdate({
    target: schema.organizationDomain.domain,
    set: { autoJoin: body?.autoJoin !== false },
  });
  const added = body?.autoJoin === false ? 0 : await backfillAutomaticMemberships(access.org.id, domain);
  return NextResponse.json({ ok: true, matchedUsers: added });
}

export async function DELETE(request: NextRequest) {
  const { access } = await accessFor(request);
  if (!access || !canManage(access.role)) {
    return NextResponse.json({ error: "owner or admin required" }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  if (typeof body?.id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(schema.organizationDomain).where(and(
    eq(schema.organizationDomain.id, body.id),
    eq(schema.organizationDomain.organizationId, access.org.id),
  ));
  return NextResponse.json({ ok: true });
}
