import { sql } from "drizzle-orm";
import { db } from "./db";
import type { Dict, Locale } from "./i18n-dict";
import { htmlLang } from "./i18n-dict";
import { ago, syncState, type SyncStatusFields } from "./sync-status";

/**
 * The page a member gets for a document path that has no row: a real page in
 * the workspace's look, not a bare "not found". Served as raw HTML from the
 * document route (same as documents themselves), so it works both opened on
 * its own and inside the workspace shell's iframe (?embed=1).
 */

type DocRef = { path: string; title: string };
type Source = SyncStatusFields & { mount: string; lastSyncError?: string | null };

const esc = (s: string) => s.replaceAll(/[&<>"']/g, (c) => `&#${c.codePointAt(0)};`);

/** Up to five documents whose path or title is close to the missing path. Best-effort. */
export async function closeMatches(orgId: string, docPath: string): Promise<DocRef[]> {
  const seg = decodeURIComponent(docPath.split("/").pop() ?? "").replaceAll(/[-_]+/g, " ").trim();
  if (!seg) return [];
  try {
    const r = await db.execute(sql`
      select path, title from (
        select path, title, greatest(similarity(path, ${docPath}), word_similarity(${seg}, path),
          word_similarity(${seg}, title)) as score
        from document where organization_id = ${orgId}
      ) m where score > 0.3 order by score desc limit 5`);
    return r.rows as unknown as DocRef[];
  } catch {
    return []; // databases without pg_trgm: no suggestions, the page still renders
  }
}

/** Documents whose links point at the missing path: where the broken link lives. */
export async function linkingDocs(orgId: string, docPath: string): Promise<DocRef[]> {
  try {
    const r = await db.execute(sql`
      select path, title from document
      where organization_id = ${orgId} and links @> ${JSON.stringify([docPath])}::jsonb
      order by date desc nulls last limit 5`);
    return r.rows as unknown as DocRef[];
  } catch {
    return [];
  }
}

/** The source whose mount is the longest prefix of the path, i.e. the one that would sync it. */
export function sourceFor<T extends { mount: string }>(sources: readonly T[], docPath: string): T | undefined {
  const norm = (m: string) => (m === "/" ? "" : m.replace(/\/$/, ""));
  return [...sources]
    .filter((s) => docPath === norm(s.mount) || docPath.startsWith(norm(s.mount) + "/"))
    .sort((a, b) => norm(b.mount).length - norm(a.mount).length)[0];
}

export function notFoundHtml(o: {
  slug: string; orgName: string; docPath: string; embed: boolean; locale: Locale; t: Dict;
  suggestions: DocRef[]; linkedFrom: DocRef[]; source?: Source;
}): string {
  const nf = o.t.doc.notFound;
  const home = `/o/${encodeURIComponent(o.slug)}`;
  const seg = decodeURIComponent(o.docPath.split("/").pop() ?? "").replaceAll(/[-_]+/g, " ").trim();
  const searchHref = `${home}?search=${encodeURIComponent(seg)}`;
  // raw path, as documents link to each other: the shell matches the href as-is
  const docHref = (p: string) => `${home}/d${p}`;
  const item = (d: DocRef) =>
    `<li><a data-doc href="${esc(docHref(d.path))}"><span class="t">${esc(d.title || d.path)}</span><span class="p">${esc(d.path)}</span></a></li>`;
  const list = (heading: string, docs: DocRef[]) => {
    if (!docs.length) return "";
    const items = docs.map(item).join("");
    return `<section><h2>${esc(heading)}</h2><ul>${items}</ul></section>`;
  };

  let sync = "";
  if (o.source) {
    const st = syncState(o.source);
    const when = (t: SyncStatusFields["lastSyncAt"]) => ago(t, o.locale);
    const settings = `<a target="_top" href="${home}/settings">${esc(nf.syncSettings)}</a>`;
    if (st === "running") sync = `<p class="sync">${esc(nf.syncRunning(when(o.source.lastSyncStartedAt)))} ${settings}</p>`;
    else if (st === "interrupted") sync = `<p class="sync bad">${esc(nf.syncInterrupted(when(o.source.lastSyncStartedAt)))} ${settings}</p>`;
    else if (st === "error") sync = `<p class="sync bad">${esc(nf.syncError(when(o.source.lastSyncStartedAt)))}<code>${esc((o.source.lastSyncError ?? "").slice(0, 300))}</code> ${settings}</p>`;
    else if (st === "ok") sync = `<p class="sync">${esc(nf.syncOk(when(o.source.lastSyncAt)))} ${settings}</p>`;
  }

  // Inside the shell, doc links and search go to the parent (same message
  // contract as lib/doc-nav.ts); everything else navigates the top window.
  const script = o.embed ? `<script>document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[data-doc],a[data-search]");if(!a)return;e.preventDefault();parent.postMessage(a.hasAttribute("data-search")?{pnsvPalette:true,q:a.getAttribute("data-search")}:{pnsvOpen:a.getAttribute("href")},location.origin)});</script>` : "";

  return `<!doctype html><html lang="${htmlLang(o.locale)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(nf.metaTitle)} · ${esc(o.orgName)}</title>
<style>
:root{color-scheme:light;--paper:#F7F9FB;--paper-2:#EDF1F6;--ink:#13181D;--ink-2:#3A444E;--ink-3:#68737E;--rule:#D5DCE3;--accent:#2456B3;--accent-wash:#E8EFFA;--risk:#9E3535;--risk-bg:#F0DCDC;
--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC","Noto Sans TC",sans-serif;--serif:"Iowan Old Style",Palatino,Georgia,"Songti TC",serif}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--paper:#0F1417;--paper-2:#161D23;--ink:#E4E8EA;--ink-2:#B2BCC4;--ink-3:#7E8A94;--rule:#2A3440;--accent:#7FA8F0;--accent-wash:#16233A;--risk:#D4736F;--risk-bg:#2E1A19}}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--paper);color:var(--ink);font-family:var(--sans)}
main{max-width:640px;margin:0 auto;padding:clamp(40px,10vh,96px) 16px 64px}
.eyebrow{font:11px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin:0 0 14px}
h1{font-family:var(--serif);font-weight:600;font-size:clamp(1.4rem,4vw,1.9rem);line-height:1.3;margin:0 0 12px;overflow-wrap:anywhere}
.path{font:13px/1.5 var(--mono);color:var(--ink-2);background:var(--paper-2);border:1px solid var(--rule);border-radius:6px;padding:6px 10px;display:inline-block;max-width:100%;overflow-wrap:anywhere;margin:0 0 16px}
.lead{font-size:15px;line-height:1.65;color:var(--ink-2);margin:0 0 14px}
.sync{font-size:13.5px;line-height:1.6;color:var(--ink-2);margin:0 0 14px;padding:8px 12px;border-left:3px solid var(--accent);background:var(--accent-wash);border-radius:0 6px 6px 0}
.sync.bad{border-color:var(--risk);background:var(--risk-bg)}
.sync code{font:12px/1.5 var(--mono);overflow-wrap:anywhere}
.sync a{color:inherit;font-weight:600;white-space:nowrap}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0 8px}
.btn{display:inline-flex;align-items:center;height:36px;padding:0 14px;border-radius:8px;font-size:14px;text-decoration:none;border:1px solid var(--rule);color:var(--ink);background:transparent}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--paper)}
.btn:hover{filter:brightness(1.06)}.btn:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
section{margin-top:32px}h2{font:10.5px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin:0 0 6px;font-weight:500}
ul{list-style:none;margin:0;padding:0}li a{display:flex;flex-direction:column;gap:2px;padding:10px 0;border-bottom:1px solid var(--rule);text-decoration:none;color:inherit}
li a:hover .t{color:var(--accent)}.t{font-size:14.5px}.p{font:12px/1.4 var(--mono);color:var(--ink-3);overflow-wrap:anywhere}
</style></head><body><main>
<p class="eyebrow">${esc(nf.eyebrow)}</p>
<h1>${esc(nf.title)}</h1>
<p class="path">${esc(o.docPath)}</p>
<p class="lead">${esc(nf.lead)}</p>
${sync}
<div class="actions"><a class="btn primary" target="_top" href="${home}">${esc(nf.home)} · ${esc(o.orgName)}</a><a class="btn" data-search="${esc(seg)}" target="_top" href="${esc(searchHref)}">${esc(nf.search)}</a></div>
${list(nf.suggestions, o.suggestions)}
${list(nf.linkedFrom, o.linkedFrom)}
</main>${script}</body></html>`;
}
