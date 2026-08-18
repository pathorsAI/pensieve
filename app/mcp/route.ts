import { requireMcpAuth } from "@better-auth/mcp";
import { auth } from "@/lib/auth";
import { callTool, toolDescriptors } from "@/lib/mcp";

// Stateless Streamable HTTP: one JSON-RPC request in, one JSON response out.
// No SSE, no session ids, no MCP SDK — this runs on Workers.
const BASE = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const RESOURCE = `${BASE}/mcp`;
const SERVER_INFO = { name: "pensieve", title: "Pensieve", version: "0.1.0" };
const SUPPORTED_PROTOCOLS = new Set(["2025-06-18", "2025-03-26", "2024-11-05"]);
const DEFAULT_PROTOCOL = "2025-06-18";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "access-control-expose-headers": "WWW-Authenticate, mcp-protocol-version",
  "access-control-max-age": "86400",
};

type Id = string | number | null;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });

const result = (id: Id, value: unknown) => json({ jsonrpc: "2.0", id, result: value });
const failure = (id: Id, code: number, message: string, status = 200) =>
  json({ jsonrpc: "2.0", id, error: { code, message } }, status);

// tools/call, lifted out of the switch: name + argument shape, then dispatch.
async function toolsCall(id: Id, params: Record<string, unknown>, userId: string): Promise<Response> {
  const name = typeof params.name === "string" ? params.name : "";
  if (!name) return failure(id, -32602, "Missing tool name");
  const args = (params.arguments ?? {}) as Record<string, unknown>;
  if (typeof args !== "object" || Array.isArray(args)) return failure(id, -32602, "`arguments` must be an object");
  return result(id, await callTool(name, args, { userId }));
}

// Only the subject matters here; the plugin already verified signature, issuer,
// audience and expiry against the JWKS.
async function handler(req: Request, claims: { sub?: unknown }): Promise<Response> {
  let msg: { jsonrpc?: string; id?: Id; method?: string; params?: Record<string, unknown> };
  try {
    msg = await req.json();
  } catch {
    return failure(null, -32700, "Parse error");
  }
  if (!msg || typeof msg !== "object" || Array.isArray(msg) || typeof msg.method !== "string") {
    return failure(null, -32600, "Invalid Request");
  }

  const id = msg.id ?? null;
  const isNotification = msg.id === undefined;
  const params = msg.params ?? {};
  const userId = typeof claims.sub === "string" ? claims.sub : undefined;
  if (!userId) return failure(id, -32000, "Access token carries no subject");

  switch (msg.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return result(id, {
        protocolVersion: SUPPORTED_PROTOCOLS.has(asked) ? asked : DEFAULT_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions:
          "Pensieve is this team's HTML knowledge base. Search or browse a workspace, read a document by path, " +
          "then follow related_documents to walk the link graph. Every result carries a citable URL.",
      });
    }
    // Notifications get no body at all; anything else here is a client bug we can ignore.
    case "notifications/initialized":
    case "notifications/cancelled":
      return new Response(null, { status: 202, headers: CORS });
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, { tools: toolDescriptors });
    case "tools/call":
      return toolsCall(id, params, userId);
    default:
      if (isNotification) return new Response(null, { status: 202, headers: CORS });
      return failure(id, -32601, `Method not found: ${msg.method}`);
  }
}

const authorized = requireMcpAuth(auth, handler, { resource: RESOURCE });

export async function POST(req: Request) {
  // requireMcpAuth builds its own 401 — reattach CORS so browser clients can
  // read the WWW-Authenticate challenge that starts the OAuth dance.
  const res = await authorized(req);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

// Clients probe GET for an SSE stream; this server has none.
export function GET() {
  return failure(null, -32000, "This MCP endpoint is POST-only (no SSE stream).", 405);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
