import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./schema";
import { extractMeta, plainText } from "./extract";
import { mdToHtml } from "./markdown";
import { byteBatches, changedEntries, WRITE_BUDGET_BYTES } from "./sync-plan";

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  // btoa only ever pads with a run of trailing "=", so trimming it with a loop
  // is equivalent to /=+$/ without that pattern's backtracking.
  let s = btoa(String.fromCodePoint(...new Uint8Array(buf as ArrayBuffer)));
  while (s.endsWith("=")) s = s.slice(0, -1);
  return s.replaceAll("+", "-").replaceAll("/", "_");
};

/** RS256-signed GitHub App JWT. GITHUB_APP_PRIVATE_KEY must be PKCS#8
 *  (convert GitHub's download once: openssl pkcs8 -topk8 -nocrypt -in app.pem). */
export async function appJwt(): Promise<string> {
  const pem = process.env.GITHUB_APP_PRIVATE_KEY!;
  const der = Uint8Array.from(atob(pem.replaceAll(/-----[^-]+-----/g, "").replaceAll(/\s/g, "")), (c) => c.codePointAt(0)!);
  const key = await crypto.subtle.importKey("pkcs8", der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const body = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iat: now - 60, exp: now + 540, iss: process.env.GITHUB_APP_ID })}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(body));
  return `${body}.${b64url(sig)}`;
}

async function installationToken(installationId: string): Promise<string> {
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await appJwt()}`, Accept: "application/vnd.github+json", "User-Agent": "pensieve" },
  });
  if (!res.ok) throw new Error(`installation token: ${res.status} ${await res.text()}`);
  return (await res.json() as { token: string }).token;
}

/**
 * Mirror every .html/.md (and asset) under source.folder into the workspace.
 * Only blobs whose sha changed are downloaded; `full` re-downloads everything
 * (e.g. after a change to how markdown renders). Callers go through runSync,
 * which records the outcome on the source row.
 */
export async function syncGithubSource(source: typeof schema.syncSource.$inferSelect, opts: { full?: boolean } = {}) {
  if (!source.repo || !source.installationId) throw new Error("source missing repo/installationId");
  const token = await installationToken(source.installationId);
  const gh = (url: string) => fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "pensieve" },
  });

  const branch = source.branch || "main";
  const treeRes = await gh(`https://api.github.com/repos/${source.repo}/git/trees/${branch}?recursive=1`);
  if (!treeRes.ok) throw new Error(`tree: ${treeRes.status}`);
  const treeBody = await treeRes.json() as { tree: { path: string; type: string; sha: string }[]; truncated?: boolean };
  // A truncated listing is a PARTIAL view of the repo, and the prune below
  // deletes whatever this listing does not mention — so continuing here would
  // delete documents that still exist upstream. Fail instead.
  if (treeBody.truncated) throw new Error("github returned a truncated tree; narrow the source's folder");
  const tree = treeBody.tree;

  const folder = (source.folder ?? "").replaceAll(/^\/|\/$/g, "");
  const prefix = folder ? folder + "/" : "";
  const ASSET_EXT = /\.(css|js|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|pdf)$/i;
  const files = tree.filter((t) => t.type === "blob" && t.path.startsWith(prefix) && (t.path.endsWith(".html") || t.path.endsWith(".md")));
  const assetFiles = tree.filter((t) => t.type === "blob" && t.path.startsWith(prefix) && ASSET_EXT.test(t.path));

  const mount = source.mount === "/" ? "" : source.mount.replace(/\/$/, "");
  const label = `github:${source.id}`;

  // Blobs are fetched with bounded concurrency and written in byte-bounded
  // batches — one giant insert per table used to exceed Neon's 64 MB request
  // cap (see lib/sync-plan.ts). Every write is an idempotent upsert and any
  // failure throws BEFORE the prune, so a half-finished sync never deletes
  // anything and the next push picks up where it stopped.
  const blobContent = async (sha: string) => {
    const raw = await gh(`https://api.github.com/repos/${source.repo}/git/blobs/${sha}`);
    if (!raw.ok) throw new Error(`blob ${sha}: ${raw.status}`);
    return ((await raw.json()) as { content: string }).content.replaceAll("\n", "");
  };

  // Only documents whose blob sha changed are downloaded — same rule as the
  // assets below. Re-fetching every doc on every push made a sync of
  // pathors-docs run past 45 s, longer than a webhook delivery can wait.
  const treeDocs = files.map((f) => ({ path: mount + "/" + f.path.slice(prefix.length).replace(/\.(html|md)$/, ""),
    sha: f.sha, isMd: f.path.endsWith(".md") }));
  const storedDocs = opts.full ? new Map<string, string | null>() : new Map((await db
    .select({ path: schema.document.path, sha: schema.document.sha }).from(schema.document)
    .where(and(eq(schema.document.organizationId, source.organizationId), eq(schema.document.source, label))))
    .map((r) => [r.path, r.sha]));
  const docsToFetch = changedEntries(treeDocs, storedDocs);
  const docs: { path: string; sha: string; html: string }[] = [];
  for (let i = 0; i < docsToFetch.length; i += BLOB_CONCURRENCY) {
    const part = await Promise.all(docsToFetch.slice(i, i + BLOB_CONCURRENCY).map(async (f) => {
      const b64 = await blobContent(f.sha);
      const src = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.codePointAt(0)!));
      return { path: f.path, sha: f.sha, html: f.isMd ? mdToHtml(src) : src };
    }));
    docs.push(...part);
  }
  await writeDocuments(source.organizationId, label, docs);

  // assets (css/js/images/fonts) ride along so docs' relative references resolve
  const treeAssets = assetFiles.map((f) => {
    const ext = f.path.split(".").pop()!.toLowerCase();
    return { path: mount + "/" + f.path.slice(prefix.length), sha: f.sha, contentType: ASSET_MIME[ext] ?? "application/octet-stream" };
  });
  const assetsFetched = await syncAssets(source.organizationId, label, treeAssets, blobContent, opts.full);

  // Prune everything this source owns that is no longer in the repo (or moved
  // mount) — but a sync that matched NOTHING at all is far more likely a
  // misconfiguration (wrong branch, mistyped folder) than a repo that genuinely
  // emptied. Pruning on that would wipe the source's entire mount, so skip and
  // report it instead. "Seen" is the full tree listing, not just what was
  // fetched this time — unchanged assets were skipped, not removed.
  const matchedNothing = !treeDocs.length && !treeAssets.length;
  if (!matchedNothing) await pruneSource(source.organizationId, label, treeDocs.map((d) => d.path), treeAssets.map((a) => a.path));
  return { synced: treeDocs.length, docsFetched: docs.length, assets: treeAssets.length, assetsFetched,
    prunedSkipped: matchedNothing };
}

