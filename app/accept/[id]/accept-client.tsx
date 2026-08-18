"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AcceptClient({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const { data: session, isPending } = authClient.useSession();
  return (
    <main className="page flex justify-center" style={{ paddingTop: 120 }}>
      <Card className="w-[400px]">
        <CardHeader>
          <div className="sub">pensieve</div>
          <CardTitle className="text-xl" style={{ fontFamily: "var(--serif)" }}>Join workspace</CardTitle>
        </CardHeader>
        <CardContent>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : !session ? (
            <Button disabled={busy} onClick={() => { setBusy(true);
              authClient.signIn.social({ provider: "google", callbackURL: `/accept/${id}` }); }}>
              {busy && <Loader2 className="size-4 animate-spin" />}Sign in with Google first</Button>
          ) : (
            <Button disabled={busy} onClick={async () => {
              setBusy(true);
              const r = await authClient.organization.acceptInvitation({ invitationId: id });
              if (r.error) { setMsg(`✗ ${r.error.message}`); setBusy(false); } else location.href = "/";
            }}>{busy && <Loader2 className="size-4 animate-spin" />}Accept invitation</Button>
          )}
          <p className="mt-3 text-sm" style={{ color: "var(--risk)" }}>{msg}</p>
        </CardContent>
      </Card>
    </main>
  );
}
