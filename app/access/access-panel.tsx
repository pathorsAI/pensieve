"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

type Props = Readonly<{
  next: string;
  slug: string | null;
  email: string | null;
  workspaces: { slug: string; name: string }[];
}>;

export function AccessPanel({ next, slug, email, workspaces }: Props) {
  const [busy, setBusy] = useState<"signin" | "switch" | "signout" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A document embedded in the workspace shell (?embed=1) can land here when
  // the session expires. Google refuses to render inside a frame, so take over
  // the whole tab first.
  useEffect(() => {
    try {
      if (globalThis.top && globalThis.top !== globalThis.self) globalThis.top.location.href = globalThis.location.href;
    } catch { /* cross-origin parent: stay put */ }
  }, []);

  // Come back through /access, not straight to `next`: if the chosen account
  // still is not a member, the reader sees this page again with the reason.
  const callbackURL = `/access?next=${encodeURIComponent(next)}`;

  async function signIn(kind: "signin" | "switch") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "switch") await authClient.signOut();
      const r = await authClient.signIn.social({ provider: "google", callbackURL });
      if (r.error) throw new Error(r.error.message);
    } catch {
      setBusy(null);
      setError("登入失敗，請重新整理後再試一次。");
    }
  }

  async function signOut() {
    setBusy("signout");
    await authClient.signOut();
    globalThis.location.reload();
  }

  const target = slug ? <span className="whitespace-nowrap">「{slug}」</span> : "這個頁面";

  return (
    <main className="page" style={{ maxWidth: 480, paddingTop: 120 }}>
      <div className="sub">pensieve</div>
      {email ? (
        <>
          <h1>沒有權限</h1>
          <p style={{ color: "var(--ink-2)", margin: "10px 0 26px", lineHeight: 1.7 }}>
            你目前登入的是 <strong style={{ color: "var(--ink)" }}>{email}</strong>，不是{target}的成員。{""}
            換一個帳號登入，或請 workspace 的管理員邀請這個帳號。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" disabled={busy !== null} onClick={() => signIn("switch")}>
              {busy === "switch" && <Loader2 className="size-4 animate-spin" />}換一個帳號登入
            </Button>
            <Button size="lg" variant="outline" disabled={busy !== null} onClick={signOut}>
              {busy === "signout" && <Loader2 className="size-4 animate-spin" />}登出
            </Button>
          </div>
          {workspaces.length > 0 && (
            <div style={{ marginTop: 36 }}>
              <div className="sub" style={{ marginBottom: 8 }}>你可以進入的 workspace</div>
              <ul className="flex flex-col" style={{ borderTop: "1px solid var(--rule-soft)" }}>
                {workspaces.map((w) => (
                  <li key={w.slug} style={{ borderBottom: "1px solid var(--rule-soft)" }}>
                    <a href={`/o/${w.slug}`} className="flex justify-between gap-4 py-2.5 text-sm hover:underline"
                      style={{ color: "var(--ink)" }}>
                      <span>{w.name}</span>
                      <span className="mono" style={{ color: "var(--ink-3)" }}>{w.slug}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <>
          <h1>登入以繼續</h1>
          <p style={{ color: "var(--ink-2)", margin: "10px 0 26px", lineHeight: 1.7 }}>
            {target}只有 workspace 的成員看得到。用受邀的 Google 帳號登入後，會直接回到原本的頁面。
          </p>
          <Button size="lg" disabled={busy !== null} onClick={() => signIn("signin")}>
            {busy === "signin" && <Loader2 className="size-4 animate-spin" />}使用 Google 登入
          </Button>
        </>
      )}
      {error && <p className="text-sm mt-3" style={{ color: "var(--risk)" }}>{error}</p>}
    </main>
  );
}
