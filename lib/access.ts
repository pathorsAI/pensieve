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

