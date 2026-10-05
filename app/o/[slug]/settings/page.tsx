import { redirect } from "next/navigation";
import { accessUrl, requireMember } from "@/lib/access";
import { SettingsClient } from "./settings-client";

export default async function Settings({ params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  const access = await requireMember(slug);
  if (!access) redirect(accessUrl(`/o/${slug}/settings`));
  return <SettingsClient slug={slug} orgName={access.org.name} />;
}
