import type { Metadata } from "next";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import * as schema from "@/lib/schema";
import { signInMethods } from "@/lib/sign-in-methods";
import { AuthShell } from "@/components/auth/auth-shell";
import { AcceptPanel } from "./accept-client";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: t.accept.metaTitle, robots: { index: false } };
}

/**
 * Read straight from the tables rather than through better-auth: its
 * getInvitation endpoint requires the invitee to be signed in already, and the
 * signed-out visitor is exactly who needs to see which workspace and who sent it.
 */
async function findInvitation(id: string) {
  const rows = await db
    .select({
      email: schema.invitation.email,
      status: schema.invitation.status,
      expiresAt: schema.invitation.expiresAt,
      orgName: schema.organization.name,
      orgSlug: schema.organization.slug,
      inviterName: schema.user.name,
      inviterEmail: schema.user.email,
    })
    .from(schema.invitation)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.invitation.organizationId))
    .leftJoin(schema.user, eq(schema.user.id, schema.invitation.inviterId))
    .where(eq(schema.invitation.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export default async function Accept({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  const [{ locale, t }, invitation, session] = await Promise.all([
    getDict(),
    findInvitation(id),
    headers().then((h) => auth.api.getSession({ headers: h })),
  ]);
  const inviter = invitation ? invitation.inviterName || invitation.inviterEmail : null;

  if (!invitation || invitation.status !== "pending" || invitation.expiresAt.getTime() < Date.now()) {
    return (
      <AuthShell locale={locale} ctx={t.accept.ctx} title={t.accept.invalidTitle}
        lead={t.accept.invalidLead(inviter)} variant="missing" />
    );
  }

  const current = session?.user.email ?? null;
  let state: "signin" | "match" | "mismatch" = "signin";
  if (current) state = current.toLowerCase() === invitation.email.toLowerCase() ? "match" : "mismatch";

  return (
    <AuthShell
      locale={locale}
      ctx={`${t.accept.ctx} · ${invitation.orgSlug}`}
      title={t.accept.title(invitation.orgName)}
      lead={state === "mismatch"
        ? t.accept.mismatch(invitation.email, current ?? "")
        : t.accept.invitedBy(inviter ?? "", invitation.email)}
    >
      <AcceptPanel
        locale={locale}
        id={id}
        state={state}
        invitedEmail={invitation.email}
        currentEmail={current}
        orgSlug={invitation.orgSlug}
        methods={signInMethods()}
      />
    </AuthShell>
  );
}
