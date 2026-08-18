"use client";
import { useEffect, useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type PaletteHit = { path: string; title: string; date: string | null; marked: string };
export type PaletteDoc = { path: string; title: string; date?: string | null };

/** Renders the \x02…\x03 markers searchDocuments returns, without trusting them as markup. */
function Marked({ text }: { text: string }) {
  return (
    <>
      {text.split(/[\u0002\u0003]/).map((s, i) =>
        i % 2 ? (
          <span key={i} style={{ color: "var(--accent-2)", background: "var(--accent-wash)", borderRadius: 2 }}>{s}</span>
        ) : (
          <span key={i}>{s}</span>
        ))}
    </>
  );
}

export function SearchPalette({ slug, open, onOpenChange, recent, onOpen }: {
  slug: string; open: boolean; onOpenChange: (v: boolean) => void;
  recent: PaletteDoc[]; onOpen: (path: string, title: string) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PaletteHit[] | null>(null);

  useEffect(() => { if (!open) { setQ(""); setHits(null); } }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      fetch(`/api/search?org=${slug}&q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json()).then((d) => { if (alive) setHits(d.hits ?? []); });
    }, 180);
    return () => { alive = false; clearTimeout(t); };
  }, [q, slug]);

  const pick = (path: string, title: string) => { onOpenChange(false); onOpen(path, title); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">搜尋文件</DialogTitle>
        <DialogDescription className="sr-only">輸入關鍵字搜尋整個工作區的文件</DialogDescription>
        <Command shouldFilter={false} className="bg-transparent">
          <CommandInput placeholder="搜尋文件…" value={q} onValueChange={setQ} />
          <CommandList className="max-h-[min(60vh,420px)]">
            <CommandEmpty style={{ color: "var(--ink-3)", fontSize: 13 }}>
              {q.trim().length < 2 ? "還沒有文件" : "找不到符合的文件"}
            </CommandEmpty>
            {hits === null ? (
              <CommandGroup heading="最近文件">
                {recent.map((d) => (
                  <CommandItem key={d.path} value={d.path} onSelect={() => pick(d.path, d.title)}
                    className="flex-col items-start gap-0.5">
                    <span style={{ color: "var(--ink)", fontSize: 13.5 }}>{d.title}</span>
                    <span className="mono" style={{ color: "var(--ink-3)", fontSize: 10.5 }}>
                      {d.date ? `${d.date} · ` : ""}{d.path}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              <CommandGroup heading={`搜尋結果 · ${hits.length}`}>
                {hits.map((h) => (
                  <CommandItem key={h.path} value={h.path} onSelect={() => pick(h.path, h.title)}
                    className="flex-col items-start gap-0.5">
                    <span style={{ color: "var(--ink)", fontSize: 13.5 }}>{h.title}</span>
                    <span style={{ color: "var(--ink-2)", fontSize: 11.5, lineHeight: 1.45 }}>
                      <Marked text={h.marked} />
                    </span>
                    <span className="mono" style={{ color: "var(--ink-3)", fontSize: 10.5 }}>
                      {h.date ? `${h.date} · ` : ""}{h.path}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
