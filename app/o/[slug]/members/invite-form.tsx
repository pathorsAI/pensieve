"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function InviteForm({ orgId }: { orgId: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input className="w-64" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Select value={role} onValueChange={(v) => setRole(v as "member" | "admin")}>
        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="member">member</SelectItem>
          <SelectItem value="admin">admin</SelectItem>
        </SelectContent>
      </Select>
      <Button disabled={busy || !email} onClick={async () => {
        setBusy(true);
        const r = await authClient.organization.inviteMember({ email, role, organizationId: orgId });
        setMsg(r.error ? `✗ ${r.error.message}` : "✓ invitation created — 重新整理看 accept link");
        setBusy(false);
      }}>{busy && <Loader2 className="size-3.5 animate-spin" />}Invite</Button>
      <span className="text-sm" style={{ color: "var(--ink-3)" }}>{msg}</span>
    </div>
  );
}
