import type { Metadata } from "next";
import { getDict } from "@/lib/i18n";
import { signInMethods } from "@/lib/sign-in-methods";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInMethods } from "@/components/auth/sign-in-methods";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: t.login.metaTitle, robots: { index: false } };
}

// The OAuth provider's `loginPage`. It exists purely so the authorization flow
// has somewhere to send an unauthenticated MCP client's browser — the app's own
// sign-in still lives on the root page.
export default async function Login() {
  const { locale, t } = await getDict();
  return (
    <AuthShell locale={locale} ctx={t.login.ctx} title={t.login.title} lead={t.login.lead}>
      <SignInMethods locale={locale} methods={signInMethods()} callbackURL="/" mode="oauth-provider" />
    </AuthShell>
  );
}
