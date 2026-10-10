import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { domainFromEmail } from "./domain";
import * as schema from "./schema";

/**
 * Idempotently enroll a verified user in every workspace that claims their
 * exact email domain. Returns the matching organization ids, even if the user
 * was already a member.
 */
export async function ensureAutomaticMemberships(userId: string): Promise<string[]> {
  const users = await db
    .select({ email: schema.user.email, verified: schema.user.emailVerified })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);
  const account = users[0];
  if (!account?.verified) return [];

  const domain = domainFromEmail(account.email);
  if (!domain) return [];

  const matches = await db
    .select({ organizationId: schema.organizationDomain.organizationId })
    .from(schema.organizationDomain)
    .where(and(
      eq(schema.organizationDomain.domain, domain),
      eq(schema.organizationDomain.autoJoin, true),
    ));

  for (const match of matches) {
    await db.insert(schema.member).values({
      id: crypto.randomUUID(),
      organizationId: match.organizationId,
      userId,
      role: "member",
    }).onConflictDoNothing({
      target: [schema.member.organizationId, schema.member.userId],
    });
  }

  return matches.map((match) => match.organizationId);
}

/** Enroll existing verified accounts when an administrator enables a domain. */
export async function backfillAutomaticMemberships(organizationId: string, domain: string): Promise<number> {
  const users = await db.select({ id: schema.user.id })
    .from(schema.user)
    .where(and(
      eq(schema.user.emailVerified, true),
      sql`lower(split_part(${schema.user.email}, '@', 2)) = ${domain}`,
    ));

  for (const account of users) {
    await db.insert(schema.member).values({
      id: crypto.randomUUID(), organizationId, userId: account.id, role: "member",
    }).onConflictDoNothing({
      target: [schema.member.organizationId, schema.member.userId],
    });
  }
  return users.length;
}
