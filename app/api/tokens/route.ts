import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";
import { requireMember } from "@/lib/access";

const sha256 = async (s: string) => {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
};

export async function POST(req: Request) {
  const { org: slug, name } = await req.json() as { org: string; name: string };
  const access = await requireMember(slug);
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const token = "pnsv_" + crypto.randomUUID().replace(/-/g, "");
  await db.insert(schema.apiToken).values({
    id: crypto.randomUUID(), organizationId: access.org.id, userId: access.user.id,
    name: name || "token", tokenHash: await sha256(token),
  });
  return NextResponse.json({ token }); // shown once
}

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("org") ?? "";
  const access = await requireMember(slug);
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rows = await db.select({
    id: schema.apiToken.id, name: schema.apiToken.name,
    createdAt: schema.apiToken.createdAt, lastUsedAt: schema.apiToken.lastUsedAt,
  }).from(schema.apiToken).where(eq(schema.apiToken.organizationId, access.org.id));
  return NextResponse.json({ tokens: rows });
}
