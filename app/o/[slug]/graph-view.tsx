"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type Node = { id: string; title: string; date?: string | null; dir: string; tags: string[]; x?: number; y?: number; vx?: number; vy?: number };
type Edge = { from: string; to: string };
type Hit = { path: string; title: string; date: string | null; snippet: string };
type Tree = { name: string; path: string; folders: Tree[]; docs: Node[]; count: number };

function buildTree(nodes: Node[]): Tree {
  const root: Tree = { name: "", path: "", folders: [], docs: [], count: 0 };
  for (const n of nodes) {
    const parts = n.id.split("/").filter(Boolean);
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = "/" + parts.slice(0, i + 1).join("/");
      let next = cur.folders.find((f) => f.path === p);
      if (!next) { next = { name: parts[i], path: p, folders: [], docs: [], count: 0 }; cur.folders.push(next); }
      cur = next;
    }
    cur.docs.push(n);
  }
  const count = (t: Tree): number => (t.count = t.docs.length + t.folders.reduce((s, f) => s + count(f), 0));
  count(root);
  const sortRec = (t: Tree) => { t.folders.sort((a, b) => a.name.localeCompare(b.name));
    t.docs.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")); t.folders.forEach(sortRec); };
  sortRec(root);
  return root;
}

/** Shared force simulation drawing onto a canvas. Returns cleanup. */
function runSim(cv: HTMLCanvasElement, nodes: Node[], edges: Edge[], opts: {
  center?: string; onOpen: (n: Node) => void; hotRef: { current: Node | null }; pannable?: boolean;
}) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const deg: Record<string, number> = {};
  edges.forEach((e) => { deg[e.from] = (deg[e.from] ?? 0) + 1; deg[e.to] = (deg[e.to] ?? 0) + 1; });
  nodes.forEach((n, i) => { const a = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
    const r = opts.center === n.id ? 0 : 90;
    n.x = Math.cos(a) * r + (Math.random() - 0.5) * 30; n.y = Math.sin(a) * r + (Math.random() - 0.5) * 30; n.vx = 0; n.vy = 0; });

  const ctx = cv.getContext("2d")!;
  let W = 0, H = 0, panX = 0, panY = 0, raf = 0;
  const dpr = devicePixelRatio || 1;
  const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const resize = () => { const p = cv.parentElement!; W = p.clientWidth; H = p.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  resize(); addEventListener("resize", resize);
  const small = !opts.pannable;

  const loop = () => {
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j]; let dx = b.x! - a.x!, dy = b.y! - a.y!; const d2 = dx * dx + dy * dy || 1;
      if (d2 < 90000) { const f = (small ? 700 : 1600) / d2; const d = Math.sqrt(d2); dx /= d; dy /= d;
        a.vx! -= dx * f; a.vy! -= dy * f; b.vx! += dx * f; b.vy! += dy * f; } }
    edges.forEach((e) => { const a = byId[e.from], b = byId[e.to]; if (!a || !b) return;
      const dx = b.x! - a.x!, dy = b.y! - a.y!, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - (small ? 70 : 110)) * 0.004; a.vx! += (dx / d) * f * d; a.vy! += (dy / d) * f * d;
      b.vx! -= (dx / d) * f * d; b.vy! -= (dy / d) * f * d; });
    nodes.forEach((n) => { if (opts.center === n.id) { n.x = 0; n.y = 0; return; }
      n.vx! -= n.x! * 0.003; n.vy! -= n.y! * 0.003;
      n.vx! *= 0.85; n.vy! *= 0.85; n.x! += n.vx!; n.y! += n.vy!; });

    const hot = opts.hotRef.current;
    ctx.clearRect(0, 0, W, H); ctx.save(); ctx.translate(W / 2 + panX, H / 2 + panY);
    ctx.strokeStyle = css("--rule"); ctx.lineWidth = 1;
    edges.forEach((e) => { const a = byId[e.from], b = byId[e.to]; if (!a || !b) return;
      ctx.globalAlpha = hot && (hot === a || hot === b) ? 1 : hot ? 0.25 : 0.8;
      ctx.beginPath(); ctx.moveTo(a.x!, a.y!); ctx.lineTo(b.x!, b.y!); ctx.stroke(); });
    nodes.forEach((n) => {
      const r = (small ? 4 : 5) + Math.min(9, (deg[n.id] ?? 0) * 1.4);
      const isCenter = opts.center === n.id;
      const linked = hot && edges.some((e) => (e.from === hot.id && e.to === n.id) || (e.to === hot.id && e.from === n.id));
      ctx.globalAlpha = !hot || n === hot || linked ? 1 : 0.3;
      ctx.fillStyle = isCenter ? css("--accent-2") : n === hot ? css("--accent-2") : css("--accent");
      ctx.beginPath(); ctx.arc(n.x!, n.y!, r, 0, 7); ctx.fill();
      if (isCenter) { ctx.strokeStyle = css("--accent-2"); ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.arc(n.x!, n.y!, r + 4, 0, 7); ctx.stroke(); ctx.strokeStyle = css("--rule"); }
      ctx.globalAlpha = !hot || n === hot || linked ? 0.95 : 0.25;
      ctx.fillStyle = css("--ink-2"); ctx.font = (small ? "10.5px " : "11.5px ") + css("--sans");
      const label = n.title.length > (small ? 16 : 24) ? n.title.slice(0, small ? 15 : 23) + "…" : n.title;
      ctx.fillText(label, n.x! + r + 5, n.y! + 4); });
    ctx.restore(); ctx.globalAlpha = 1;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const at = (ev: PointerEvent) => { const rect = cv.getBoundingClientRect();
    const x = ev.clientX - rect.left - W / 2 - panX, y = ev.clientY - rect.top - H / 2 - panY;
    return nodes.find((n) => (n.x! - x) ** 2 + (n.y! - y) ** 2 < 196); };
  let dragging = false, lx = 0, ly = 0, moved = 0;
  const down = (e: PointerEvent) => { dragging = true; lx = e.clientX; ly = e.clientY; moved = 0; };
  const move = (e: PointerEvent) => {
    if (dragging && opts.pannable) { panX += e.clientX - lx; panY += e.clientY - ly;
      moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly); lx = e.clientX; ly = e.clientY; return; }
    const n = at(e); opts.hotRef.current = n ?? null; cv.style.cursor = n ? "pointer" : "default"; };
  const up = (e: PointerEvent) => { const was = dragging; dragging = false;
    if ((!opts.pannable || (was && moved < 6))) { const n = at(e); if (n && moved < 6) opts.onOpen(n); } };
  cv.addEventListener("pointerdown", down); addEventListener("pointermove", move); addEventListener("pointerup", up);
  return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize);
    cv.removeEventListener("pointerdown", down); removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
}

