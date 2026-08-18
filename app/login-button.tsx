"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function LoginButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button size="lg" disabled={busy} onClick={() => {
      setBusy(true);
      authClient.signIn.social({ provider: "google", callbackURL: "/" });
    }}>{busy && <Loader2 className="size-4 animate-spin" />}Sign in with Google</Button>
  );
}
