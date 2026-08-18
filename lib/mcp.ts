import { and, eq, inArray, like, sql } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./schema";
import { searchDocuments } from "./search";
import { memberWorkspaces, requireMemberOf, type Workspace } from "./access";

const BASE = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const BODY_CAP = 40_000;

/** Expected, user-facing failures. Anything else is a bug and gets a generic message. */
export class ToolError extends Error {}

export type ToolContext = { userId: string };

export type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
};

const docUrl = (slug: string, path: string) => `${BASE}/o/${slug}/d${path}`;

/** Documents are keyed by extension-less absolute paths; accept the sloppy forms too. */
function normalizePath(raw: string): string {
  // Runs of slashes are already collapsed, so the trailing check needs no quantifier to backtrack over.
  const s = ("/" + String(raw).trim()).replace(/\/+/g, "/").replace(/\.(html|md)$/i, "").replace(/\/$/, "");
  return s || "/";
}

const likeEscape = (s: string) => s.replace(/[%_\\]/g, (m) => "\\" + m);

function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new ToolError(`\`${key}\` must be a string`);
  return v;
}

function int(args: Record<string, unknown>, key: string, fallback: number, max: number): number {
  const v = args[key];
  if (v === undefined || v === null) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new ToolError(`\`${key}\` must be a number`);
  return Math.min(max, Math.max(1, Math.trunc(n)));
}

/**
 * Never trust a slug off the wire: an explicit workspace is checked against the
 * member table, an omitted one only resolves when there is exactly one choice.
 */
async function resolveWorkspace(ctx: ToolContext, slug?: string): Promise<Workspace> {
  if (slug) {
    const ws = await requireMemberOf(ctx.userId, slug);
    if (!ws) throw new ToolError(`No workspace \`${slug}\` you are a member of.`);
    return ws;
  }
  const all = await memberWorkspaces(ctx.userId);
  if (!all.length) throw new ToolError("You are not a member of any workspace yet.");
  if (all.length > 1) {
    throw new ToolError(
      `Several workspaces available — pass \`workspace\` with one of: ${all.map((w) => w.slug).join(", ")}`,
    );
  }
  return all[0];
}

const fmtMeta = (d: { date: string | null; tags: string[] }) =>
  [d.date, d.tags.length ? d.tags.map((t) => `#${t}`).join(" ") : null].filter(Boolean).join("  ");

type DocRow = { path: string; title: string; date: string | null; tags: string[] };

/** One document as a listing entry: heading, optional meta, optional snippet, canonical URL. */
function fmtEntry(slug: string, d: DocRow, snippet?: string): string {
  const meta = fmtMeta(d);
  return [
    `${d.title}  [${d.path}]`,
    meta ? `  ${meta}` : null,
    snippet === undefined ? null : `  ${snippet}`,
    `  ${docUrl(slug, d.path)}`,
  ].filter(Boolean).join("\n");
}

const workspaceArg = {
  type: "string",
  description: "Workspace slug. Optional when the user has exactly one workspace.",
};

/** The two path-addressed tools take the same arguments and differ only in how they describe `path`. */
const pathInputSchema = (pathDescription: string) => ({
  type: "object",
  properties: { workspace: workspaceArg, path: { type: "string", description: pathDescription } },
  required: ["path"],
  additionalProperties: false,
});

/** Order matters: `path` is checked before the workspace, so a missing path outranks an ambiguous workspace. */
async function resolveDocArgs(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ ws: Workspace; path: string }> {
  const raw = str(args, "path");
  if (!raw) throw new ToolError("`path` is required");
  const path = normalizePath(raw);
  const ws = await resolveWorkspace(ctx, str(args, "workspace"));
  return { ws, path };
}

