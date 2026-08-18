"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function AcceptClient({ id }: { id: string }) {
  const [msg, setMsg] = useState("");
  const { data: session, isPending } = authClient.useSession();
  return (
    <main className="page" style={{ maxWidth: 480, paddingTop: 120 }}>
      <div className="sub">pensieve</div>
      <h1>Join workspace</h1>
      {isPending ? <p>…</p> : !session ? (
        <button className="primary" style={{ marginTop: 14 }}
          onClick={() => authClient.signIn.social({ provider: "google", callbackURL: `/accept/${id}` })}>
          Sign in with Google first
        </button>
      ) : (
        <button className="primary" style={{ marginTop: 14 }} onClick={async () => {
          const r = await authClient.organization.acceptInvitation({ invitationId: id });
          if (r.error) setMsg(`✗ ${r.error.message}`); else location.href = "/";
        }}>Accept invitation</button>
      )}
      <p style={{ marginTop: 12, color: "var(--risk)" }}>{msg}</p>
    </main>
  );
}
