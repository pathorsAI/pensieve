"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { dictFor, type Locale } from "@/lib/i18n-dict";
import type { SignInMethod } from "@/lib/sign-in-methods";
import { Button } from "@/components/ui/button";
import { AccountChip } from "@/components/auth/account-chip";
import { SignInMethods } from "@/components/auth/sign-in-methods";

type Props = Readonly<{
  locale: Locale;
  next: string;
  email: string | null;
  methods: SignInMethod[];
  workspaces: { slug: string; name: string }[];
}>;

export function AccessPanel({ locale, next, email, methods, workspaces }: Props) {
  const t = dictFor(locale);
  const [busy, setBusy] = useState<"switch" | "signout" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A document embedded in the workspace shell (?embed=1) can land here when
  // the session expires. Google refuses to render inside a frame, so take over
  // the whole tab first.
  useEffect(() => {
    try {
      if (globalThis.top && globalThis.top !== globalThis.self) globalThis.top.location.href = globalThis.location.href;
    } catch { /* cross-origin parent: stay put */ }
  }, []);

  // Come back through /access, not straight to `next`: if the chosen account
  // still is not a member, the reader sees this page again with the reason.
  const callbackURL = `/access?next=${encodeURIComponent(next)}`;

  if (!email) {
    return (
      <>
        <SignInMethods locale={locale} methods={methods} callbackURL={callbackURL} />
        <p className="auth-fine">{t.access.signInFine}</p>
      </>
    );
  }

  async function switchAccount() {
    setBusy("switch");
    setError(null);
    try {
      await authClient.signOut();
      const r = await authClient.signIn.social({ provider: "google", callbackURL });
      if (r.error) throw new Error(r.error.message);
    } catch {
      setBusy(null);
      setError(t.common.signInFailed);
    }
  }

  async function signOut() {
    setBusy("signout");
    await authClient.signOut();
    globalThis.location.reload();
  }

  return (
    <>
      <AccountChip email={email} caption={t.common.currentAccount} />
      <div className="auth-methods">
        <Button type="button" size="lg" className="w-full" disabled={busy !== null} onClick={switchAccount}>
          {busy === "switch" && <Loader2 className="size-4 animate-spin" />}{t.common.switchAccount}
        </Button>
        <Button type="button" size="lg" variant="ghost" className="w-full" disabled={busy !== null} onClick={signOut}>
          {busy === "signout" && <Loader2 className="size-4 animate-spin" />}{t.common.signOut}
        </Button>
        {error && <p className="auth-error" role="alert">{error}</p>}
      </div>
      {workspaces.length > 0 && (
        <div>
          <div className="auth-label">{t.access.workspacesLabel}</div>
          <div className="auth-list">
            {workspaces.map((w) => (
              <a key={w.slug} href={`/o/${w.slug}`}>
                <span>{w.name}</span>
                <span>{w.slug}</span>
              </a>
            ))}
          </div>
        </div>
      )}
      <p className="auth-fine">{t.access.deniedFine(email)}</p>
    </>
  );
}
