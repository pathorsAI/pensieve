/** Pull graph metadata out of a document's HTML. Same conventions as the CLI. */
export function extractMeta(html: string) {
  const pick = (re: RegExp) => html.match(re)?.[1]?.trim() ?? null;
  const title = pick(/<title>([^<]+)<\/title>/i) ?? pick(/<h1[^>]*>([^<]+)</i) ?? "untitled";
  const date = pick(/<meta\s+name="date"\s+content="([^"]+)"/i);
  const tags = (pick(/<meta\s+name="tags"\s+content="([^"]+)"/i) ?? "")
    .split(",").map((t) => t.trim()).filter(Boolean);
  const links = [...new Set(
    [...html.matchAll(/href="(\/[^"#?]+?)(?:\.html)?"/g)].map((m) => m[1].replace(/\/$/, ""))
  )];
  return { title, date, tags, links };
}
