#!/usr/bin/env node
// pensieve push — sync a folder of HTML documents into a workspace.
//   pensieve push --dir docs [--mount /] [--url https://pensieve.pathors.com] [--no-prune]
// Auth: PENSIEVE_TOKEN env var (create one in workspace settings).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const args = process.argv.slice(2);
if (args[0] !== "push") { console.error("usage: pensieve push --dir <folder> [--mount /prefix] [--url <base>] [--no-prune]"); process.exit(1); }
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const dir = opt("--dir", "docs");
const mount = opt("--mount", "/");
const base = opt("--url", process.env.PENSIEVE_URL ?? "https://pensieve.pathors.com");
const prune = !args.includes("--no-prune");
const token = process.env.PENSIEVE_TOKEN;
if (!token) { console.error("PENSIEVE_TOKEN not set"); process.exit(1); }

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = join(d, e.name);
  return e.isDirectory() ? walk(p) : e.name.endsWith(".html") ? [p] : [];
});

const files = walk(dir);
const docs = files.map((f) => ({ path: "/" + relative(dir, f).replace(/\\/g, "/"), html: readFileSync(f, "utf8") }));
console.log(`pushing ${docs.length} docs from ${dir} → ${base} (mount ${mount}${prune ? ", prune" : ""})`);

const res = await fetch(`${base}/api/sync`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({ mount, prune, docs }),
});
const out = await res.json().catch(() => ({}));
if (!res.ok) { console.error("failed:", res.status, out); process.exit(1); }
console.log(`done: upserted ${out.upserted}, pruned ${out.pruned}`);
