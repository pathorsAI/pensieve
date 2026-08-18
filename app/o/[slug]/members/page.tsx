import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireMember } from "@/lib/access";
import { db } from "@/lib/db";
import * as schema from "@/lib/schema";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InviteForm } from "./invite-form";

export default async function Members({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireMember(slug);
  if (!access) notFound();
  const members = await db.select({ name: schema.user.name, email: schema.user.email, role: schema.member.role })
    .from(schema.member).innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(eq(schema.member.organizationId, access.org.id));
  const invites = (await db.select().from(schema.invitation)
    .where(eq(schema.invitation.organizationId, access.org.id))).filter((i) => i.status === "pending");
  return (
    <main className="page">
      <div className="sub"><a href={`/o/${slug}`} className="no-underline">← {access.org.name}</a></div>
      <h1>Members</h1>
      <Table>
        <TableHeader><TableRow><TableHead>name</TableHead><TableHead>email</TableHead><TableHead>role</TableHead></TableRow></TableHeader>
        <TableBody>
          {members.map((m, i) => (
            <TableRow key={i}><TableCell>{m.name}</TableCell><TableCell>{m.email}</TableCell>
              <TableCell><Badge variant={m.role === "owner" ? "default" : "secondary"}>{m.role}</Badge></TableCell></TableRow>
          ))}
        </TableBody>
      </Table>
      <h2>Invite</h2>
      <InviteForm orgId={access.org.id} />
      {invites.length > 0 && (
        <>
          <h2>Pending invitations</h2>
          <Table>
            <TableHeader><TableRow><TableHead>email</TableHead><TableHead>role</TableHead><TableHead>accept link</TableHead></TableRow></TableHeader>
            <TableBody>
              {invites.map((i) => (
                <TableRow key={i.id}><TableCell>{i.email}</TableCell><TableCell>{i.role}</TableCell>
                  <TableCell className="mono text-xs">/accept/{i.id}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-sm mt-2" style={{ color: "var(--ink-3)" }}>把 accept link（完整網址）貼給對方，登入後開啟即可加入。</p>
        </>
      )}
    </main>
  );
}
