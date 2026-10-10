import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import * as schema from "@/lib/schema";
import { signInMethods } from "@/lib/sign-in-methods";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInMethods } from "@/components/auth/sign-in-methods";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: t.home.metaTitle };
}

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    const emailDomain = session.user.email.split("@").at(-1)?.toLowerCase() ?? "";
    const activeOrganizationId = session.session.activeOrganizationId;
    const orgs = await db
      .select({ slug: schema.organization.slug })
      .from(schema.member)
      .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
      .leftJoin(schema.organizationDomain, and(
        eq(schema.organizationDomain.organizationId, schema.organization.id),
        eq(schema.organizationDomain.domain, emailDomain),
        eq(schema.organizationDomain.autoJoin, true),
      ))
      .where(eq(schema.member.userId, session.user.id))
      .orderBy(
        desc(sql<number>`case when ${schema.organization.id} = ${activeOrganizationId ?? ""} then 1 else 0 end`),
        desc(sql<number>`case when ${schema.organizationDomain.id} is not null then 1 else 0 end`),
        asc(schema.organization.slug),
      )
      .limit(1);
    if (orgs.length) redirect(`/o/${orgs[0].slug}`);
  }
  const { locale, t } = await getDict();
  return (
    <AuthShell locale={locale} ctx={t.home.ctx} title={t.home.title}>
      <SignInMethods locale={locale} methods={signInMethods()} callbackURL="/" />
    </AuthShell>
  );
}
