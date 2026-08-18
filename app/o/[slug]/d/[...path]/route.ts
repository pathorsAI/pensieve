import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";
import { requireMember } from "@/lib/access";

// Serves a document's HTML with the pensieve nav (pill + backlinks) injected.
export async function GET(req: Request, ctx: { params: Promise<{ slug: string; path: string[] }> }) {
  const embed = new URL(req.url).searchParams.get("embed") === "1";
  const { slug, path } = await ctx.params;
  const access = await requireMember(slug);
  if (!access) return new Response("forbidden", { status: 403 });
  const rawPath = "/" + path.map(decodeURIComponent).join("/");
  const docPath = rawPath.replace(/\.(html|md)$/, "");
  // assets (css/js/images) synced alongside docs are served from the same tree,
  // so documents' relative references just work.
  const assetRows = await db.select().from(schema.asset).where(and(
    eq(schema.asset.organizationId, access.org.id), eq(schema.asset.path, rawPath))).limit(1);
  if (assetRows.length) {
    const bytes = Uint8Array.from(atob(assetRows[0].data), (c) => c.charCodeAt(0));
    return new Response(bytes, { headers: { "content-type": assetRows[0].contentType,
      "cache-control": "private, max-age=300" } });
  }
  const rows = await db.select().from(schema.document).where(and(
    eq(schema.document.organizationId, access.org.id), eq(schema.document.path, docPath))).limit(1);
  if (!rows.length) return new Response("not found", { status: 404 });

  const nav = `<script>(${navScript.toString()})(${JSON.stringify(slug)},${JSON.stringify(docPath)},${embed})</script>`;
  let html = rows[0].html;
  // in-workspace links resolve through the org prefix
  html = html.replace(/href="(\/[^"#?]+?)(?:\.(?:html|md))?"/g, (_m, p) => `href="/o/${slug}/d${p}"`);
  html = html.includes("</body>") ? html.replace("</body>", nav + "</body>") : html + nav;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function navScript(slug: string, here: string, embed: boolean) {
  (async () => {
    let g: { nodes: { id: string; title: string }[]; edges: { from: string; to: string }[] };
    try { g = await (await fetch(`/api/graph?org=${slug}`)).json(); } catch { return; }
    const byId: Record<string, { id: string; title: string }> = {};
    g.nodes.forEach((n) => (byId[n.id] = n));
    const outs = g.edges.filter((e) => e.from === here && byId[e.to]).map((e) => byId[e.to]);
    const ins = g.edges.filter((e) => e.to === here && byId[e.from]).map((e) => byId[e.from]);
    const st = document.createElement("style");
    st.textContent = ":root{scrollbar-width:thin} ::-webkit-scrollbar{width:8px;height:8px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(127,138,148,.5);border-radius:8px} .pnsv-pill{position:fixed;top:14px;left:14px;z-index:9999;font:11px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;padding:7px 12px;border-radius:999px;background:rgba(20,26,27,.82);color:#F1F2F0;opacity:.55;transition:opacity .15s}.pnsv-pill:hover{opacity:1}@media (prefers-color-scheme:dark){.pnsv-pill{background:rgba(228,232,231,.14);color:#E4E8E7}}.pnsv-links{max-width:900px;margin:48px auto 0;padding:20px 24px 8px;border-top:1px solid rgba(127,138,137,.35);font-family:-apple-system,'PingFang TC',sans-serif}.pnsv-links h4{font:10.5px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;opacity:.55;margin:14px 0 8px}.pnsv-links a{display:inline-block;margin:0 10px 8px 0;font-size:13.5px;text-decoration:none;color:inherit;opacity:.8;border-bottom:1px solid rgba(127,138,137,.5)}.pnsv-links a:hover{opacity:1}";
    document.head.appendChild(st);
    if (embed) {
      document.addEventListener("click", (ev) => {
        const t = ev.target as HTMLElement | null;
        const a = t?.closest?.(`a[href^="/o/"]`) as HTMLAnchorElement | null;
        if (a) { ev.preventDefault(); parent.postMessage({ pnsvOpen: a.getAttribute("href") }, "*"); }
      });
      // keystrokes inside the iframe never reach the workspace shell — forward ⌘K
      document.addEventListener("keydown", (ev) => {
        if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "k") {
          ev.preventDefault(); parent.postMessage({ pnsvPalette: true }, "*");
        }
      });
    }
    if (!embed) {
      const pill = document.createElement("a");
      pill.className = "pnsv-pill"; pill.href = `/o/${slug}`; pill.textContent = "◉ pensieve";
      document.body.appendChild(pill);
    }
    if (outs.length || ins.length) {
      const box = document.createElement("div");
      box.className = "pnsv-links";
      const link = (n: { id: string; title: string }) => `<a href="/o/${slug}/d${n.id}">${n.title}</a>`;
      box.innerHTML = (outs.length ? "<h4>links to</h4>" + outs.map(link).join("") : "")
        + (ins.length ? "<h4>linked from</h4>" + ins.map(link).join("") : "");
      document.body.appendChild(box);
    }
  })();
}
