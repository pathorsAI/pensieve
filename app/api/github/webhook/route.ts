import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";
import { syncGithubSource, verifyWebhook } from "@/lib/github";

export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verifyWebhook(req, body))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  const event = req.headers.get("x-github-event");
  if (event !== "push") return NextResponse.json({ ok: true, skipped: event });
  const payload = JSON.parse(body) as { repository: { full_name: string }; ref: string };
  const branch = payload.ref.replace("refs/heads/", "");
  const sources = await db.select().from(schema.syncSource).where(and(
    eq(schema.syncSource.repo, payload.repository.full_name),
    eq(schema.syncSource.branch, branch),
  ));
  const results = [];
  for (const s of sources) {
    try { results.push({ id: s.id, ...(await syncGithubSource(s)) }); }
    catch (e) { results.push({ id: s.id, error: String(e) }); }
  }
  return NextResponse.json({ ok: true, results });
}
