import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./schema";
import { extractMeta, plainText } from "./extract";
import { mdToHtml } from "./markdown";

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

/** Pull every .html under source.folder from the repo and upsert into the workspace. */
export async function syncGithubSource(source: typeof schema.syncSource.$inferSelect) {
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

  // fetch blobs with bounded concurrency, then write in TWO queries total —
  // per-row writes blow through Workers' subrequest budget on large repos
  // and used to kill the prune halfway.
  const docs: { path: string; html: string }[] = [];
  const chunk = 8;
  for (let i = 0; i < files.length; i += chunk) {
    const part = await Promise.all(files.slice(i, i + chunk).map(async (f) => {
      const raw = await gh(`https://api.github.com/repos/${source.repo}/git/blobs/${f.sha}`);
      const blob = await raw.json() as { content: string };
      const src = new TextDecoder().decode(Uint8Array.from(atob(blob.content.replaceAll("\n", "")), (c) => c.codePointAt(0)!));
      const html = f.path.endsWith(".md") ? mdToHtml(src) : src;
      const rel = "/" + f.path.slice(prefix.length).replace(/\.(html|md)$/, "");
      return { path: mount + rel, html };
    }));
    docs.push(...part);
  }

  if (docs.length) {
    await db.insert(schema.document)
      .values(docs.map((d) => {
        const meta = extractMeta(d.html, d.path);
        return { id: crypto.randomUUID(), organizationId: source.organizationId,
          path: d.path, html: d.html, text: plainText(d.html), source: label, ...meta };
      }))
      .onConflictDoUpdate({
        target: [schema.document.organizationId, schema.document.path],
        set: {
          html: sql`excluded.html`, text: sql`excluded.text`, title: sql`excluded.title`,
          date: sql`excluded.date`, tags: sql`excluded.tags`, links: sql`excluded.links`,
          source: sql`excluded.source`, updatedAt: new Date(),
        },
      });
  }
  // assets (css/js/images/fonts) ride along so docs' relative references resolve
  const MIME: Record<string, string> = { css: "text/css", js: "text/javascript", png: "image/png",
    jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
    ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", pdf: "application/pdf" };
  const assets: { path: string; contentType: string; data: string }[] = [];
  for (let i = 0; i < assetFiles.length; i += chunk) {
    const part = await Promise.all(assetFiles.slice(i, i + chunk).map(async (f) => {
      const raw = await gh(`https://api.github.com/repos/${source.repo}/git/blobs/${f.sha}`);
      const blob = await raw.json() as { content: string };
      const rel = "/" + f.path.slice(prefix.length);
      const ext = f.path.split(".").pop()!.toLowerCase();
      return { path: mount + rel, contentType: MIME[ext] ?? "application/octet-stream", data: blob.content.replaceAll("\n", "") };
    }));
    assets.push(...part);
  }
  if (assets.length) {
    await db.insert(schema.asset)
      .values(assets.map((a) => ({ id: crypto.randomUUID(), organizationId: source.organizationId,
        path: a.path, contentType: a.contentType, data: a.data, source: label })))
      .onConflictDoUpdate({
        target: [schema.asset.organizationId, schema.asset.path],
        set: { data: sql`excluded.data`, contentType: sql`excluded.content_type`,
          source: sql`excluded.source`, updatedAt: new Date() },
      });
  }
  // Prune everything this source owns that is no longer in the repo (or moved
  // mount) — but a sync that matched NOTHING at all is far more likely a
  // misconfiguration (wrong branch, mistyped folder) than a repo that genuinely
  // emptied. Pruning on that would wipe the source's entire mount, so skip and
  // report it instead.
  const matchedNothing = !docs.length && !assets.length;
  if (!matchedNothing) {
    const seenAssets = assets.map((a) => a.path);
    await db.delete(schema.asset).where(and(
      eq(schema.asset.organizationId, source.organizationId),
      eq(schema.asset.source, label),
      seenAssets.length ? notInArray(schema.asset.path, seenAssets) : sql`true`,
    ));
    const seen = docs.map((d) => d.path);
    await db.delete(schema.document).where(and(
      eq(schema.document.organizationId, source.organizationId),
      eq(schema.document.source, label),
      seen.length ? notInArray(schema.document.path, seen) : sql`true`,
    ));
  }
  await db.update(schema.syncSource).set({ lastSyncAt: new Date() }).where(eq(schema.syncSource.id, source.id));
  return { synced: docs.length, assets: assets.length, prunedSkipped: matchedNothing };
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
