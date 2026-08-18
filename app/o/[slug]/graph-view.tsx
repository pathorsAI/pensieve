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

export function GraphView({ slug, orgName, role }: { slug: string; orgName: string; role: string }) {
  const [graph, setGraph] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [filter, setFilter] = useState<string | null>(null);   // folder path prefix
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const cvRef = useRef<HTMLCanvasElement>(null);
  const hotRef = useRef<Node | null>(null);
  const [openDoc, setOpenDoc] = useState<{ path: string; title: string } | null>(null);
  const openRef = useRef<(path: string, title: string) => void>(() => {});
  openRef.current = (path, title) => { history.pushState({ doc: path }, "", `#${path}`); setOpenDoc({ path, title }); };

  useEffect(() => {
    const onPop = () => setOpenDoc(null);
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

  useEffect(() => { fetch(`/api/graph?org=${slug}`).then((r) => r.json()).then(setGraph); }, [slug]);

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
    const nodes = pref ? graph.nodes.filter((n) => n.id.startsWith(pref)) : graph.nodes;
    const ids = new Set(nodes.map((n) => n.id));
    const edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    return { nodes, edges };
  }, [graph, filter]);

  useEffect(() => {
    if (!visible || !cvRef.current) return;
    const nodes = visible.nodes, edges = visible.edges;
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const deg: Record<string, number> = {};
    edges.forEach((e) => { deg[e.from] = (deg[e.from] ?? 0) + 1; deg[e.to] = (deg[e.to] ?? 0) + 1; });
    nodes.forEach((n, i) => { const a = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
      n.x = Math.cos(a) * 120 + (Math.random() - 0.5) * 40; n.y = Math.sin(a) * 120 + (Math.random() - 0.5) * 40; n.vx = 0; n.vy = 0; });

    const cv = cvRef.current; const ctx = cv.getContext("2d")!;
    let W = 0, H = 0, panX = 0, panY = 0, raf = 0;
    const dpr = devicePixelRatio || 1;
    const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const resize = () => { const p = cv.parentElement!; W = p.clientWidth; H = p.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); addEventListener("resize", resize);

    const loop = () => {
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]; let dx = b.x! - a.x!, dy = b.y! - a.y!; const d2 = dx * dx + dy * dy || 1;
        if (d2 < 90000) { const f = 1600 / d2; const d = Math.sqrt(d2); dx /= d; dy /= d;
          a.vx! -= dx * f; a.vy! -= dy * f; b.vx! += dx * f; b.vy! += dy * f; } }
      edges.forEach((e) => { const a = byId[e.from], b = byId[e.to]; if (!a || !b) return;
        const dx = b.x! - a.x!, dy = b.y! - a.y!, d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - 110) * 0.004; a.vx! += (dx / d) * f * d; a.vy! += (dy / d) * f * d;
        b.vx! -= (dx / d) * f * d; b.vy! -= (dy / d) * f * d; });
      nodes.forEach((n) => { n.vx! -= n.x! * 0.003; n.vy! -= n.y! * 0.003;
        n.vx! *= 0.85; n.vy! *= 0.85; n.x! += n.vx!; n.y! += n.vy!; });

      const hot = hotRef.current;
      ctx.clearRect(0, 0, W, H); ctx.save(); ctx.translate(W / 2 + panX, H / 2 + panY);
      ctx.strokeStyle = css("--rule"); ctx.lineWidth = 1;
      edges.forEach((e) => { const a = byId[e.from], b = byId[e.to]; if (!a || !b) return;
        ctx.globalAlpha = hot && (hot === a || hot === b) ? 1 : hot ? 0.25 : 0.8;
        ctx.beginPath(); ctx.moveTo(a.x!, a.y!); ctx.lineTo(b.x!, b.y!); ctx.stroke(); });
      nodes.forEach((n) => {
        const r = 5 + Math.min(9, (deg[n.id] ?? 0) * 1.6);
        const linked = hot && edges.some((e) => (e.from === hot.id && e.to === n.id) || (e.to === hot.id && e.from === n.id));
        ctx.globalAlpha = !hot || n === hot || linked ? 1 : 0.3;
        ctx.fillStyle = n === hot ? css("--accent-2") : css("--accent");
        ctx.beginPath(); ctx.arc(n.x!, n.y!, r, 0, 7); ctx.fill();
        ctx.globalAlpha = !hot || n === hot || linked ? 1 : 0.25;
        ctx.fillStyle = css("--ink-2"); ctx.font = "11.5px " + css("--sans");
        ctx.fillText(n.title.length > 24 ? n.title.slice(0, 23) + "…" : n.title, n.x! + r + 5, n.y! + 4); });
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
      if (dragging) { panX += e.clientX - lx; panY += e.clientY - ly;
        moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly); lx = e.clientX; ly = e.clientY; return; }
      const n = at(e); hotRef.current = n ?? null; cv.style.cursor = n ? "pointer" : "default"; };
    const up = (e: PointerEvent) => { const was = dragging; dragging = false;
      if (was && moved < 6) { const n = at(e); if (n) openRef.current(n.id, n.title); } };
    cv.addEventListener("pointerdown", down); addEventListener("pointermove", move); addEventListener("pointerup", up);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize);
      cv.removeEventListener("pointerdown", down); removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
  }, [visible, slug]);

  const tree = useMemo(() => (graph ? buildTree(graph.nodes) : null), [graph]);

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
          {t.docs.map((n) => (
            <a key={n.id} href={`/o/${slug}/d${n.id}`} onClick={(e) => { e.preventDefault(); openRef.current(n.id, n.title); }} style={{ display: "block",
              padding: `6px 18px 6px ${34 + depth * 14}px`, textDecoration: "none",
              color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.35 }}>
              {n.title}
              <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginLeft: 7 }}>{n.date}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <aside style={{ width: 340, minWidth: 280, borderRight: "1px solid var(--rule)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 18px 12px", borderBottom: "1px solid var(--rule)" }}>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 600 }}>{orgName}</h1>
          <div className="sub" style={{ marginTop: 3 }}>
            <a href={`/o/${slug}/members`} style={{ textDecoration: "none" }}>members</a>
            {" · "}
            <a href={`/o/${slug}/settings`} style={{ textDecoration: "none" }}>settings</a>
            {" · "}{role}
          </div>
        </div>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--rule-soft)" }}>
          <input style={{ width: "100%" }} placeholder="搜尋全文、標題、標籤…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {filter && (
          <div style={{ padding: "8px 18px", borderBottom: "1px solid var(--rule-soft)", fontSize: 12.5 }}>
            <span className="mono" style={{ color: "var(--accent-2)" }}>圖譜過濾：{filter}</span>
            <a style={{ marginLeft: 10, cursor: "pointer" }} onClick={() => setFilter(null)}>清除</a>
          </div>
        )}
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0 20px" }}>
          {hits !== null && (
            <div>
              <div className="sub" style={{ padding: "14px 18px 4px" }}>search · {hits.length}</div>
              {hits.map((h) => (
                <a key={h.path} href={`/o/${slug}/d${h.path}`} onClick={(e) => { e.preventDefault(); openRef.current(h.path, h.title); }} style={{ display: "block", padding: "8px 18px",
                  textDecoration: "none", color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.4 }}>
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
              {tree.docs.map((n) => (
                <a key={n.id} href={`/o/${slug}/d${n.id}`} onClick={(e) => { e.preventDefault(); openRef.current(n.id, n.title); }} style={{ display: "block", padding: "6px 18px",
                  textDecoration: "none", color: "var(--ink-2)", fontSize: 13.5 }}>
                  {n.title}
                  <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginLeft: 7 }}>{n.date}</span>
                </a>
              ))}
            </div>
          )}
        </nav>
      </aside>
      <main style={{ flex: 1, position: "relative",
        background: "radial-gradient(var(--rule-soft) 1px, transparent 1px)", backgroundSize: "26px 26px" }}>
        <canvas ref={cvRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
        <div className="mono" style={{ position: "absolute", right: 16, bottom: 12, fontSize: 10.5, color: "var(--ink-3)" }}>
          drag to pan · click node to open{filter ? ` · filtered: ${filter}` : ""}
        </div>
      </main>
      {openDoc && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column",
          background: "var(--paper)", animation: "pnsvFade .16s ease" }}>
          <style>{`@keyframes pnsvFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; } }`}</style>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 16px",
            borderBottom: "1px solid var(--rule)", background: "var(--paper-2)" }}>
            <button onClick={() => history.back()} style={{ border: "1px solid var(--rule)", background: "var(--paper)",
              color: "var(--ink)", borderRadius: 6, padding: "4px 12px", fontSize: 13, cursor: "pointer" }}>← 返回</button>
            <span style={{ fontFamily: "var(--serif)", fontSize: 15, color: "var(--ink)", flex: 1,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{openDoc.title}</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{openDoc.path}</span>
            <a href={`/o/${slug}/d${openDoc.path}`} target="_blank" rel="noreferrer"
              style={{ fontSize: 12.5, color: "var(--accent-2)" }}>開新分頁 ↗</a>
          </div>
          <iframe src={`/o/${slug}/d${openDoc.path}?embed=1`} style={{ flex: 1, border: 0, width: "100%" }} />
        </div>
      )}
    </div>
  );
}
