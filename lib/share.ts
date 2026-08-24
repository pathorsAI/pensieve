import { eq } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./schema";

/**
 * Shares are served from their own origin so that a shared document — which is
 * author-supplied HTML executed verbatim — can never reach the app's cookies or
 * its member-gated APIs. Empty means "not configured": host separation is then
 * off (local dev). Production sets it in wrangler.jsonc.
 */
export const SHARE_HOST = (process.env.SHARE_HOST ?? "").toLowerCase();

export function shareUrl(token: string) {
  return SHARE_HOST ? `https://${SHARE_HOST}/s/${token}` : `/s/${token}`;
}

/** 160 bits from the CSPRNG — the token is the whole secret, so don't shorten it. */
export function newShareToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const TOKEN_RE = /^[a-f0-9]{40}$/;

export type ResolvedShare = { orgId: string; docPath: string };

/**
 * Token -> document. Returns null for unknown, malformed or expired tokens
 * alike, so a probe cannot tell them apart.
 */
export async function resolveShare(token: string): Promise<ResolvedShare | null> {
  if (!TOKEN_RE.test(token)) return null;
  const rows = await db.select().from(schema.share).where(eq(schema.share.id, token)).limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
  return { orgId: row.organizationId, docPath: row.documentPath };
}

export const ASSET_EXT = /\.(css|js|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|pdf)$/i;

function normalize(path: string) {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return "/" + out.join("/");
}

/**
 * The asset paths a document actually references. The asset table is only
 * org-scoped, so without this a single share link would expose the whole
 * workspace's asset tree.
 */
export function referencedAssets(html: string, docPath: string): Set<string> {
  const dir = docPath.slice(0, docPath.lastIndexOf("/") + 1);
  const found = new Set<string>();
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const ref = m[1].split(/[#?]/)[0];
    if (!ref || !ASSET_EXT.test(ref)) continue;
    if (ref.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(ref)) continue;  // external
    found.add(ref.startsWith("/") ? normalize(ref) : normalize(dir + ref));
  }
  return found;
}

/**
 * Rewrites in-workspace references for the share origin: root-relative asset
 * refs get the share prefix, root-relative document links are defused. Links to
 * unshared documents must not survive — they would leak paths and 404 anyway.
 */
export function rewriteForShare(html: string, token: string) {
  return html.replaceAll(/(href|src)="(\/[^"]*)"/g, (whole, attr: string, ref: string) => {
    const bare = ref.split(/[#?]/)[0];
    if (ASSET_EXT.test(bare)) return `${attr}="/s/${token}/d${ref}"`;
    return attr === "href" ? `href="#" data-pnsv-unshared="1"` : whole;
  });
}
