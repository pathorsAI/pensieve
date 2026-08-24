import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";
import { resolveShare, referencedAssets, rewriteForShare } from "@/lib/share";

/**
 * The shared document itself, plus the assets it references — served into the
 * sandboxed frame that app/s/[token]/route.ts sets up. Mirrors the depth of the
 * workspace route (/s/<token>/d/<doc path>) so relative refs inside the document
 * resolve exactly as they do for members.
 *
 * No nav is injected here: the workspace nav fetches the member-gated
 * /api/graph, and its backlinks would leak the titles of unshared documents.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string; path: string[] }> }) {
  const { token, path } = await ctx.params;
  const share = await resolveShare(token);
  if (!share) return notFound();

  const rows = await db.select().from(schema.document).where(and(
    eq(schema.document.organizationId, share.orgId),
    eq(schema.document.path, share.docPath))).limit(1);
  if (!rows.length) return notFound();
  const doc = rows[0];

  const rawPath = "/" + path.map(decodeURIComponent).join("/");
  const docPath = rawPath.replace(/\.(html|md)$/, "");

  if (docPath === share.docPath) {
    return new Response(rewriteForShare(doc.html, token), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // the token check must never be served from a cache — revocation is
        // only as fast as the shortest-lived copy of this response
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }

  // anything else must be an asset this document actually references
  if (!referencedAssets(doc.html, share.docPath).has(rawPath)) return notFound();
  const assets = await db.select().from(schema.asset).where(and(
    eq(schema.asset.organizationId, share.orgId), eq(schema.asset.path, rawPath))).limit(1);
  if (!assets.length) return notFound();

  const bytes = Uint8Array.from(atob(assets[0].data), (c) => c.codePointAt(0)!);
  return new Response(bytes, {
    headers: {
      "content-type": assets[0].contentType,
      // short and private: the token is in the path, but a revoked share should
      // not keep rendering from an intermediary
      "cache-control": "private, max-age=60",
      "x-content-type-options": "nosniff",
    },
  });
}

/** One shape for every miss, so probing cannot distinguish the failure modes. */
function notFound() {
  return new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
}
