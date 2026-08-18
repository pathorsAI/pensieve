import { LoginPanel } from "./login-panel";

// The OAuth provider's `loginPage`. It exists purely so the authorization flow
// has somewhere to send an unauthenticated MCP client's browser — the app's own
// sign-in still lives on the root page.
export default function Login() {
  return (
    <main className="page" style={{ maxWidth: 460, paddingTop: 120 }}>
      <div className="sub">pensieve</div>
      <h1>登入</h1>
      <p style={{ color: "var(--ink-2)", margin: "10px 0 26px", lineHeight: 1.6 }}>
        登入後才能決定要不要把 workspace 的文件授權給提出要求的應用程式。
      </p>
      <LoginPanel />
    </main>
  );
}
