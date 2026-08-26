import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";
import { requireMember } from "@/lib/access";
import { appJwt } from "@/lib/github";

// Lists the GitHub App's installations and their repos, so the settings UI can
// offer a repo picker instead of hand-typed ids.
//
// Scoped to one workspace: the App's installation list is global, and the repo
// names inside it are the private inventory of whoever installed it. Only
// installations this workspace already uses, or that no workspace has claimed
// yet, are returned — matching what POST /api/sources will actually accept.
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("org") ?? "";
  const access = await requireMember(slug);
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.GITHUB_APP_ID) return NextResponse.json({ installations: [], appMissing: true });

  const claimed = new Map<string, string>();
  for (const r of await db
    .select({ installationId: schema.syncSource.installationId,
      organizationId: schema.syncSource.organizationId })
    .from(schema.syncSource)) {
    if (r.installationId) claimed.set(r.installationId, r.organizationId);
  }

  const jwt = await appJwt();
  const gh = { Accept: "application/vnd.github+json", "User-Agent": "pensieve" };
  const appRes = await fetch("https://api.github.com/app", { headers: { ...gh, Authorization: `Bearer ${jwt}` } });
  const appSlug = appRes.ok ? (await appRes.json() as { slug: string }).slug : null;
  const res = await fetch("https://api.github.com/app/installations", {
    headers: { ...gh, Authorization: `Bearer ${jwt}` } });
  if (!res.ok) return NextResponse.json({ error: `github ${res.status}` }, { status: 502 });
  const insts = await res.json() as { id: number; account: { login: string } }[];

  const out = [];
  for (const inst of insts) {
    const claimant = claimed.get(String(inst.id));
    if (claimant && claimant !== access.org.id) continue;
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
  return NextResponse.json({ installations: out, appSlug });
}
