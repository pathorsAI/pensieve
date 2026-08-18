import { notFound } from "next/navigation";
import { requireMember } from "@/lib/access";
import { SettingsClient } from "./settings-client";

export default async function Settings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireMember(slug);
  if (!access) notFound();
  return <SettingsClient slug={slug} orgName={access.org.name} />;
}
