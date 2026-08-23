import { AcceptClient } from "./accept-client";
export default async function Accept({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <AcceptClient id={id} />;
}