export type SyncTrigger = "push" | "manual" | "edit" | "create";

/** Mark a source as syncing, so a sync that never reports back is visible as one. */
export async function markSyncStarted(sourceId: string, trigger: SyncTrigger, commit?: string | null) {
  await db.update(schema.syncSource).set({
    lastSyncStatus: "running", lastSyncStartedAt: new Date(), lastSyncFinishedAt: null, lastSyncError: null,
    lastSyncTrigger: trigger, lastSyncCommit: commit ?? null,
  }).where(eq(schema.syncSource.id, sourceId));
}

/**
 * Run one sync and record its outcome on the source row — ok with counts, or
 * the error — so a failure shows on the settings page instead of only in
 * GitHub's webhook delivery log. Rethrows after recording.
 */
export async function runSync(source: typeof schema.syncSource.$inferSelect,
  trigger: SyncTrigger, opts: { commit?: string | null; full?: boolean; started?: boolean } = {}) {
  if (!opts.started) await markSyncStarted(source.id, trigger, opts.commit);
  const t0 = Date.now();
  try {
    const r = await syncGithubSource(source, { full: opts.full });
    const now = new Date();
    await db.update(schema.syncSource).set({
      lastSyncAt: now, lastSyncStatus: "ok", lastSyncFinishedAt: now, lastSyncError: null,
      lastSyncStats: { docs: r.synced, docsFetched: r.docsFetched, assets: r.assets, assetsFetched: r.assetsFetched,
        prunedSkipped: r.prunedSkipped, ms: Date.now() - t0 },
    }).where(eq(schema.syncSource.id, source.id));
    return r;
  } catch (e) {
    await db.update(schema.syncSource).set({
      lastSyncStatus: "error", lastSyncFinishedAt: new Date(), lastSyncError: String(e).slice(0, 2000),
    }).where(eq(schema.syncSource.id, source.id)).catch(() => {});
    throw e;
  }
}

