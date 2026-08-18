"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function InviteForm({ orgId }: { orgId: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [msg, setMsg] = useState("");
  return (
    <div className="row">
      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: 260 }} />
      <select value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")}>
        <option value="member">member</option><option value="admin">admin</option>
      </select>
      <button className="primary" onClick={async () => {
        const r = await authClient.organization.inviteMember({ email, role, organizationId: orgId });
        setMsg(r.error ? `✗ ${r.error.message}` : "✓ invitation created — 重新整理看 accept link");
      }}>Invite</button>
      <span style={{ fontSize: 13, color: "var(--ink-3)" }}>{msg}</span>
    </div>
  );
}
