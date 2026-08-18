import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import * as schema from "./schema";

/** Session-based access: returns { user, org } iff the caller is a member of the org slug. */
export async function requireMember(slug: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const rows = await db
    .select({ org: schema.organization, role: schema.member.role })
    .from(schema.organization)
    .innerJoin(schema.member, eq(schema.member.organizationId, schema.organization.id))
    .where(and(eq(schema.organization.slug, slug), eq(schema.member.userId, session.user.id)))
    .limit(1);
  if (!rows.length) return null;
  return { user: session.user, org: rows[0].org, role: rows[0].role };
}

/** Token-based access for the sync API. */
export async function orgFromToken(req: Request) {
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bearer));
  const hash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const rows = await db.select().from(schema.apiToken).where(eq(schema.apiToken.tokenHash, hash)).limit(1);
  if (!rows.length) return null;
  await db.update(schema.apiToken).set({ lastUsedAt: new Date() }).where(eq(schema.apiToken.id, rows[0].id));
  return rows[0];
}
