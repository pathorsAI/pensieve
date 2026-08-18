# Pensieve

**A document centre your team keeps in git, and your AI plugs straight into.**
Push HTML documents to a repo; Pensieve serves them as a browsable workspace
with full-text search and a link graph, and exposes that same workspace over
MCP so Claude Code, Claude.ai, ChatGPT and anything else that speaks MCP can
read it directly.

Git stays the source of truth, and sync is one-way — Pensieve never writes back.
Documents change through the same pull requests as your code, and history is
`git log`. Nothing lands in a proprietary store: if Pensieve went away tomorrow
you would still have every document as a file you can grep.

Why HTML rather than markdown? Because documents deserve layout. Each page is a
self-contained `.html` file — your styles, your components, no build step. AI
writes it fast and browsers render it exactly. (`.md` is accepted too, and
rendered on sync.)

## How it works

- **Workspaces** — sign in with Google and you get a personal workspace. Create
  an organization, invite people, and everyone in it browses the same documents.
- **Documents** — plain `.html` files. `<title>` is the node label; optional
  `<meta name="date">` and `<meta name="tags">` drive sorting and search. CSS,
  JS and images sync alongside the documents, so relative references just work.
- **Sync** — install the Pensieve GitHub App on a repo and add sync sources
  (repo / branch / folder, each with its own mount prefix, several per
  workspace). Pushes sync via webhook; anything deleted upstream is pruned.
- **Graph** — links between documents become edges — root-relative and relative
  hrefs both resolve — and every rendered page gets its backlinks injected at the
  bottom. Nothing is stored: the graph is derived from links at read time.
- **Search** — ⌘K anywhere in the app. Full text over title, body and tags,
  Postgres-native: a weighted `tsvector` ranked with `ts_rank_cd`, plus
  `pg_trgm` for substrings and Chinese.

## Connect your AI

Pensieve is a remote MCP server at `/mcp`.

```bash
claude mcp add --transport http pensieve https://pensieve.pathors.com/mcp
```

In Claude.ai, add the same URL as a custom connector. Either way you sign in with
Google and approve a consent screen — OAuth 2.1, so the model sees exactly the
workspaces you are a member of and nothing else.

Five tools: `list_workspaces`, `search_documents`, `read_document`,
`list_documents`, `related_documents`. The last returns outgoing links and
backlinks, so a model can walk the graph instead of only grepping it. Every
result carries the document's canonical URL, so the answer cites a link a human
can open.

## Stack

Next.js (App Router) · [better-auth](https://better-auth.com) (Google,
organizations, MCP) · Drizzle + Postgres (Neon) · deployed to Cloudflare Workers
via OpenNext. No queue, no cache layer, no vector DB — documents are rows.

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
The MCP server is bound to the same membership — a connected model reads what
the user who connected it can read, and nothing is writable through it.

MIT © Pathors
