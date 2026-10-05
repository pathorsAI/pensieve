"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { dictFor, type Locale } from "@/lib/i18n-dict";
import type { SignInMethod, SignInMethodId } from "@/lib/sign-in-methods";
import { Button } from "@/components/ui/button";

type Props = Readonly<{
  locale: Locale;
  methods: SignInMethod[];
  /** Where better-auth sends the browser after the provider returns. */
  callbackURL: string;
  /**
   * "social": the app's own sign-in. "oauth-provider": the MCP authorization
   * server's login page, which must resume the pending /oauth2/authorize
   * request instead of landing on callbackURL.
   */
  mode?: "social" | "oauth-provider";
}>;

export function SignInMethods({ locale, methods, callbackURL, mode = "social" }: Props) {
  const t = dictFor(locale);
  const [busy, setBusy] = useState<SignInMethodId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(id: SignInMethodId) {
    setBusy(id);
    setError(null);
    try {
      if (mode === "oauth-provider") {
        // The OAuth provider signs the pending authorization request into this
        // page's query string. Handing it back verbatim as `oauth_query` is what
        // lets better-auth resume /oauth2/authorize once the provider returns —
        // reserialising it would break the signature.
        const oauthQuery = globalThis.location.search.slice(1);
        const res = await fetch("/api/auth/sign-in/social", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider: id, callbackURL, ...(oauthQuery ? { oauth_query: oauthQuery } : {}) }),
        });
        const data = (await res.json()) as { url?: string };
        if (!data?.url) throw new Error("no redirect url");
        globalThis.location.href = data.url;
      } else {
        const r = await authClient.signIn.social({ provider: id, callbackURL });
        if (r.error) throw new Error(r.error.message);
      }
      // Success means the browser is navigating away; leave the spinner on.
    } catch {
      setBusy(null);
      setError(t.common.signInFailed);
    }
  }

  if (methods.length === 0) return <p className="auth-fine">{t.common.noMethods}</p>;

  return (
    <div className="auth-methods">
      {methods.map((m) => (
        <Button key={m.id} type="button" variant="outline" size="lg" className="w-full"
          disabled={busy !== null} onClick={() => start(m.id)}>
          {busy === m.id ? <Loader2 className="size-4 animate-spin" /> : <MethodIcon id={m.id} />}
          {t.methods[m.id]}
        </Button>
      ))}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>
  );
}

function MethodIcon({ id }: Readonly<{ id: SignInMethodId }>) {
  switch (id) {
    case "google":
      return <GoogleG />;
  }
}

/** Google's multicolour "G", inlined so the sign-in page loads nothing third-party. */
function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.4-.2-2.1H12v4h6a5.2 5.2 0 0 1-2.2 3.4v2.8h3.6c2.1-1.9 3.2-4.8 3.2-8.1z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.9A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.7 14c-.2-.7-.4-1.4-.4-2s.1-1.4.4-2V7.1H2A11 11 0 0 0 1 12c0 1.8.4 3.4 1 4.9L5.7 14z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2 7.1L5.7 10C6.6 7.4 9.1 5.4 12 5.4z" />
    </svg>
  );
}