const ASSET_MIME: Record<string, string> = { css: "text/css", js: "text/javascript", png: "image/png",
  jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
  ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", pdf: "application/pdf" };

const BLOB_CONCURRENCY = 8;

type AssetRow = { path: string; sha: string; contentType: string; data: string };

/**
 * Fetch only the assets whose blob sha changed since the last sync and upsert
 * them in byte-bounded batches. Re-downloading every image on every push is what
 * made each sync carry the whole repo's 60+ MB. Returns how many were fetched.
 */
async function syncAssets(organizationId: string, label: string,
  treeAssets: Omit<AssetRow, "data">[], blobContent: (sha: string) => Promise<string>, full = false): Promise<number> {
  const storedRows = full ? [] : await db.select({ path: schema.asset.path, sha: schema.asset.sha }).from(schema.asset)
    .where(and(eq(schema.asset.organizationId, organizationId), eq(schema.asset.source, label)));
  const toFetch = changedEntries(treeAssets, new Map(storedRows.map((r) => [r.path, r.sha])));
  let pending: AssetRow[] = [];
  let pendingBytes = 0;
  for (let i = 0; i < toFetch.length; i += BLOB_CONCURRENCY) {
    const part = await Promise.all(toFetch.slice(i, i + BLOB_CONCURRENCY)
      .map(async (a) => ({ ...a, data: await blobContent(a.sha) })));
    for (const a of part) {
      if (pending.length && pendingBytes + a.data.length > WRITE_BUDGET_BYTES) {
        await writeAssets(organizationId, label, pending);
        pending = [];
        pendingBytes = 0;
      }
      pending.push(a);
      pendingBytes += a.data.length;
    }
  }
  await writeAssets(organizationId, label, pending);
  return toFetch.length;
}

/** Delete this source's documents and assets that the repo no longer has. */
async function pruneSource(organizationId: string, label: string, seenDocs: string[], seenAssets: string[]) {
  await db.delete(schema.asset).where(and(
    eq(schema.asset.organizationId, organizationId),
    eq(schema.asset.source, label),
    seenAssets.length ? notInArray(schema.asset.path, seenAssets) : sql`true`,
  ));
  await db.delete(schema.document).where(and(
    eq(schema.document.organizationId, organizationId),
    eq(schema.document.source, label),
    seenDocs.length ? notInArray(schema.document.path, seenDocs) : sql`true`,
  ));
}

async function writeDocuments(organizationId: string, label: string, docs: { path: string; sha: string; html: string }[]) {
  if (!docs.length) return;
  const rows = docs.map((d) => ({ id: crypto.randomUUID(), organizationId, path: d.path, sha: d.sha, html: d.html,
    text: plainText(d.html), source: label, ...extractMeta(d.html, d.path) }));
  // length counts UTF-16 units; ×3 covers UTF-8 CJK and JSON quote escaping.
  for (const batch of byteBatches(rows, (r) => (r.html.length + r.text.length) * 3)) {
    await db.insert(schema.document).values(batch).onConflictDoUpdate({
      target: [schema.document.organizationId, schema.document.path],
      set: {
        html: sql`excluded.html`, text: sql`excluded.text`, title: sql`excluded.title`,
        date: sql`excluded.date`, tags: sql`excluded.tags`, links: sql`excluded.links`,
        source: sql`excluded.source`, sha: sql`excluded.sha`, updatedAt: new Date(),
      },
    });
  }
}

async function writeAssets(organizationId: string, label: string, rows: AssetRow[]) {
  if (!rows.length) return;
  await db.insert(schema.asset)
    .values(rows.map((a) => ({ id: crypto.randomUUID(), organizationId, path: a.path, sha: a.sha,
      contentType: a.contentType, data: a.data, source: label })))
    .onConflictDoUpdate({
      target: [schema.asset.organizationId, schema.asset.path],
      set: { data: sql`excluded.data`, sha: sql`excluded.sha`, contentType: sql`excluded.content_type`,
        source: sql`excluded.source`, updatedAt: new Date() },
    });
}

export async function verifyWebhook(req: Request, body: string): Promise<boolean> {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  // Without a secret there is nothing to verify against. The old empty-string
  // fallback still produced a signature — one anyone could recompute — so an
  // unconfigured deployment accepted forged pushes. Refuse instead.
  if (!secret) return false;
  const m = /^sha256=([a-f0-9]{64})$/i.exec(req.headers.get("x-hub-signature-256") ?? "");
  if (!m) return false;
  const sig = Uint8Array.from(m[1].match(/../g)!, (h) => parseInt(h, 16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  // subtle.verify compares in constant time; the old string === did not
  return crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(body));
}

/**
 * Which workspace, if any, already mounts a repo through this installation.
 *
 * Nothing else binds an installation to a workspace: /api/github/installations
 * can see every installation of the App, and a sync source stores whatever
 * installationId it was handed. So an installation is claimed first-come by the
 * workspace that first mounts through it, and this lookup is what stops a second
 * workspace pointing at someone else's private repos.
 */
export async function installationOwner(installationId: string): Promise<string | null> {
  const rows = await db
    .select({ organizationId: schema.syncSource.organizationId })
    .from(schema.syncSource)
    .where(eq(schema.syncSource.installationId, installationId))
    .limit(1);
  return rows[0]?.organizationId ?? null;
}

/** Whether the installation can actually see the repo it is being asked to mount. */
export async function installationCanSee(installationId: string, repo: string): Promise<boolean> {
  const token = await installationToken(installationId);
  const res = await fetch("https://api.github.com/installation/repositories?per_page=100", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "pensieve" },
  });
  if (!res.ok) return false;
  const { repositories } = await res.json() as { repositories: { full_name: string }[] };
  return repositories.some((r) => r.full_name.toLowerCase() === repo.toLowerCase());
}
