import { notFound } from "next/navigation";
import { requireMember } from "@/lib/access";
import { GraphView } from "./graph-view";

export default async function Workspace({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireMember(slug);
  if (!access) notFound();
  return <GraphView slug={slug} orgName={access.org.name} role={access.role} />;
}