export const tools: Tool[] = [
  {
    name: "list_workspaces",
    title: "List workspaces",
    description:
      "List every Pensieve workspace the signed-in user belongs to, with its slug, display name and document count. " +
      "Call this first when you do not know which workspace to search, or when another tool reports an ambiguous workspace.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async run(_args, ctx) {
      const all = await memberWorkspaces(ctx.userId);
      if (!all.length) return "You are not a member of any workspace yet.";
      const counts = await db
        .select({ orgId: schema.document.organizationId, n: sql<number>`count(*)::int` })
        .from(schema.document)
        .where(inArray(schema.document.organizationId, all.map((w) => w.id)))
        .groupBy(schema.document.organizationId);
      const byOrg = new Map<string, number>(counts.map((c) => [c.orgId, c.n]));
      return all
        .map((w) => {
          const n = byOrg.get(w.id) ?? 0;
          return `${w.slug} — ${w.name} (${n} documents)\n  ${BASE}/o/${w.slug}`;
        })
        .join("\n");
    },
  },
  {
    name: "search_documents",
    title: "Search documents",
    description:
      "Full-text + fuzzy search across a workspace's documents, ranked by relevance (titles outrank passing mentions). " +
      "Returns a snippet per hit plus the document path to feed into read_document. Works for English and Chinese queries. " +
      "Use this to find material; use read_document to actually read it.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: workspaceArg,
        query: { type: "string", description: "Search terms. Plain words, not a boolean expression." },
        limit: { type: "integer", description: "Maximum hits to return (default 10, max 50)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const query = str(args, "query");
      if (!query) throw new ToolError("`query` is required");
      const ws = await resolveWorkspace(ctx, str(args, "workspace"));
      const hits = await searchDocuments(ws.id, query, { limit: int(args, "limit", 10, 50) });
      if (!hits.length) return `No documents in ${ws.slug} match "${query}".`;
      return hits.map((h) => fmtEntry(ws.slug, h, h.snippet)).join("\n\n");
    },
  },
  {
    name: "read_document",
    title: "Read a document",
    description:
      "Return the full plain text of one document, addressed by the path that search_documents / list_documents report. " +
      "A leading slash and an .html/.md suffix are both optional. Long documents are truncated and say so.",
    inputSchema: pathInputSchema('Document path, e.g. "/meetings/2026-08-18-retro".'),
    async run(args, ctx) {
      const { ws, path } = await resolveDocArgs(args, ctx);
      const rows = await db
        .select()
        .from(schema.document)
        .where(and(eq(schema.document.organizationId, ws.id), eq(schema.document.path, path)))
        .limit(1);
      if (!rows.length) throw new ToolError(`No document at \`${path}\` in ${ws.slug}. Try search_documents or list_documents.`);
      const d = rows[0];
      const body = d.text.length > BODY_CAP ? d.text.slice(0, BODY_CAP) : d.text;
      const truncated = d.text.length > BODY_CAP
        ? `\n\n[truncated: showing the first ${BODY_CAP} of ${d.text.length} characters]`
        : "";
      const head = [d.title, fmtMeta(d), docUrl(ws.slug, d.path)].filter(Boolean).join("\n");
      return `${head}\n\n${body}${truncated}`;
    },
  },
  {
    name: "list_documents",
    title: "Browse documents",
    description:
      "Browse a workspace's document tree, newest first. Filter by path prefix (a folder) and/or by tag. " +
      "Use this to see what exists before searching, or to enumerate a folder such as /meetings.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: workspaceArg,
        prefix: { type: "string", description: 'Path prefix to restrict to, e.g. "/meetings".' },
        tag: { type: "string", description: "Only documents carrying this tag." },
        limit: { type: "integer", description: "Maximum documents to return (default 50, max 200)." },
      },
      additionalProperties: false,
    },
    async run(args, ctx) {
      const ws = await resolveWorkspace(ctx, str(args, "workspace"));
      const prefix = str(args, "prefix");
      const tag = str(args, "tag");
      const where = [eq(schema.document.organizationId, ws.id)];
      if (prefix) where.push(like(schema.document.path, `${likeEscape(normalizePath(prefix))}%`));
      if (tag) where.push(sql`${schema.document.tags} @> ${JSON.stringify([tag])}::jsonb`);
      const rows = await db
        .select({ path: schema.document.path, title: schema.document.title, date: schema.document.date, tags: schema.document.tags })
        .from(schema.document)
        .where(and(...where))
        .orderBy(sql`${schema.document.date} desc nulls last`, schema.document.path)
        .limit(int(args, "limit", 50, 200));
      const underPrefix = prefix ? ` under ${prefix}` : "";
      const taggedWith = tag ? ` tagged #${tag}` : "";
      if (!rows.length) return `No documents in ${ws.slug}${underPrefix}${taggedWith}.`;
      return rows.map((r) => fmtEntry(ws.slug, r)).join("\n\n");
    },
  },
  {
    name: "related_documents",
    title: "Neighbours in the link graph",
    description:
      "Walk Pensieve's link graph one hop from a document: the documents it links to, and the documents that link back to it. " +
      "Use it after read_document to pick up the surrounding context a search query would have missed.",
    inputSchema: pathInputSchema("Document path to walk from."),
    async run(args, ctx) {
      const { ws, path } = await resolveDocArgs(args, ctx);
      const self = await db
        .select({ links: schema.document.links, title: schema.document.title })
        .from(schema.document)
        .where(and(eq(schema.document.organizationId, ws.id), eq(schema.document.path, path)))
        .limit(1);
      if (!self.length) throw new ToolError(`No document at \`${path}\` in ${ws.slug}.`);

      const outPaths = [...new Set(self[0].links.map(normalizePath))].filter((p) => p !== path);
      const out = outPaths.length
        ? await db
            .select({ path: schema.document.path, title: schema.document.title })
            .from(schema.document)
            .where(and(eq(schema.document.organizationId, ws.id), inArray(schema.document.path, outPaths)))
        : [];
      const back = await db
        .select({ path: schema.document.path, title: schema.document.title })
        .from(schema.document)
        .where(and(
          eq(schema.document.organizationId, ws.id),
          sql`${schema.document.links} @> ${JSON.stringify([path])}::jsonb`,
        ));

      const known = new Set(out.map((o) => o.path));
      const dangling = outPaths.filter((p) => !known.has(p));
      const block = (label: string, rows: { path: string; title: string }[]) =>
        rows.length ? `${label}:\n` + rows.map((r) => `  ${r.title}  [${r.path}]\n    ${docUrl(ws.slug, r.path)}`).join("\n") : null;

      const parts = [
        `${self[0].title}  [${path}]`,
        block("links to", out),
        block("linked from", back.filter((b) => b.path !== path)),
        dangling.length ? `unresolved links: ${dangling.join(", ")}` : null,
      ].filter(Boolean);
      return parts.length > 1 ? parts.join("\n\n") : `${self[0].title} [${path}] has no neighbours in the link graph.`;
    },
  },
];

const byName = new Map(tools.map((t) => [t.name, t]));

/** MCP `tools/list` payload. */
export const toolDescriptors = tools.map((t) => ({
  name: t.name,
  title: t.title,
  description: t.description,
  inputSchema: t.inputSchema,
}));

/** Runs a tool, mapping failures to an MCP tool result rather than a transport error. */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ content: { type: "text"; text: string }[]; isError?: true }> {
  const tool = byName.get(name);
  if (!tool) return { content: [{ type: "text", text: `Unknown tool \`${name}\`.` }], isError: true };
  try {
    return { content: [{ type: "text", text: await tool.run(args, ctx) }] };
  } catch (e) {
    if (e instanceof ToolError) return { content: [{ type: "text", text: e.message }], isError: true };
    console.error("[mcp]", name, e);
    return { content: [{ type: "text", text: `Tool \`${name}\` failed.` }], isError: true };
  }
}
