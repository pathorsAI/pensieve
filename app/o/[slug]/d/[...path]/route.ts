import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";
import { accessUrl, requireMember } from "@/lib/access";
import { getDict } from "@/lib/i18n";
import { arg, navScript, type NavLabels } from "@/lib/doc-nav";

// Serves a document's HTML with the pensieve nav (toolbar + backlinks) injected.
export async function GET(req: Request, ctx: { params: Promise<{ slug: string; path: string[] }> }) {
  const embed = new URL(req.url).searchParams.get("embed") === "1";
  const { slug, path } = await ctx.params;
  const access = await requireMember(slug);
  if (!access) {
    // Not ?embed=1: after signing in the reader should land on the full page.
    const url = new URL(req.url);
    return Response.redirect(new URL(accessUrl(url.pathname), url), 302);
  }
  const rawPath = "/" + path.map(decodeURIComponent).join("/");
  const docPath = rawPath.replace(/\.(html|md)$/, "");
  // assets (css/js/images) synced alongside docs are served from the same tree,
  // so documents' relative references just work.
  const assetRows = await db.select().from(schema.asset).where(and(
    eq(schema.asset.organizationId, access.org.id), eq(schema.asset.path, rawPath))).limit(1);
  if (assetRows.length) {
    const bytes = Uint8Array.from(atob(assetRows[0].data), (c) => c.codePointAt(0)!);
    return new Response(bytes, { headers: { "content-type": assetRows[0].contentType,
      "cache-control": "private, max-age=300" } });
  }
  const rows = await db.select().from(schema.document).where(and(
    eq(schema.document.organizationId, access.org.id), eq(schema.document.path, docPath))).limit(1);
  if (!rows.length) return new Response("not found", { status: 404 });

  const { t } = await getDict();
  const ui: NavLabels = {
    workspace: access.org.name,
    open: t.doc.openInWorkspace,
    openHint: t.doc.openInWorkspaceHint,
    homeHint: t.doc.workspaceHomeHint,
  };
  const nav = `<script>(${navScript.toString()})(${arg(slug)},${arg(docPath)},${embed},${arg(ui)})</script>`;
  let html = rows[0].html;
  // in-workspace links resolve through the org prefix
  html = html.replaceAll(/href="(\/[^"#?]+?)(?:\.(?:html|md))?"/g, (_m, p) => `href="/o/${slug}/d${p}"`);
  html = html.includes("</body>") ? html.replace("</body>", nav + "</body>") : html + nav;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
