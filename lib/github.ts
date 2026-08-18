import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./schema";
import { extractMeta, plainText } from "./extract";
import { mdToHtml } from "./markdown";

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** RS256-signed GitHub App JWT. GITHUB_APP_PRIVATE_KEY must be PKCS#8
 *  (convert GitHub's download once: openssl pkcs8 -topk8 -nocrypt -in app.pem). */
export async function appJwt(): Promise<string> {
  const pem = process.env.GITHUB_APP_PRIVATE_KEY!;
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")), (c) => c.charCodeAt(0));
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
  const tree = (await treeRes.json() as { tree: { path: string; type: string; sha: string }[] }).tree;

  const folder = (source.folder ?? "").replace(/^\/|\/$/g, "");
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
      const src = new TextDecoder().decode(Uint8Array.from(atob(blob.content.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
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
      return { path: mount + rel, contentType: MIME[ext] ?? "application/octet-stream", data: blob.content.replace(/\n/g, "") };
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
  const seenAssets = assets.map((a) => a.path);
  await db.delete(schema.asset).where(and(
    eq(schema.asset.organizationId, source.organizationId),
    eq(schema.asset.source, label),
    seenAssets.length ? notInArray(schema.asset.path, seenAssets) : sql`true`,
  ));

  // prune everything this source owns that is no longer in the repo (or moved mount)
  const seen = docs.map((d) => d.path);
  await db.delete(schema.document).where(and(
    eq(schema.document.organizationId, source.organizationId),
    eq(schema.document.source, label),
    seen.length ? notInArray(schema.document.path, seen) : sql`true`,
  ));
  await db.update(schema.syncSource).set({ lastSyncAt: new Date() }).where(eq(schema.syncSource.id, source.id));
  return { synced: docs.length, assets: assets.length };
}

export async function verifyWebhook(req: Request, body: string): Promise<boolean> {
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  const key = await crypto.subtle.importKey("raw",
    new TextEncoder().encode(process.env.GITHUB_APP_WEBHOOK_SECRET ?? ""),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expect = "sha256=" + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sig.length === expect.length && sig === expect;
}