function LocalGraph({ center, graph, onOpen }: { center: string; graph: { nodes: Node[]; edges: Edge[] }; onOpen: (n: Node) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hotRef = useRef<Node | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const near = new Set([center]);
    graph.edges.forEach((e) => { if (e.from === center) near.add(e.to); if (e.to === center) near.add(e.from); });
    const nodes = graph.nodes.filter((n) => near.has(n.id)).map((n) => ({ ...n }));
    const edges = graph.edges.filter((e) => near.has(e.from) && near.has(e.to));
    return runSim(ref.current, nodes, edges, { center, onOpen, hotRef });
  }, [center, graph, onOpen]);
  return <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />;
}

export function GraphView({ slug, orgName, role }: { slug: string; orgName: string; role: string }) {
  const [graph, setGraph] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [openDoc, setOpenDoc] = useState<{ path: string; title: string } | null>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const hotRef = useRef<Node | null>(null);
  const openRef = useRef<(path: string, title: string) => void>(() => {});
  openRef.current = (path, title) => { history.pushState({ doc: path }, "", `#${path}`); setOpenDoc({ path, title }); };

  useEffect(() => { fetch(`/api/graph?org=${slug}`).then((r) => r.json()).then(setGraph); }, [slug]);

  useEffect(() => {
    const onPop = () => setOpenDoc(location.hash.startsWith("#/")
      ? { path: location.hash.slice(1), title: location.hash.slice(1).split("/").pop() ?? "" } : null);
    addEventListener("popstate", onPop);
    if (location.hash.startsWith("#/")) {
      const p = location.hash.slice(1);
      setOpenDoc({ path: p, title: p.split("/").pop() ?? p });
    }
    return () => removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const href = (e.data as { pnsvOpen?: string })?.pnsvOpen;
      if (!href) return;
      const m = href.match(/^\/o\/[^/]+\/d(\/.+)$/);
      if (!m) return;
      const path = m[1];
      const title = graph?.nodes.find((n) => n.id === path)?.title ?? path;
      history.replaceState({ doc: path }, "", `#${path}`);
      setOpenDoc({ path, title });
    };
    addEventListener("message", onMsg);
    return () => removeEventListener("message", onMsg);
  }, [graph]);

  // 補標題：deep link 進來時 hash 只有路徑
  useEffect(() => {
    if (openDoc && graph) {
      const n = graph.nodes.find((x) => x.id === openDoc.path);
      if (n && n.title !== openDoc.title) setOpenDoc({ path: openDoc.path, title: n.title });
    }
  }, [graph, openDoc]);

  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    const t = setTimeout(() => {
      fetch(`/api/search?org=${slug}&q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json()).then((d) => setHits(d.hits ?? []));
    }, 200);
    return () => clearTimeout(t);
  }, [q, slug]);

  const visible = useMemo(() => {
    if (!graph) return null;
    const pref = filter ? filter + "/" : null;
    const nodes = (pref ? graph.nodes.filter((n) => n.id.startsWith(pref)) : graph.nodes).map((n) => ({ ...n }));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    return { nodes, edges };
  }, [graph, filter]);

  useEffect(() => {
    if (openDoc || !visible || !cvRef.current) return;
    return runSim(cvRef.current, visible.nodes, visible.edges,
      { onOpen: (n) => openRef.current(n.id, n.title), hotRef, pannable: true });
  }, [visible, openDoc]);

  const tree = useMemo(() => (graph ? buildTree(graph.nodes) : null), [graph]);
  const outs = openDoc && graph ? graph.edges.filter((e) => e.from === openDoc.path)
    .map((e) => graph.nodes.find((n) => n.id === e.to)).filter(Boolean) as Node[] : [];
  const ins = openDoc && graph ? graph.edges.filter((e) => e.to === openDoc.path)
    .map((e) => graph.nodes.find((n) => n.id === e.from)).filter(Boolean) as Node[] : [];

  const Folder = ({ t, depth }: { t: Tree; depth: number }) => (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: `5px 18px 5px ${18 + depth * 14}px`,
        cursor: "pointer", userSelect: "none",
        background: filter === t.path ? "var(--accent-wash)" : undefined }}>
        <span className="mono" style={{ fontSize: 9, color: "var(--ink-3)", width: 10 }}
          onClick={() => setClosed((c) => ({ ...c, [t.path]: !c[t.path] }))}>
          {closed[t.path] ? "▸" : "▾"}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", flex: 1 }}
          onClick={() => setFilter(filter === t.path ? null : t.path)}>
          {t.name}
        </span>
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>{t.count}</span>
      </div>
      {!closed[t.path] && (
        <div>
          {t.folders.map((f) => <Folder key={f.path} t={f} depth={depth + 1} />)}
          {t.docs.map((n) => <DocLink key={n.id} n={n} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );

  const DocLink = ({ n, depth }: { n: Node; depth: number }) => (
    <a href={`/o/${slug}/d${n.id}`} onClick={(e) => { e.preventDefault(); openRef.current(n.id, n.title); }}
      style={{ display: "block", padding: `6px 18px 6px ${20 + depth * 14}px`, textDecoration: "none",
        color: openDoc?.path === n.id ? "var(--accent-2)" : "var(--ink-2)", fontSize: 13.5, lineHeight: 1.35,
        background: openDoc?.path === n.id ? "var(--accent-wash)" : undefined }}>
      {n.title}
      <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginLeft: 7 }}>{n.date}</span>
    </a>
  );

  const RelLink = ({ n }: { n: Node }) => (
    <a href={`/o/${slug}/d${n.id}`} onClick={(e) => { e.preventDefault(); openRef.current(n.id, n.title); }}
      style={{ display: "block", padding: "4px 0", textDecoration: "none", color: "var(--ink-2)", fontSize: 13 }}>
      {n.title}
    </a>
  );

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <aside style={{ width: 320, minWidth: 270, borderRight: "1px solid var(--rule)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 18px 12px", borderBottom: "1px solid var(--rule)" }}>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 600 }}>{orgName}</h1>
          <div className="sub" style={{ marginTop: 3 }}>
            <a href={`/o/${slug}`} onClick={(e) => { e.preventDefault(); if (openDoc) history.back(); }}
              style={{ textDecoration: "none", cursor: "pointer" }}>graph</a>
            {" · "}
            <a href={`/o/${slug}/members`} style={{ textDecoration: "none" }}>members</a>
            {" · "}
            <a href={`/o/${slug}/settings`} style={{ textDecoration: "none" }}>settings</a>
          </div>
        </div>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--rule-soft)" }}>
          <input style={{ width: "100%", padding: "8px 11px", border: "1px solid var(--rule)",
            background: "var(--paper-2)", color: "var(--ink)", borderRadius: 6, fontSize: 13.5, outline: "none" }}
            placeholder="搜尋全文、標題、標籤…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {filter && (
          <div style={{ padding: "8px 18px", borderBottom: "1px solid var(--rule-soft)", fontSize: 12.5 }}>
            <span className="mono" style={{ color: "var(--accent-2)" }}>圖譜過濾：{filter}</span>
            <a style={{ marginLeft: 10, cursor: "pointer", color: "var(--accent-2)" }} onClick={() => setFilter(null)}>清除</a>
          </div>
        )}
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0 20px" }}>
          {hits !== null && (
            <div>
              <div className="sub" style={{ padding: "14px 18px 4px" }}>search · {hits.length}</div>
              {hits.map((h) => (
                <a key={h.path} href={`/o/${slug}/d${h.path}`}
                  onClick={(e) => { e.preventDefault(); openRef.current(h.path, h.title); }}
                  style={{ display: "block", padding: "8px 18px", textDecoration: "none", color: "var(--ink-2)",
                    fontSize: 13.5, lineHeight: 1.4 }}>
                  {h.title}
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.45 }}>{h.snippet}</div>
                </a>
              ))}
            </div>
          )}
          {hits === null && !graph && <div style={{ padding: 18, color: "var(--ink-3)" }}>loading…</div>}
          {hits === null && graph && !graph.nodes.length && (
            <div style={{ padding: 18, color: "var(--ink-3)", fontSize: 13.5, lineHeight: 1.6 }}>
              還沒有文件。到 <a href={`/o/${slug}/settings`}>settings</a> 掛一個
              GitHub repo，push 就會自動同步進來。
            </div>
          )}
          {hits === null && tree && (
            <div style={{ paddingTop: 6 }}>
              {tree.folders.map((f) => <Folder key={f.path} t={f} depth={0} />)}
              {tree.docs.map((n) => <DocLink key={n.id} n={n} depth={0} />)}
            </div>
          )}
        </nav>
      </aside>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {openDoc ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 16px",
              borderBottom: "1px solid var(--rule)", background: "var(--paper-2)" }}>
              <span style={{ fontFamily: "var(--serif)", fontSize: 15.5, color: "var(--ink)", flex: 1,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{openDoc.title}</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{openDoc.path}</span>
              <a href={`/o/${slug}/d${openDoc.path}`} target="_blank" rel="noreferrer"
                style={{ fontSize: 12.5, color: "var(--accent-2)", textDecoration: "none" }}>開新分頁 ↗</a>
              <button onClick={() => history.back()} title="關閉"
                style={{ border: "1px solid var(--rule)", background: "var(--paper)", color: "var(--ink)",
                  borderRadius: 6, padding: "3px 10px", fontSize: 13, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
              <iframe key={openDoc.path} src={`/o/${slug}/d${openDoc.path}?embed=1`}
                style={{ flex: 1, border: 0, minWidth: 0 }} />
              {graph && (
                <div style={{ width: 264, borderLeft: "1px solid var(--rule)", display: "flex",
                  flexDirection: "column", overflowY: "auto", background: "var(--paper)" }}>
                  <div className="sub" style={{ padding: "12px 16px 6px" }}>local graph</div>
                  <div style={{ height: 190, borderBottom: "1px solid var(--rule-soft)",
                    background: "radial-gradient(var(--rule-soft) 1px, transparent 1px)", backgroundSize: "22px 22px" }}>
                    <LocalGraph center={openDoc.path} graph={graph}
                      onOpen={(n) => openRef.current(n.id, n.title)} />
                  </div>
                  <div style={{ padding: "10px 16px 20px" }}>
                    {outs.length > 0 && <>
                      <div className="sub" style={{ padding: "8px 0 4px" }}>links to</div>
                      {outs.map((n) => <RelLink key={n.id} n={n} />)}
                    </>}
                    {ins.length > 0 && <>
                      <div className="sub" style={{ padding: "12px 0 4px" }}>linked from</div>
                      {ins.map((n) => <RelLink key={n.id} n={n} />)}
                    </>}
                    {!outs.length && !ins.length && (
                      <div style={{ fontSize: 12.5, color: "var(--ink-3)", paddingTop: 8 }}>
                        這份文件還沒有任何連結。
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, position: "relative",
            background: "radial-gradient(var(--rule-soft) 1px, transparent 1px)", backgroundSize: "26px 26px" }}>
            <canvas ref={cvRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
            <div className="mono" style={{ position: "absolute", right: 16, bottom: 12, fontSize: 10.5, color: "var(--ink-3)" }}>
              drag to pan · click node to open{filter ? ` · filtered: ${filter}` : ""}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
