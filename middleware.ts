import { NextResponse, type NextRequest } from "next/server";

/**
 * Keeps the two origins from overlapping.
 *
 * Shared documents are author-supplied HTML executed verbatim. On the app's own
 * origin their scripts would run with the visitor's session cookie and could
 * call every member-gated API as them — a path prefix is not a security
 * boundary, only an origin is. So /s/* lives on SHARE_HOST and nowhere else,
 * and SHARE_HOST serves nothing but /s/*.
 *
 * SHARE_HOST unset (local dev) disables the split; production sets it in
 * wrangler.jsonc, where it must always be present.
 */
const SHARE_HOST = (process.env.SHARE_HOST ?? "").toLowerCase();

export function middleware(req: NextRequest) {
  if (!SHARE_HOST) return NextResponse.next();

  const host = (req.headers.get("host") ?? "").toLowerCase().split(":")[0];
  const onShareHost = host === SHARE_HOST;
  const isSharePath = req.nextUrl.pathname.startsWith("/s/");

  if (onShareHost !== isSharePath) {
    return new NextResponse("not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
