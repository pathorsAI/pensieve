import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireMember } from "@/lib/access";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";
import { InviteForm } from "./invite-form";

export default async function Members({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireMember(slug);
  if (!access) notFound();
  const members = await db.select({ name: schema.user.name, email: schema.user.email, role: schema.member.role })
    .from(schema.member).innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(eq(schema.member.organizationId, access.org.id));
  const invites = await db.select().from(schema.invitation)
    .where(eq(schema.invitation.organizationId, access.org.id));
  return (
    <main className="page">
      <div className="sub"><a href={`/o/${slug}`} style={{ textDecoration: "none" }}>← {access.org.name}</a></div>
      <h1>Members</h1>
      <table className="t"><thead><tr><th>name</th><th>email</th><th>role</th></tr></thead>
        <tbody>{members.map((m, i) => <tr key={i}><td>{m.name}</td><td>{m.email}</td><td>{m.role}</td></tr>)}</tbody>
      </table>
      <h2>Invite</h2>
      <InviteForm orgId={access.org.id} />
      {invites.filter((i) => i.status === "pending").length > 0 && (
        <>
          <h2>Pending invitations</h2>
          <table className="t"><thead><tr><th>email</th><th>role</th><th>accept link</th></tr></thead>
            <tbody>{invites.filter((i) => i.status === "pending").map((i) => (
              <tr key={i.id}><td>{i.email}</td><td>{i.role}</td>
                <td className="mono" style={{ fontSize: 11 }}>/accept/{i.id}</td></tr>))}</tbody>
          </table>
          <p style={{ color: "var(--ink-3)", fontSize: 13, marginTop: 8 }}>
            把 accept link（完整網址）貼給對方，登入後開啟即可加入。
          </p>
        </>
      )}
    </main>
  );
}
