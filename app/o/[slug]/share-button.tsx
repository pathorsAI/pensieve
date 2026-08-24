"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Share = { id: string; path: string; url: string };

/**
 * Create / copy / revoke the public link for one document.
 *
 * The link lives on the share origin (SHARE_HOST), not this one — see
 * middleware.ts. Revoking deletes the row, so the old URL dies immediately and
 * re-sharing mints a fresh token.
 */
export function ShareButton({ slug, path }: Readonly<{ slug: string; path: string }>) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // the popover is the only place this state is shown, so only look it up when
  // it opens — the workspace can hold far more documents than shares
  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true); setError(null);
    (async () => {
      try {
        const r = await fetch(`/api/shares?org=${encodeURIComponent(slug)}`);
        if (!r.ok) throw new Error(String(r.status));
        const d = await r.json() as { shares: Share[] };
        if (live) setUrl(d.shares.find((s) => s.path === path)?.url ?? null);
      } catch {
        if (live) setError("讀取分享狀態失敗");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [open, slug, path]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/shares", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ org: slug, path, ...body }),
      });
      const d = await r.json() as { url?: string; error?: string };
      if (!r.ok) throw new Error(d.error ?? String(r.status));
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗");
      return null;
    } finally {
      setBusy(false);
    }
  }, [slug, path]);

  const create = async () => { const d = await post({}); if (d?.url) setUrl(d.url); };
  const revoke = async () => { const d = await post({ revoke: true }); if (d) { setUrl(null); setCopied(false); } };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("無法複製，請手動選取");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" title="公開分享">
          <Link2 className="size-3.5" />
          {url ? "已分享" : "分享"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-sm">
        <div className="font-medium mb-1">公開分享</div>
        <p className="text-xs text-muted-foreground mb-3">
          {url
            ? "任何人只要有這條連結就能閱讀，不需要登入。"
            : "建立一條任何人都能開啟的連結，不需要登入。"}
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="size-3.5 animate-spin" /> 讀取中…
          </div>
        ) : url ? (
          <>
            <div className="flex gap-1.5 mb-2">
              <input
                readOnly value={url} onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 rounded-md border bg-muted/40 px-2 py-1 text-xs font-mono"
              />
              <Button size="sm" variant="secondary" className="h-7 px-2 shrink-0" onClick={copy}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </Button>
            </div>
            <Button size="sm" variant="ghost" disabled={busy} onClick={revoke}
              className="h-7 text-xs text-destructive hover:text-destructive px-2">
              取消分享
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={busy} onClick={create} className="h-7 text-xs">
            {busy && <Loader2 className="size-3.5 animate-spin" />} 建立公開連結
          </Button>
        )}

        {error && <p className="text-xs text-destructive mt-2">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}
