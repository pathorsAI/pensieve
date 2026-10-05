"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { dictFor, type Locale } from "@/lib/i18n-dict";
import type { SignInMethod } from "@/lib/sign-in-methods";
import { Button } from "@/components/ui/button";
import { AccountChip } from "@/components/auth/account-chip";
import { SignInMethods } from "@/components/auth/sign-in-methods";

type Props = Readonly<{
  locale: Locale;
  id: string;
  /** signin: no session · match: signed in as the invitee · mismatch: signed in as someone else. */
  state: "signin" | "match" | "mismatch";
  invitedEmail: string;
  currentEmail: string | null;
  orgSlug: string;
  methods: SignInMethod[];
}>;

export function AcceptPanel({ locale, id, state, invitedEmail, currentEmail, orgSlug, methods }: Props) {
  const t = dictFor(locale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Every sign-in from here comes back to this invitation.
  const callbackURL = `/accept/${encodeURIComponent(id)}`;

  if (state === "signin") {
    return (
      <>
        <SignInMethods locale={locale} methods={methods} callbackURL={callbackURL} />
        <p className="auth-fine">{t.accept.signInFine(invitedEmail)}</p>
      </>
    );
  }

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const r = await authClient.organization.acceptInvitation({ invitationId: id });
      if (r.error) throw new Error(r.error.message);
      globalThis.location.href = `/o/${orgSlug}`;
    } catch (e) {
      // The server's reason is English-only; keep it for debugging, show the localised line.
      console.error("[accept]", e);
      setBusy(false);
      setError(t.accept.acceptFailed);
    }
  }

  async function switchAccount() {
    setBusy(true);
    setError(null);
    try {
      await authClient.signOut();
      const r = await authClient.signIn.social({ provider: "google", callbackURL });
      if (r.error) throw new Error(r.error.message);
    } catch {
      setBusy(false);
      setError(t.common.signInFailed);
    }
  }

  return (
    <>
      {currentEmail && <AccountChip email={currentEmail} caption={t.common.currentAccount} />}
      <div className="auth-methods">
        {state === "match" ? (
          <Button type="button" size="lg" className="w-full" disabled={busy} onClick={accept}>
            {busy && <Loader2 className="size-4 animate-spin" />}{t.accept.accept}
          </Button>
        ) : (
          <Button type="button" size="lg" className="w-full" disabled={busy} onClick={switchAccount}>
            {busy && <Loader2 className="size-4 animate-spin" />}{t.common.switchAccount}
          </Button>
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}
      </div>
    </>
  );
}
