"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { dictFor, type Locale } from "@/lib/i18n-dict";
import { Button } from "@/components/ui/button";

/** The signed authorization query must go back to the server byte-for-byte. */
const oauthQuery = () => (globalThis.window === undefined ? "" : globalThis.location.search.slice(1));

export function ConsentForm({ locale }: Readonly<{ locale: Locale }>) {
  const t = dictFor(locale);
  const [busy, setBusy] = useState<"accept" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(accept: boolean) {
    setBusy(accept ? "accept" : "deny");
    setError(null);
    try {
      const res = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accept, oauth_query: oauthQuery() }),
      });
      const data = (await res.json()) as { url?: string; redirect?: boolean };
      if (data?.url) {
        globalThis.location.href = data.url;
        return;
      }
      throw new Error("no redirect url");
    } catch {
      setBusy(null);
      setError(t.consent.failed);
    }
  }

  return (
    <div className="auth-methods">
      <Button type="button" size="lg" className="w-full" disabled={busy !== null} onClick={() => decide(true)}>
        {busy === "accept" && <Loader2 className="size-4 animate-spin" />}{t.consent.allow}
      </Button>
      <Button type="button" size="lg" variant="outline" className="w-full" disabled={busy !== null} onClick={() => decide(false)}>
        {busy === "deny" && <Loader2 className="size-4 animate-spin" />}{t.consent.deny}
      </Button>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>
  );
}

/** No session on the consent page means the flow lost its login; send it back. */
export function ContinueToLogin({ locale }: Readonly<{ locale: Locale }>) {
  return (
    <Button type="button" size="lg" className="w-full"
      onClick={() => { globalThis.location.href = `/login${globalThis.location.search}`; }}>
      {dictFor(locale).consent.continueToLogin}
    </Button>
  );
}
