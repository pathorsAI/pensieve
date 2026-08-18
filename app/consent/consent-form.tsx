"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The signed authorization query must go back to the server byte-for-byte. */
const oauthQuery = () => (typeof window === "undefined" ? "" : window.location.search.slice(1));

export function ConsentForm() {
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
        window.location.href = data.url;
        return;
      }
      throw new Error("no redirect url");
    } catch {
      setBusy(null);
      setError("授權沒有完成，請回到用戶端重新連線一次。");
    }
  }

  return (
    <>
      <div className="flex gap-3 mt-6">
        <Button size="lg" disabled={busy !== null} onClick={() => decide(true)}>
          {busy === "accept" && <Loader2 className="size-4 animate-spin" />}允許存取
        </Button>
        <Button size="lg" variant="outline" disabled={busy !== null} onClick={() => decide(false)}>
          {busy === "deny" && <Loader2 className="size-4 animate-spin" />}拒絕
        </Button>
      </div>
      {error && <p className="text-sm mt-3" style={{ color: "var(--risk)" }}>{error}</p>}
    </>
  );
}

/** No session on the consent page means the flow lost its login; send it back. */
export function ContinueToLogin() {
  return (
    <Button size="lg" onClick={() => { window.location.href = `/login${window.location.search}`; }}>
      前往登入
    </Button>
  );
}
