import { marked } from "marked";

/** Convert a markdown source file into a self-contained HTML document that the
 *  rest of the pipeline (extractMeta / plainText / graph) treats identically
 *  to a hand-written .html doc. Frontmatter: title / date / tags. */
export function mdToHtml(src: string): string {
  let meta: Record<string, string> = {};
  let body = src;
  const fm = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    body = src.slice(fm[0].length);
    for (const line of fm[1].split("\n")) {
      const m = line.match(/^(\w[\w-]*):\s*(.*)$/);
      if (m) meta[m[1].toLowerCase()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  const title = meta.title ?? body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "untitled";
  const html = marked.parse(body, { async: false }) as string;
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title.replace(/</g, "&lt;")}</title>
${meta.date ? `<meta name="date" content="${meta.date}">` : ""}
${meta.tags ? `<meta name="tags" content="${meta.tags}">` : ""}
<style>
:root{color-scheme:light;--paper:#F7F9FB;--ink:#141A1B;--ink-2:#3D4849;--ink-3:#6B7778;--rule:#D5DCE3;
  --accent:#2456B3;--wash:#E8EFFA;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC","Noto Sans TC",sans-serif;
  --serif:"Iowan Old Style",Palatino,Georgia,"Songti TC",serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--paper:#0F1417;--ink:#E4E8E7;--ink-2:#B2BCBB;
  --ink-3:#7E8A89;--rule:#2A3438;--accent:#7FA8F0;--wash:#16233A}}
*{margin:0;padding:0;box-sizing:border-box;scrollbar-width:thin;scrollbar-color:var(--rule) transparent}
*::-webkit-scrollbar{width:8px;height:8px}*::-webkit-scrollbar-track{background:transparent}*::-webkit-scrollbar-thumb{background:var(--rule);border-radius:8px}
html,body{background:var(--paper);color:var(--ink)}
body{font-family:var(--sans);line-height:1.7;font-size:16px;-webkit-font-smoothing:antialiased}
.wrap{max-width:820px;margin:0 auto;padding:56px 24px 96px}
h1,h2,h3{font-family:var(--serif);line-height:1.25;margin:1.6em 0 .5em;font-weight:600}
h1{font-size:32px;margin-top:0}h2{font-size:23px;border-bottom:1px solid var(--rule);padding-bottom:6px}h3{font-size:18px}
p,ul,ol{margin:.7em 0;color:var(--ink-2)}li{margin:.3em 0 .3em 1.4em}
strong{color:var(--ink)}a{color:var(--accent)}
blockquote{border-left:3px solid var(--accent);background:var(--wash);padding:10px 16px;margin:1em 0;color:var(--ink-2)}
code{font-family:var(--mono);font-size:.88em;background:var(--wash);padding:.15em .4em;border-radius:3px}
pre{background:var(--wash);padding:14px 16px;border-radius:6px;overflow-x:auto;margin:1em 0}
pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%;margin:1em 0;font-size:14.5px;display:block;overflow-x:auto}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--rule);vertical-align:top}
th{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)}
hr{border:0;border-top:1px solid var(--rule);margin:2em 0}
</style>
</head>
<body>
<div class="wrap">
${html}
</div>
</body>
</html>`;
}
