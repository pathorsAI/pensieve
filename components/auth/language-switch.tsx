"use client";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n-dict";

// Language names stay in their own language whatever the current locale is.
const OPTIONS: { locale: Locale; label: string; lang: string }[] = [
  { locale: "zh-TW", label: "中文", lang: "zh-Hant" },
  { locale: "en", label: "English", lang: "en" },
];

export function LanguageSwitch({ locale }: Readonly<{ locale: Locale }>) {
  function choose(next: Locale) {
    if (next === locale) return;
    // The server picks the locale per request, so a cookie + reload is the whole switch.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    globalThis.location.reload();
  }
  return (
    <span>
      {OPTIONS.map((o, i) => (
        <span key={o.locale}>
          {i > 0 && " · "}
          <button type="button" lang={o.lang} aria-current={o.locale === locale} onClick={() => choose(o.locale)}>
            {o.label}
          </button>
        </span>
      ))}
    </span>
  );
}
