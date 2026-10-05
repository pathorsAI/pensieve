import { redirect } from "next/navigation";
import { accessUrl, requireMember } from "@/lib/access";
import { GraphView } from "./graph-view";

export default async function Workspace({ params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  const access = await requireMember(slug);
  if (!access) redirect(accessUrl(`/o/${slug}`));
  return <GraphView slug={slug} orgName={access.org.name} role={access.role} />;
}
