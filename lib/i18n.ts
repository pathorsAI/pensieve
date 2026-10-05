import { cookies, headers } from "next/headers";
import { dictFor, LOCALE_COOKIE, type Dict, type Locale } from "./i18n-dict";

export { dictFor, htmlLang, LOCALE_COOKIE, LOCALES, type Dict, type Locale } from "./i18n-dict";

/**
 * The reader's language for the auth screens. An explicit choice from the
 * footer switcher (cookie) wins; otherwise the browser's most-preferred
 * language decides, and anything that is not English gets Chinese — the
 * product's default audience.
 */
export async function getLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (chosen === "zh-TW" || chosen === "en") return chosen;
  const top = preferredLanguage((await headers()).get("accept-language"));
  return top.startsWith("en") ? "en" : "zh-TW";
}

export async function getDict(): Promise<{ locale: Locale; t: Dict }> {
  const locale = await getLocale();
  return { locale, t: dictFor(locale) };
}

/** Highest-q tag of an Accept-Language header, lower-cased ("" if none). */
function preferredLanguage(header: string | null): string {
  let best = "";
  let bestQ = -1;
  for (const part of (header ?? "").split(",")) {
    const [tag, ...params] = part.trim().split(";");
    if (!tag) continue;
    const qParam = params.find((p) => p.trim().startsWith("q="));
    const q = qParam ? Number(qParam.trim().slice(2)) : 1;
    // Strictly greater keeps the earlier tag on ties, as the header order intends.
    if (Number.isFinite(q) && q > bestQ) {
      best = tag.toLowerCase();
      bestQ = q;
    }
  }
  return best;
}
