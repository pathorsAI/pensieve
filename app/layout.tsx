import "./globals.css";
export const metadata = {
  title: "Pensieve",
  description: "A knowledge graph for HTML documents — sync your repos, fly between your notes.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
