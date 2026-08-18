import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";
import { LoginButton } from "./login-button";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    const orgs = await db
      .select({ slug: schema.organization.slug })
      .from(schema.member)
      .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
      .where(eq(schema.member.userId, session.user.id))
      .limit(1);
    if (orgs.length) redirect(`/o/${orgs[0].slug}`);
  }
  return (
    <main className="page" style={{ maxWidth: 560, paddingTop: 120 }}>
      <div className="sub">pensieve</div>
      <h1>Fly between your documents.</h1>
      <p style={{ color: "var(--ink-2)", margin: "10px 0 26px", lineHeight: 1.6 }}>
        An HTML-first knowledge base. Sync folders and repos into a workspace,
        get a living graph of everything your team knows.
      </p>
      <LoginButton />
    </main>
  );
}
