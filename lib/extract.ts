const DOC_EXT = /\.(html|md)$/;
const ASSET_EXT = /\.(css|js|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|pdf|mp[34])$/i;

/** Resolve an href (absolute or relative) against the doc's own workspace path. */
function resolveHref(href: string, docPath: string): string | null {
  if (/^(https?:|mailto:|data:|#|\/\/)/i.test(href)) return null;
  let p: string;
  if (href.startsWith("/")) p = href;
  else {
    const dir = docPath.split("/").slice(0, -1).join("/");
    const parts = (dir + "/" + href).split("/");
    const out: string[] = [];
    for (const seg of parts) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") out.pop(); else out.push(seg);
    }
    p = "/" + out.join("/");
  }
  p = p.replace(/\/$/, "").split("#")[0].split("?")[0];
  if (ASSET_EXT.test(p)) return null;
  return p.replace(DOC_EXT, "");
}

/** Pull graph metadata out of a document's HTML. docPath enables relative-link resolution. */
export function extractMeta(html: string, docPath = "/") {
  const pick = (re: RegExp) => re.exec(html)?.[1]?.trim() ?? null;
  const title = pick(/<title>([^<]+)<\/title>/i) ?? pick(/<h1[^>]*>([^<]+)</i) ?? "untitled";
  const date = pick(/<meta\s+name="date"\s+content="([^"]+)"/i);
  const tags = (pick(/<meta\s+name="tags"\s+content="([^"]+)"/i) ?? "")
    .split(",").map((t) => t.trim()).filter(Boolean);
  const links = [...new Set(
    [...html.matchAll(/href="([^"]+)"/g)]
      .map((m) => resolveHref(m[1], docPath))
      .filter((p): p is string => !!p && p !== docPath)
  )];
  return { title, date, tags, links };
}

/** `<meta name="description">` in either attribute order; null when missing or empty. */
export function metaDescription(html: string): string | null {
  const tag = /<meta\b[^>]*\bname=["']description["'][^>]*>/i.exec(html)?.[0];
  const v = tag && /\bcontent=["']([^"']*)["']/i.exec(tag)?.[1]
    ?.replaceAll(/&[a-z#0-9]+;/gi, " ").replaceAll(/\s+/g, " ").trim();
  return v || null;
}

/**
 * Tag-stripped text for full-text search. The meta description leads it: it is the
 * author's own one-line summary, and stripping tags would otherwise throw it away.
 */
export function plainText(html: string): string {
  const desc = metaDescription(html);
  const body = html
    .replaceAll(/<style[\s\S]*?<\/style>/gi, " ")
    .replaceAll(/<script[\s\S]*?<\/script>/gi, " ")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/&[a-z#0-9]+;/gi, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  return (desc ? desc + " · " + body : body).slice(0, 50000);
}
