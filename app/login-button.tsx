"use client";
import { authClient } from "@/lib/auth-client";
export function LoginButton() {
  return (
    <button className="primary" onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/" })}>
      Sign in with Google
    </button>
  );
}
