import { eq } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./schema";
import { extractMeta } from "./extract";

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** RS256-signed GitHub App JWT. GITHUB_APP_PRIVATE_KEY must be PKCS#8
 *  (convert GitHub's download once: openssl pkcs8 -topk8 -nocrypt -in app.pem). */
async function appJwt(): Promise<string> {
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
  const files = tree.filter((t) => t.type === "blob" && t.path.startsWith(prefix) && t.path.endsWith(".html"));

  const mount = source.mount === "/" ? "" : source.mount.replace(/\/$/, "");
  const seen: string[] = [];
  for (const f of files) {
    const raw = await gh(`https://api.github.com/repos/${source.repo}/git/blobs/${f.sha}`);
    const blob = await raw.json() as { content: string };
    const html = new TextDecoder().decode(Uint8Array.from(atob(blob.content.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
    const rel = "/" + f.path.slice(prefix.length).replace(/\.html$/, "");
    const path = mount + rel;
    const meta = extractMeta(html);
    seen.push(path);
    await db.insert(schema.document)
      .values({ id: crypto.randomUUID(), organizationId: source.organizationId, path, html, source: `github:${source.id}`, ...meta })
      .onConflictDoUpdate({
        target: [schema.document.organizationId, schema.document.path],
        set: { html, title: meta.title, date: meta.date, tags: meta.tags, links: meta.links, source: `github:${source.id}`, updatedAt: new Date() },
      });
  }
  // prune docs this source owned that no longer exist in the repo
  const owned = await db.select().from(schema.document)
    .where(eq(schema.document.organizationId, source.organizationId));
  for (const d of owned) {
    if (d.source === `github:${source.id}` && !seen.includes(d.path)) {
      await db.delete(schema.document).where(eq(schema.document.id, d.id));
    }
  }
  await db.update(schema.syncSource).set({ lastSyncAt: new Date() }).where(eq(schema.syncSource.id, source.id));
  return { synced: seen.length };
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
