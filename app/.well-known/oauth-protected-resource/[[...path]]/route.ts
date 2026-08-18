import { auth } from "@/lib/auth";

// RFC 9728. better-auth is mounted at /api/auth, but MCP clients only look for
// this document at the site root (with and without the resource's path suffix),
// so the request is handed to the auth handler unchanged — the mcp plugin's
// onRequest hook matches on the full pathname and answers it.
export const GET = (req: Request) => auth.handler(req);
