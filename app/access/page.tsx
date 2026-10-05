import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { memberWorkspaces, safeNext, workspaceSlugOf } from "@/lib/access";
import { AccessPanel } from "./access-panel";

export const metadata = { title: "Pensieve", robots: { index: false } };

// Landing spot for every member-gated page that turned the caller away. It is
// also the post-login callback, so a sign-in that lands on an account outside
// the workspace shows the switch-account state instead of another dead end.
export default async function Access({ searchParams }: Readonly<{ searchParams: Promise<{ next?: string }> }>) {
  const { next: raw } = await searchParams;
  const next = safeNext(raw);
  const slug = workspaceSlugOf(next);
  const session = await auth.api.getSession({ headers: await headers() });
  const workspaces = session ? await memberWorkspaces(session.user.id) : [];
  if (session && (!slug || workspaces.some((w) => w.slug === slug))) redirect(next);
  return (
    <AccessPanel
      next={next}
      slug={slug}
      email={session?.user.email ?? null}
      workspaces={workspaces.map((w) => ({ slug: w.slug, name: w.name }))}
    />
  );
}
