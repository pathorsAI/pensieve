import "./globals.css";
import { getLocale, htmlLang } from "@/lib/i18n";

export const metadata = {
  title: "Pensieve",
  description: "A knowledge graph for HTML documents — sync your repos, fly between your notes.",
};
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={htmlLang(locale)}>
      <body>{children}</body>
    </html>
  );
}
