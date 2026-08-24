import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";
import { resolveShare } from "@/lib/share";

const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/**
 * The public landing page for a share link.
 *
 * The document is NOT inlined here — it goes into a sandboxed frame without
 * allow-same-origin, so it renders in an opaque origin. Its scripts still run
 * (documents are allowed to use JS), but they cannot touch cookies or read a
 * response from any same-origin API. Together with the separate SHARE_HOST this
 * is two independent boundaries; either alone would do, and neither is free.
 *
 * NOTE: adding allow-same-origin to that sandbox re-joins the two origins and
 * silently removes the entire protection. Don't.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const share = await resolveShare(token);
  if (!share) return miss();

  const rows = await db
    .select({ title: schema.document.title, date: schema.document.date })
    .from(schema.document)
    .where(and(eq(schema.document.organizationId, share.orgId),
      eq(schema.document.path, share.docPath)))
    .limit(1);
  if (!rows.length) return miss();

  const title = esc(rows[0].title);
  const src = `/s/${token}/d${share.docPath.split("/").map(encodeURIComponent).join("/")}`;

  const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
<meta property="og:title" content="${title}">
<meta property="og:type" content="article">
<style>
  html,body{margin:0;height:100%;background:#fff}
  @media (prefers-color-scheme:dark){html,body{background:#131211}}
  iframe{display:block;width:100%;height:100%;border:0}
</style>
</head>
<body>
<iframe src="${esc(src)}" title="${title}" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"></iframe>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

function miss() {
  return new Response("這個分享連結不存在或已失效。", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
