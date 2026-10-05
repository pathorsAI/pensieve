import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { memberWorkspaces } from "@/lib/access";
import { getDict } from "@/lib/i18n";
import { AuthShell } from "@/components/auth/auth-shell";
import { ContinueToLogin } from "./consent-form";
import { ConsentDetails } from "./consent-details";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: t.consent.metaTitle, robots: { index: false } };
}

type Params = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Consent({ searchParams }: Readonly<{ searchParams: Params }>) {
  const sp = await searchParams;
  const clientId = one(sp.client_id) ?? "";
  const scopes = (one(sp.scope) ?? "").split(" ").filter(Boolean);
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const { locale, t } = await getDict();

  if (!session) {
    return (
      <AuthShell locale={locale} ctx={t.consent.ctx} title={t.consent.needLoginTitle} lead={t.consent.needLoginLead}>
        <ContinueToLogin locale={locale} />
      </AuthShell>
    );
  }

  // Names come from dynamic client registration, so they are self-asserted —
  // show the raw client_id next to it rather than instead of it.
  let client: { client_name?: string; client_uri?: string } = {};
  if (clientId) {
    try {
      client = (await auth.api.getOAuthClientPublic({ query: { client_id: clientId }, headers: h })) as typeof client;
    } catch {
      client = {};
    }
  }
  const workspaces = await memberWorkspaces(session.user.id);

  return (
    <AuthShell
      locale={locale}
      ctx={t.consent.ctx}
      title={t.consent.title}
      lead={t.consent.lead(client.client_name || clientId || t.consent.unnamedClient, session.user.email)}
    >
      <ConsentDetails locale={locale} scopes={scopes} workspaces={workspaces} clientId={clientId} />
    </AuthShell>
  );
}
