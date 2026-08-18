"use client";
import { useEffect, useState } from "react";

type Token = { id: string; name: string; createdAt: string; lastUsedAt: string | null };
type Source = { id: string; repo: string | null; branch: string | null; folder: string | null; mount: string; installationId: string | null; lastSyncAt: string | null };

export function SettingsClient({ slug, orgName }: { slug: string; orgName: string }) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [fresh, setFresh] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [src, setSrc] = useState({ repo: "", branch: "main", folder: "", mount: "/", installationId: "" });
  const [msg, setMsg] = useState("");

  const load = () => {
    fetch(`/api/tokens?org=${slug}`).then((r) => r.json()).then((d) => setTokens(d.tokens ?? []));
    fetch(`/api/sources?org=${slug}`).then((r) => r.json()).then((d) => setSources(d.sources ?? []));
  };
  useEffect(load, [slug]);

  return (
    <main className="page">
      <div className="sub"><a href={`/o/${slug}`} style={{ textDecoration: "none" }}>← {orgName}</a></div>
      <h1>Settings</h1>

      <h2>API tokens（CLI push 用）</h2>
      <div className="row">
        <input placeholder="token name" value={tokenName} onChange={(e) => setTokenName(e.target.value)} />
        <button className="primary" onClick={async () => {
          const r = await fetch("/api/tokens", { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ org: slug, name: tokenName }) });
          const d = await r.json(); setFresh(d.token ?? ""); load();
        }}>Create</button>
      </div>
      {fresh && (
        <div className="card mono" style={{ fontSize: 13 }}>
          {fresh}
          <div style={{ fontFamily: "var(--sans)", color: "var(--ink-3)", fontSize: 12, marginTop: 6 }}>
            只顯示這一次，存起來。用法：<code>PENSIEVE_TOKEN={fresh.slice(0, 12)}… pensieve push --dir docs</code>
          </div>
        </div>
      )}
      <table className="t"><thead><tr><th>name</th><th>created</th><th>last used</th></tr></thead>
        <tbody>{tokens.map((t) => <tr key={t.id}><td>{t.name}</td>
          <td className="mono" style={{ fontSize: 11 }}>{t.createdAt?.slice(0, 10)}</td>
          <td className="mono" style={{ fontSize: 11 }}>{t.lastUsedAt?.slice(0, 10) ?? "—"}</td></tr>)}</tbody>
      </table>

      <h2>Sync sources（GitHub repo → workspace）</h2>
      <p style={{ color: "var(--ink-3)", fontSize: 13.5, lineHeight: 1.6, maxWidth: 640 }}>
        需要先安裝 Pensieve GitHub App 到目標 repo（拿到 installation id）。
        一個 workspace 可以掛多個 repo／folder，各自指定 mount prefix。push 到 repo 會經 webhook 自動同步。
      </p>
      <div className="row" style={{ marginBottom: 8 }}>
        <input placeholder="owner/repo" style={{ width: 200 }} value={src.repo} onChange={(e) => setSrc({ ...src, repo: e.target.value })} />
        <input placeholder="branch" style={{ width: 90 }} value={src.branch} onChange={(e) => setSrc({ ...src, branch: e.target.value })} />
        <input placeholder="folder（空=整個 repo）" style={{ width: 170 }} value={src.folder} onChange={(e) => setSrc({ ...src, folder: e.target.value })} />
        <input placeholder="mount" style={{ width: 90 }} value={src.mount} onChange={(e) => setSrc({ ...src, mount: e.target.value })} />
        <input placeholder="installation id" style={{ width: 130 }} value={src.installationId} onChange={(e) => setSrc({ ...src, installationId: e.target.value })} />
        <button className="primary" onClick={async () => {
          await fetch("/api/sources", { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ org: slug, ...src }) });
          load();
        }}>Add</button>
      </div>
      <table className="t"><thead><tr><th>repo</th><th>folder</th><th>mount</th><th>last sync</th><th></th></tr></thead>
        <tbody>{sources.map((s) => (
          <tr key={s.id}>
            <td className="mono" style={{ fontSize: 12 }}>{s.repo}@{s.branch}</td>
            <td className="mono" style={{ fontSize: 12 }}>{s.folder || "/"}</td>
            <td className="mono" style={{ fontSize: 12 }}>{s.mount}</td>
            <td className="mono" style={{ fontSize: 11 }}>{s.lastSyncAt?.slice(0, 16) ?? "never"}</td>
            <td><button onClick={async () => {
              setMsg("syncing…");
              const r = await fetch("/api/sources", { method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ org: slug, syncId: s.id }) });
              const d = await r.json(); setMsg(d.error ? `✗ ${d.error}` : `✓ synced ${d.synced}`); load();
            }}>Sync now</button></td>
          </tr>))}</tbody>
      </table>
      <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 6 }}>{msg}</p>
    </main>
  );
}
