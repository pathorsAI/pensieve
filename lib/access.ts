import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import * as schema from "./schema";

export type Workspace = { id: string; slug: string; name: string };

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

/**
 * userId-based counterpart of requireMember, for callers that authenticated out
 * of band (MCP bearer tokens) and never had a browser session.
 */
export async function requireMemberOf(userId: string, slug: string): Promise<Workspace | null> {
  const rows = await db
    .select({ id: schema.organization.id, slug: schema.organization.slug, name: schema.organization.name })
    .from(schema.organization)
    .innerJoin(schema.member, eq(schema.member.organizationId, schema.organization.id))
    .where(and(eq(schema.organization.slug, slug), eq(schema.member.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Every workspace the user belongs to, alphabetically by slug. */
export async function memberWorkspaces(userId: string): Promise<Workspace[]> {
  return db
    .select({ id: schema.organization.id, slug: schema.organization.slug, name: schema.organization.name })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
    .where(eq(schema.member.userId, userId))
    .orderBy(schema.organization.slug);
}
