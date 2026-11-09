import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";
import { markSyncStarted, runSync, verifyWebhook } from "@/lib/github";

/**
 * GitHub push → sync every source mounted from that repo/branch.
 *
 * The sync runs AFTER the response, in waitUntil. GitHub gives a delivery 10 s
 * before it gives up and drops the connection, and a sync that was still
 * running inside the request died with it — silently, since the outcome only
 * ever went into the response body nobody was reading any more (2026-11-09,
 * pathors-docs c8cce4e). Each source's outcome is recorded on its row by
 * runSync and shown on the settings page.
 */
export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verifyWebhook(req, body))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  const event = req.headers.get("x-github-event");
  if (event !== "push") return NextResponse.json({ ok: true, skipped: event });
  const payload = JSON.parse(body) as { repository: { full_name: string }; ref: string; after?: string; deleted?: boolean };
  if (!payload.ref.startsWith("refs/heads/") || payload.deleted) return NextResponse.json({ ok: true, skipped: "ref" });
  const branch = payload.ref.replace("refs/heads/", "");
  const sources = await db.select().from(schema.syncSource).where(and(
    eq(schema.syncSource.repo, payload.repository.full_name),
    eq(schema.syncSource.branch, branch),
  ));
  const commit = payload.after?.slice(0, 40) ?? null;
  // "running" is written before responding, so even a sync that is cut off
  // before its first await leaves a visible trace.
  await Promise.all(sources.map((s) => markSyncStarted(s.id, "push", commit)));
  const work = Promise.allSettled(sources.map((s) => runSync(s, "push", { commit, started: true })))
    .then((rs) => rs.forEach((r, i) => {
      if (r.status === "rejected") console.error(`sync ${sources[i].id} failed:`, r.reason);
    }));
  getCloudflareContext().ctx.waitUntil(work);
  return NextResponse.json({ ok: true, queued: sources.map((s) => s.id) }, { status: 202 });
}
