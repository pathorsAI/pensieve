"use client";
import { useEffect, useState } from "react";

type Source = { id: string; repo: string | null; branch: string | null; folder: string | null; mount: string; lastSyncAt: string | null };
type Installation = { installationId: string; account: string; repos: { fullName: string; defaultBranch: string }[] };

export function SettingsClient({ slug, orgName }: { slug: string; orgName: string }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [insts, setInsts] = useState<Installation[] | null>(null);
  const [appMissing, setAppMissing] = useState(false);
  const [appSlug, setAppSlug] = useState<string | null>(null);
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [folder, setFolder] = useState("");
  const [mount, setMount] = useState("/");
  const [msg, setMsg] = useState("");

  const load = () => {
    fetch(`/api/sources?org=${slug}`).then((r) => r.json()).then((d) => setSources(d.sources ?? []));
    fetch("/api/github/installations").then((r) => r.json()).then((d) => {
      setInsts(d.installations ?? []); setAppMissing(!!d.appMissing); setAppSlug(d.appSlug ?? null);
    });
  };
  useEffect(load, [slug]);

  const allRepos = (insts ?? []).flatMap((i) => i.repos.map((r) => ({ ...r, installationId: i.installationId })));
  const chosen = allRepos.find((r) => r.fullName === repo);

  return (
    <main className="page">
      <div className="sub"><a href={`/o/${slug}`} style={{ textDecoration: "none" }}>← {orgName}</a></div>
      <h1>Sync sources</h1>
      <p style={{ color: "var(--ink-3)", fontSize: 13.5, lineHeight: 1.7, maxWidth: 640, margin: "6px 0 18px" }}>
        Git 是唯一的資料來源：把 repo（或其中一個 folder）掛進來，push 之後 webhook 自動同步。
        Pensieve 這邊唯讀——沒有上傳、沒有反向寫回。
      </p>

      {appMissing && <div className="card">GitHub App 未設定（缺 GITHUB_APP_* secrets）。</div>}
      {insts && !appMissing && !allRepos.length && (
        <div className="card">
          <div style={{ marginBottom: 10 }}>還沒有可用的 repo——先把 GitHub App 裝到你的帳號或 org，安裝頁上就能勾選 repo。</div>
          {appSlug && (
            <a href={`https://github.com/apps/${appSlug}/installations/new`} target="_blank" rel="noreferrer">
              <button className="primary">Install GitHub App →</button>
            </a>
          )}
          <span style={{ marginLeft: 10, fontSize: 12.5, color: "var(--ink-3)" }}>裝完回來重新整理這頁</span>
        </div>
      )}
      {allRepos.length > 0 && appSlug && (
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 10 }}>
          要加別的 repo？<a href={`https://github.com/apps/${appSlug}/installations/new`} target="_blank" rel="noreferrer">管理 App 安裝</a>，改完回來重新整理。
        </p>
      )}

      {allRepos.length > 0 && (
        <div className="row" style={{ marginBottom: 8 }}>
          <select value={repo} onChange={(e) => { setRepo(e.target.value);
            const r = allRepos.find((x) => x.fullName === e.target.value);
            if (r) setBranch(r.defaultBranch); }}>
            <option value="">選 repo…</option>
            {allRepos.map((r) => <option key={r.fullName} value={r.fullName}>{r.fullName}</option>)}
          </select>
          <input placeholder="branch" style={{ width: 90 }} value={branch} onChange={(e) => setBranch(e.target.value)} />
          <input placeholder="folder（空＝整個 repo）" style={{ width: 180 }} value={folder} onChange={(e) => setFolder(e.target.value)} />
          <input placeholder="mount" style={{ width: 90 }} value={mount} onChange={(e) => setMount(e.target.value)} />
          <button className="primary" disabled={!chosen} onClick={async () => {
            setMsg("adding…");
            const r = await fetch("/api/sources", { method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ org: slug, repo, branch, folder, mount, installationId: chosen!.installationId }) });
            const d = await r.json();
            if (d.id) { setMsg("syncing…");
              const s = await fetch("/api/sources", { method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ org: slug, syncId: d.id }) });
              const sd = await s.json(); setMsg(sd.error ? `✗ ${sd.error}` : `✓ 已同步 ${sd.synced} 份`); }
            load();
          }}>Add + sync</button>
        </div>
      )}

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
              const d = await r.json(); setMsg(d.error ? `✗ ${d.error}` : `✓ 已同步 ${d.synced} 份`); load();
            }}>Sync now</button></td>
          </tr>))}</tbody>
      </table>
      <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 6 }}>{msg}</p>
    </main>
  );
}
