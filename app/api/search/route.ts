import { NextResponse } from "next/server";
import { requireMember } from "@/lib/access";
import { isSearchable } from "@/lib/find";
import { searchDocuments } from "@/lib/search";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const slug = u.searchParams.get("org") ?? "";
  const q = (u.searchParams.get("q") ?? "").trim();
  const limit = Number(u.searchParams.get("limit"));
  const access = await requireMember(slug);
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!isSearchable(q)) return NextResponse.json({ hits: [] });

  const hits = await searchDocuments(access.org.id, q, {
    ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
    // searchDocuments runs these through cleanFilters before they touch SQL
    folder: u.searchParams.get("folder"),
    month: u.searchParams.get("month"),
    tag: u.searchParams.get("tag"),
  });
  return NextResponse.json({ hits });
}
