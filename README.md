# Pensieve

**An HTML-first knowledge base with a living graph.**
Sync folders and git repos full of HTML documents into a workspace; Pensieve
extracts the links between them and gives you an Obsidian-style graph to fly
around in — for teams, behind Google sign-in.

Why HTML instead of markdown? Because documents deserve layout. Every page is a
self-contained `.html` file — your styles, your components, no build step. AI
writes it fast, browsers render it perfectly, and a repo of them is still just
files you can grep.

## How it works

- **Workspaces** — sign in with Google, you get a personal workspace. Create
  organizations, invite people; everyone in the org browses the same graph.
- **Documents** — plain `.html` files. `<title>` is the node label; optional
  `<meta name="date">` and `<meta name="tags">` drive sorting and search.
  Root-relative links between documents (`<a href="/meetings/2026-08-18-retro">`)
  become graph edges. Backlinks are injected automatically on every page.
- **Sync** — two ways, per workspace, multiple sources each with its own mount
  prefix:
  1. **CLI**: `PENSIEVE_TOKEN=… node cli/pensieve.mjs push --dir docs`
  2. **GitHub App**: install the app on a repo, add it as a sync source
     (repo / branch / folder / mount); pushes sync automatically via webhook.

## Stack

Next.js (App Router) · [better-auth](https://better-auth.com) (Google +
organizations) · Drizzle + Postgres (Neon) · deployed to Cloudflare Workers via
OpenNext. No queue, no cache layer, no vector DB — documents are rows, the
graph is derived from links at read time.

## Self-hosting

```bash
bun install
cp .dev.vars.example .dev.vars   # fill in DB + Google OAuth
bun run db:push                  # create tables
bun run dev
```

Deploy: `bun run deploy` (wrangler; set the same vars as secrets), or connect
the repo to Cloudflare Workers Builds. Google OAuth redirect URI:
`<base-url>/api/auth/callback/google`.

For GitHub sync, register a GitHub App (permissions: **Contents read-only**;
webhook → `<base-url>/api/github/webhook`, push events), convert its key to
PKCS#8 (`openssl pkcs8 -topk8 -nocrypt -in app.pem`) and set
`GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_WEBHOOK_SECRET`.

## Trust model

Documents are rendered as-is on the workspace origin: workspace members are
trusted authors. Don't sync HTML you wouldn't run in your teammates' browsers.

MIT © Pathors
