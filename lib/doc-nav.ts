/**
 * The script injected into a member's view of a document: the workspace
 * toolbar when the page is opened on its own, backlinks, and the ⌘K / link
 * forwarding when it is embedded in the workspace shell. Serialised with
 * toString() into the document, so it must stay self-contained.
 */
export type NavLabels = { workspace: string; open: string; openHint: string; homeHint: string };

/** JSON for an inline <script>: a workspace or path containing "</script>" must not end it early. */
export const arg = (v: unknown) => JSON.stringify(v).replaceAll("<", String.raw`\u003c`);

export function navScript(slug: string, here: string, embed: boolean, ui: NavLabels) {
  (async () => {
    const st = document.createElement("style");
    st.textContent = ":root{scrollbar-width:thin} ::-webkit-scrollbar{width:8px;height:8px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(127,138,148,.5);border-radius:8px} .pnsv-bar{position:fixed;bottom:16px;left:16px;z-index:9999;display:flex;align-items:stretch;max-width:calc(100vw - 32px);font:12.5px/1 -apple-system,BlinkMacSystemFont,'PingFang TC','Noto Sans TC',sans-serif;border-radius:999px;background:rgba(20,26,27,.88);color:#F1F2F0;box-shadow:0 2px 12px rgba(0,0,0,.18);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);overflow:hidden}.pnsv-bar a{color:inherit;text-decoration:none;display:flex;align-items:center;gap:8px;padding:8px 13px;min-width:0;transition:background .15s}.pnsv-bar a:hover{background:rgba(255,255,255,.12)}.pnsv-bar a:focus-visible{outline:2px solid #7FA8F0;outline-offset:-2px}.pnsv-bar .pnsv-dot{width:7px;height:7px;border-radius:50%;background:#7FA8F0;box-shadow:0 0 0 3px rgba(127,168,240,.22);flex:none}.pnsv-bar .pnsv-ws{font:11px/1 ui-monospace,Menlo,monospace;letter-spacing:.06em;max-width:20ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pnsv-bar .pnsv-sep{width:1px;background:rgba(255,255,255,.18);flex:none}.pnsv-bar svg{width:14px;height:14px;flex:none}@media (prefers-color-scheme:dark){.pnsv-bar{background:rgba(40,48,52,.9);color:#E4E8E7}}@media (max-width:560px){.pnsv-bar .pnsv-ws{display:none}}@media print{.pnsv-bar{display:none}} .pnsv-links{max-width:900px;margin:48px auto 0;padding:20px 24px 8px;border-top:1px solid rgba(127,138,137,.35);font-family:-apple-system,'PingFang TC',sans-serif}.pnsv-links h4{font:10.5px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;opacity:.55;margin:14px 0 8px}.pnsv-links a{display:inline-block;margin:0 10px 8px 0;font-size:13.5px;text-decoration:none;color:inherit;opacity:.8;border-bottom:1px solid rgba(127,138,137,.5)}.pnsv-links a:hover{opacity:1}";
    document.head.appendChild(st);
    // Opened on its own (a shared link, a bookmark): give the reader a way into
    // the workspace — the shell deep-links a doc through the #/path hash. Built
    // before the graph fetch so it shows even when that request fails. Bottom-left
    // because every doc starts with a masthead in the top padding.
    if (!embed) {
      const bar = document.createElement("nav");
      bar.className = "pnsv-bar";
      bar.setAttribute("aria-label", "Pensieve");
      const home = document.createElement("a");
      home.href = `/o/${slug}`; home.title = ui.homeHint;
      const dot = document.createElement("span"); dot.className = "pnsv-dot";
      const ws = document.createElement("span"); ws.className = "pnsv-ws"; ws.textContent = ui.workspace;
      home.append(dot, ws);
      const sep = document.createElement("span"); sep.className = "pnsv-sep";
      const open = document.createElement("a");
      open.href = `/o/${slug}#${here}`; open.title = ui.openHint;
      // lucide "panel-left", inline so the doc page needs nothing from the app bundle
      open.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>';
      open.append(document.createTextNode(ui.open));
      bar.append(home, sep, open);
      document.body.appendChild(bar);
    }
    let g: { nodes: { id: string; title: string }[]; edges: { from: string; to: string }[] };
    try { g = await (await fetch(`/api/graph?org=${slug}`)).json(); } catch { return; }
    const byId: Record<string, { id: string; title: string }> = {};
    g.nodes.forEach((n) => (byId[n.id] = n));
    const outs = g.edges.filter((e) => e.from === here && byId[e.to]).map((e) => byId[e.to]);
    const ins = g.edges.filter((e) => e.to === here && byId[e.from]).map((e) => byId[e.from]);
    if (embed) {
      document.addEventListener("click", (ev) => {
        const t = ev.target as HTMLElement | null;
        const a = t?.closest?.(`a[href^="/o/"]`) as HTMLAnchorElement | null;
        // same-origin iframe: address the workspace shell explicitly, never "*"
        if (a) { ev.preventDefault(); parent.postMessage({ pnsvOpen: a.getAttribute("href") }, location.origin); }
      });
      // keystrokes inside the iframe never reach the workspace shell — forward ⌘K
      document.addEventListener("keydown", (ev) => {
        if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "k") {
          ev.preventDefault(); parent.postMessage({ pnsvPalette: true }, location.origin);
        }
      });
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
