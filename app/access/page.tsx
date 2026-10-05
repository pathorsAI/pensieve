import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { memberWorkspaces, safeNext, workspaceSlugOf } from "@/lib/access";
import { getDict } from "@/lib/i18n";
import { signInMethods } from "@/lib/sign-in-methods";
import { AuthShell } from "@/components/auth/auth-shell";
import { AccessPanel } from "./access-panel";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: t.access.metaTitle, robots: { index: false } };
}

// Landing spot for every member-gated page that turned the caller away. It is
// also the post-login callback, so a sign-in that lands on an account outside
// the workspace shows the switch-account state instead of another dead end.
export default async function Access({ searchParams }: Readonly<{ searchParams: Promise<{ next?: string }> }>) {
  const { next: raw } = await searchParams;
  const next = safeNext(raw);
  const slug = workspaceSlugOf(next);
  const session = await auth.api.getSession({ headers: await headers() });
  const workspaces = session ? await memberWorkspaces(session.user.id) : [];
  if (session && (!slug || workspaces.some((w) => w.slug === slug))) redirect(next);

  const { locale, t } = await getDict();
  const email = session?.user.email ?? null;
  const ctx = (label: string) => (slug ? `${label} · ${slug}` : label);
  return (
    <AuthShell
      locale={locale}
      ctx={email ? ctx(t.access.ctxDenied) : ctx(t.access.ctxSignIn)}
      title={email ? t.access.deniedTitle : t.access.signInTitle}
      lead={email ? undefined : t.access.signInLead(slug)}
      variant={email ? "missing" : "default"}
    >
      <AccessPanel
        locale={locale}
        next={next}
        email={email}
        methods={signInMethods()}
        workspaces={workspaces.map((w) => ({ slug: w.slug, name: w.name }))}
      />
    </AuthShell>
  );
}
