import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { appJwt } from "@/lib/github";

// Lists the GitHub App's installations and their repos, so the settings UI can
// offer a repo picker instead of hand-typed ids.
// NOTE: session-gated but app-wide — fine for a self-hosted/team deployment,
// too broad for an open multi-tenant SaaS (see README trust model).
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.GITHUB_APP_ID) return NextResponse.json({ installations: [], appMissing: true });

  const jwt = await appJwt();
  const gh = { Accept: "application/vnd.github+json", "User-Agent": "pensieve" };
  const res = await fetch("https://api.github.com/app/installations", {
    headers: { ...gh, Authorization: `Bearer ${jwt}` } });
  if (!res.ok) return NextResponse.json({ error: `github ${res.status}` }, { status: 502 });
  const insts = await res.json() as { id: number; account: { login: string } }[];

  const out = [];
  for (const inst of insts) {
    const tok = await fetch(`https://api.github.com/app/installations/${inst.id}/access_tokens`, {
      method: "POST", headers: { ...gh, Authorization: `Bearer ${jwt}` } });
    if (!tok.ok) continue;
    const { token } = await tok.json() as { token: string };
    const repos = await fetch("https://api.github.com/installation/repositories?per_page=100", {
      headers: { ...gh, Authorization: `Bearer ${token}` } });
    const list = repos.ok ? (await repos.json() as { repositories: { full_name: string; default_branch: string }[] }).repositories : [];
    out.push({ installationId: String(inst.id), account: inst.account.login,
      repos: list.map((r) => ({ fullName: r.full_name, defaultBranch: r.default_branch })) });
  }
  return NextResponse.json({ installations: out });
}
