"use client";
import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Source = { id: string; repo: string | null; branch: string | null; folder: string | null; mount: string; lastSyncAt: string | null };

function SourceRow({ s, slug, setMsg, reload, runSync, busy }: {
  s: Source; slug: string; setMsg: (m: string) => void; reload: () => void; runSync: (id: string) => void; busy: string | null;
}) {
  const [branch, setBranch] = useState(s.branch ?? "main");
  const [folder, setFolder] = useState(s.folder ?? "");
  const [mount, setMount] = useState(s.mount);
  const dirty = branch !== (s.branch ?? "main") || folder !== (s.folder ?? "") || mount !== s.mount;
  return (
    <TableRow>
      <TableCell className="mono text-xs">{s.repo}</TableCell>
      <TableCell><Input className="w-24 h-7 mono text-xs" value={branch} onChange={(e) => setBranch(e.target.value)} /></TableCell>
      <TableCell><Input className="w-28 h-7 mono text-xs" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="/" /></TableCell>
      <TableCell><Input className="w-24 h-7 mono text-xs" value={mount} onChange={(e) => setMount(e.target.value)} /></TableCell>
      <TableCell className="mono text-[11px]">{s.lastSyncAt?.slice(0, 16) ?? "never"}</TableCell>
      <TableCell className="whitespace-nowrap">
        {dirty ? (
          <Button size="sm" onClick={async () => {
            setMsg("saving…");
            const r = await fetch("/api/sources", { method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ org: slug, updateId: s.id, branch, folder, mount }) });
            const d = await r.json(); setMsg(d.error ? `✗ ${d.error}` : `✓ 已改設定並重新同步 ${d.synced} 份`); reload();
          }}>Save + resync</Button>
        ) : (
          <Button variant="outline" size="sm" disabled={busy === s.id} onClick={() => runSync(s.id)}>
            {busy === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Sync</Button>
        )}
        <Button variant="ghost" size="sm" className="ml-1" style={{ color: "var(--risk)" }} onClick={async () => {
          if (!confirm(`移除 ${s.repo}？它同步進來的文件會一併刪除（repo 本身不動）。`)) return;
          await fetch("/api/sources", { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ org: slug, deleteId: s.id }) });
          setMsg("✓ 已移除"); reload();
        }}>移除</Button>
      </TableCell>
    </TableRow>
  );
}
type Installation = { installationId: string; account: string; repos: { fullName: string; defaultBranch: string }[] };

export function SettingsClient({ slug, orgName }: { slug: string; orgName: string }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [insts, setInsts] = useState<Installation[] | null>(null);
  const [appMissing, setAppMissing] = useState(false);
  const [appSlug, setAppSlug] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [folder, setFolder] = useState("");
  const [mount, setMount] = useState("/");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    fetch(`/api/sources?org=${slug}`).then((r) => r.json()).then((d) => setSources(d.sources ?? []));
    fetch("/api/github/installations").then((r) => r.json()).then((d) => {
      setInsts(d.installations ?? []); setAppMissing(!!d.appMissing); setAppSlug(d.appSlug ?? null);
    });
  };
  useEffect(load, [slug]);

  const allRepos = (insts ?? []).flatMap((i) => i.repos.map((r) => ({ ...r, installationId: i.installationId })));
  const chosen = allRepos.find((r) => r.fullName === repo);
  const installUrl = appSlug ? `https://github.com/apps/${appSlug}/installations/new` : null;

  const runSync = async (syncId: string) => {
    setBusy(syncId); setMsg("syncing…");
    const r = await fetch("/api/sources", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ org: slug, syncId }) });
    const d = await r.json(); setMsg(d.error ? `✗ ${d.error}` : `✓ 已同步 ${d.synced} 份`); setBusy(null); load();
  };

  return (
    <main className="page">
      <div className="sub"><a href={`/o/${slug}`} className="no-underline">← {orgName}</a></div>
      <h1>Sync sources</h1>
      <p className="text-sm leading-relaxed max-w-xl mb-5" style={{ color: "var(--ink-3)" }}>
        Git 是唯一的資料來源：把 repo（或其中一個 folder）掛進來，push 之後 webhook 自動同步。
        支援 <code className="mono">.html</code> 與 <code className="mono">.md</code>。Pensieve 唯讀，不寫回。
      </p>

      {insts === null && (
        <div className="flex flex-col gap-2 mb-4">
          <Skeleton className="h-9 w-[420px]" /><Skeleton className="h-9 w-[340px]" />
        </div>
      )}
      {appMissing && <Card className="mb-4"><CardContent className="pt-4 text-sm">GitHub App 未設定（缺 GITHUB_APP_* secrets）。</CardContent></Card>}

      {insts && !appMissing && !allRepos.length && (
        <Card className="mb-4"><CardContent className="pt-4 flex items-center gap-3 text-sm">
          <span>還沒有可用的 repo——先把 GitHub App 裝到你的帳號或 org，安裝頁上就能勾選 repo。</span>
          {installUrl && <a href={installUrl} target="_blank" rel="noreferrer">
            <Button>Install GitHub App <ExternalLink className="size-3.5" /></Button></a>}
        </CardContent></Card>
      )}

      {allRepos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-[280px] justify-between font-normal">
                {repo || "選 repo…"}
                <ChevronsUpDown className="size-3.5 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0">
              <Command>
                <CommandInput placeholder="搜尋 repo…" />
                <CommandList>
                  <CommandEmpty>找不到。</CommandEmpty>
                  <CommandGroup>
                    {allRepos.map((r) => (
                      <CommandItem key={r.fullName} value={r.fullName} onSelect={(v) => {
                        setRepo(v); setBranch(r.defaultBranch); setOpen(false); }}>
                        <Check className={cn("size-3.5", repo === r.fullName ? "opacity-100" : "opacity-0")} />
                        {r.fullName}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Input className="w-24" placeholder="branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
          <Input className="w-44" placeholder="folder（空＝整個 repo）" value={folder} onChange={(e) => setFolder(e.target.value)} />
          <Input className="w-24" placeholder="mount" value={mount} onChange={(e) => setMount(e.target.value)} />
          <Button disabled={!chosen || busy === "add"} onClick={async () => {
            setBusy("add"); setMsg("adding…");
            const r = await fetch("/api/sources", { method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ org: slug, repo, branch, folder, mount, installationId: chosen!.installationId }) });
            const d = await r.json();
            if (d.id) await runSync(d.id); else load();
            setBusy(null);
          }}>{busy === "add" ? <Loader2 className="size-3.5 animate-spin" /> : null}Add + sync</Button>
        </div>
      )}
      {allRepos.length > 0 && installUrl && (
        <p className="text-xs mb-4" style={{ color: "var(--ink-3)" }}>
          要加別的 repo？<a className="underline" href={installUrl} target="_blank" rel="noreferrer">管理 App 安裝</a>，改完回來重新整理。
        </p>
      )}

      <Table>
        <TableHeader><TableRow>
          <TableHead>repo</TableHead><TableHead>branch</TableHead><TableHead>folder</TableHead>
          <TableHead>mount</TableHead><TableHead>last sync</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {sources.map((s) => (
            <SourceRow key={s.id} s={s} slug={slug} setMsg={setMsg} reload={load} runSync={runSync} busy={busy} />
          ))}
        </TableBody>
      </Table>
      <p className="text-sm mt-2" style={{ color: "var(--ink-3)" }}>{msg}</p>
    </main>
  );
}
