"use client";
import { useEffect, useRef, useState } from "react";

type Node = { id: string; title: string; date?: string | null; dir: string; tags: string[]; x?: number; y?: number; vx?: number; vy?: number };
type Edge = { from: string; to: string };

export function GraphView({ slug, orgName, role }: { slug: string; orgName: string; role: string }) {
  const [graph, setGraph] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const [q, setQ] = useState("");
  const cvRef = useRef<HTMLCanvasElement>(null);
  const hotRef = useRef<Node | null>(null);

  useEffect(() => { fetch(`/api/graph?org=${slug}`).then((r) => r.json()).then(setGraph); }, [slug]);

  useEffect(() => {
    if (!graph || !cvRef.current) return;
    const nodes = graph.nodes; const edges = graph.edges;
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
      if (was && moved < 6) { const n = at(e); if (n) location.href = `/o/${slug}/d${n.id}`; } };
    cv.addEventListener("pointerdown", down); addEventListener("pointermove", move); addEventListener("pointerup", up);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize);
      cv.removeEventListener("pointerdown", down); removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
  }, [graph, slug]);

  const f = q.toLowerCase();
  const shown = (graph?.nodes ?? []).filter((n) => !f || n.title.toLowerCase().includes(f)
    || n.id.toLowerCase().includes(f) || n.tags.join(",").toLowerCase().includes(f));
  const groups: Record<string, Node[]> = {};
  shown.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).forEach((n) => (groups[n.dir] ??= []).push(n));

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <aside style={{ width: 320, minWidth: 260, borderRight: "1px solid var(--rule)", display: "flex", flexDirection: "column" }}>
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
          <input style={{ width: "100%" }} placeholder="搜尋標題、標籤…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0 20px" }}>
          {!graph && <div style={{ padding: 18, color: "var(--ink-3)" }}>loading…</div>}
          {graph && !graph.nodes.length && (
            <div style={{ padding: 18, color: "var(--ink-3)", fontSize: 13.5, lineHeight: 1.6 }}>
              還沒有文件。用 CLI 推上來：<br />
              <code className="mono" style={{ fontSize: 11 }}>pensieve push --dir docs</code><br />
              （token 在 settings 產生）
            </div>
          )}
          {Object.entries(groups).map(([dir, ds]) => (
            <div key={dir}>
              <div className="sub" style={{ padding: "14px 18px 4px" }}>{dir}</div>
              {ds.map((n) => (
                <a key={n.id} href={`/o/${slug}/d${n.id}`} style={{ display: "block", padding: "8px 18px",
                  textDecoration: "none", color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.4 }}>
                  {n.title}
                  <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 1 }}>{n.date}</div>
                </a>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main style={{ flex: 1, position: "relative",
        background: "radial-gradient(var(--rule-soft) 1px, transparent 1px)", backgroundSize: "26px 26px" }}>
        <canvas ref={cvRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
        <div className="mono" style={{ position: "absolute", right: 16, bottom: 12, fontSize: 10.5, color: "var(--ink-3)" }}>
          drag to pan · click node to open
        </div>
      </main>
    </div>
  );
}
