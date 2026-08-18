import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { memberWorkspaces } from "@/lib/access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConsentForm, ContinueToLogin } from "./consent-form";

// What each requested scope actually buys the client, in plain words.
const SCOPES: Record<string, string> = {
  openid: "確認你的身分",
  profile: "讀取你的名稱與頭像",
  email: "讀取你的電子郵件地址",
  offline_access: "在你沒開著瀏覽器時繼續存取（可自動更新授權）",
};

type Params = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Consent({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const clientId = one(sp.client_id) ?? "";
  const scopes = (one(sp.scope) ?? "").split(" ").filter(Boolean);
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });

  if (!session) {
    return (
      <main className="page" style={{ maxWidth: 560, paddingTop: 100 }}>
        <div className="sub">pensieve</div>
        <h1>需要先登入</h1>
        <p style={{ color: "var(--ink-2)", margin: "10px 0 26px", lineHeight: 1.6 }}>
          這個授權請求還沒有登入的帳號，請重新登入後再繼續。
        </p>
        <ContinueToLogin />
      </main>
    );
  }

  // Names come from dynamic client registration, so they are self-asserted —
  // show the raw client_id next to it rather than instead of it.
  let client: { client_name?: string; client_uri?: string } = {};
  if (clientId) {
    try {
      client = (await auth.api.getOAuthClientPublic({ query: { client_id: clientId }, headers: h })) as typeof client;
    } catch {
      client = {};
    }
  }
  const workspaces = await memberWorkspaces(session.user.id);

  return (
    <main className="page" style={{ maxWidth: 620, paddingTop: 80 }}>
      <div className="sub">pensieve</div>
      <h1>授權存取</h1>
      <p style={{ color: "var(--ink-2)", margin: "10px 0 26px", lineHeight: 1.6 }}>
        <strong>{client.client_name || clientId || "未具名的應用程式"}</strong> 想要以 {session.user.email} 的身分
        讀取你的 workspace 文件。
      </p>

      <Card>
        <CardHeader><CardTitle>要求的權限</CardTitle></CardHeader>
        <CardContent>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, color: "var(--ink-2)" }}>
            {scopes.length === 0 && <li>基本身分（未要求額外權限）</li>}
            {scopes.map((s) => <li key={s}>{SCOPES[s] ?? s}</li>)}
            <li>搜尋、閱讀你所屬 workspace 的文件與連結關係</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>涵蓋的 workspace</CardTitle></CardHeader>
        <CardContent>
          {workspaces.length === 0 ? (
            <p style={{ color: "var(--ink-3)", margin: 0 }}>你目前沒有任何 workspace。</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, color: "var(--ink-2)" }}>
              {workspaces.map((w) => (
                <li key={w.id}>{w.name} <span className="mono text-xs" style={{ color: "var(--ink-3)" }}>{w.slug}</span></li>
              ))}
            </ul>
          )}
          <p className="text-sm mt-3" style={{ color: "var(--ink-3)", margin: "12px 0 0" }}>
            之後加入的 workspace 也會一併涵蓋。這個授權只能讀取，不能修改或刪除任何文件。
          </p>
        </CardContent>
      </Card>

      <ConsentForm />
      <p className="mono text-xs mt-5" style={{ color: "var(--ink-3)" }}>client_id: {clientId || "—"}</p>
    </main>
  );
}
