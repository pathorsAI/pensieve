import type { ReactNode } from "react";
import { dictFor, type Locale } from "@/lib/i18n-dict";
import { LanguageSwitch } from "./language-switch";

type Props = Readonly<{
  locale: Locale;
  /** Mono eyebrow above the title, e.g. "登入 · jack-db85". */
  ctx: string;
  title: ReactNode;
  lead?: ReactNode;
  /** "missing": the highlighted node is an empty dashed ring — the page the reader wanted is not theirs. */
  variant?: "default" | "missing";
  children?: ReactNode;
}>;

/**
 * The one layout every sign-in-related screen shares: brand panel with the
 * relationship graph on the left, the screen's own content on the right.
 * Server-safe; only the language switcher in the footer is a client island.
 */
export function AuthShell({ locale, ctx, title, lead, variant = "default", children }: Props) {
  const t = dictFor(locale);
  return (
    <main className="auth-shell">
      <div className="auth-art">
        <Graph missing={variant === "missing"} />
        <div className="auth-brand"><i />Pensieve</div>
        <div className="auth-tag">
          <b>{t.art.tagline}</b>
          <span>{t.art.sub}</span>
        </div>
      </div>
      <div className="auth-form">
        <div className="auth-body">
          <span className="auth-ctx">{ctx}</span>
          <h1>{title}</h1>
          {lead && <p className="auth-lead">{lead}</p>}
          {children}
        </div>
        <footer className="auth-foot">
          <span>Pathors</span>
          <LanguageSwitch locale={locale} />
        </footer>
      </div>
    </main>
  );
}

// Same visual language as the workspace graph view: nodes, links, one lit node.
const NODES: [number, number, number][] = [
  [70, 120, 3], [170, 90, 4], [330, 110, 3], [140, 210, 4], [90, 300, 3],
  [200, 300, 3.5], [350, 330, 3], [230, 380, 3], [360, 200, 3], [290, 260, 3.5],
];
const HUB: [number, number] = [250, 160];
const EDGES: [number, number, number, number][] = [
  [70, 120, 170, 90], [170, 90, 250, 160], [250, 160, 330, 110], [170, 90, 140, 210],
  [140, 210, 250, 160], [140, 210, 90, 300], [250, 160, 290, 260], [290, 260, 200, 300],
  [200, 300, 140, 210], [290, 260, 350, 330], [200, 300, 230, 380], [330, 110, 360, 200],
  [360, 200, 290, 260],
];
const touchesHub = ([x1, y1, x2, y2]: number[]) =>
  (x1 === HUB[0] && y1 === HUB[1]) || (x2 === HUB[0] && y2 === HUB[1]);

function Graph({ missing }: Readonly<{ missing: boolean }>) {
  // With the hub missing, its links go too: the same graph, minus the one
  // point the reader was trying to reach.
  const edges = missing ? EDGES.filter((e) => !touchesHub(e)) : EDGES;
  return (
    <svg className="auth-graph" viewBox="0 0 400 440" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <g stroke="#3E5A86" strokeWidth="1" opacity={missing ? 0.4 : 0.55}>
        {edges.map(([x1, y1, x2, y2]) => <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />)}
      </g>
      <g fill="#5C7DB3">
        {NODES.map(([cx, cy, r]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />)}
      </g>
      {missing ? (
        <circle cx={HUB[0]} cy={HUB[1]} r="6" fill="none" stroke="#9FBEF5" strokeWidth="1.5" strokeDasharray="3 3" />
      ) : (
        <>
          <circle cx={HUB[0]} cy={HUB[1]} r="16" fill="#7FA8F0" opacity=".16" />
          <circle cx={HUB[0]} cy={HUB[1]} r="6" fill="#9FBEF5" />
        </>
      )}
    </svg>
  );
}
