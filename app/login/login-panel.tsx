"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoginPanel() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    // The OAuth provider signs the pending authorization request into this page's
    // query string. Handing it back verbatim as `oauth_query` is what lets
    // better-auth resume /oauth2/authorize once Google returns — reserialising it
    // would break the signature.
    const oauthQuery = window.location.search.slice(1);
    try {
      const res = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          callbackURL: "/",
          ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
        }),
      });
      const data = (await res.json()) as { url?: string };
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("no redirect url");
    } catch {
      setBusy(false);
      setError("登入失敗，請重新整理後再試一次。");
    }
  }

  return (
    <>
      <Button size="lg" disabled={busy} onClick={signIn}>
        {busy && <Loader2 className="size-4 animate-spin" />}使用 Google 登入
      </Button>
      {error && <p className="text-sm mt-3" style={{ color: "var(--risk)" }}>{error}</p>}
    </>
  );
}
