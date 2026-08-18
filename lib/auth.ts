import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db } from "./db";
import * as schema from "./schema";

// Every new user gets a personal workspace on signup.
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  plugins: [organization()],
  databaseHooks: {
    user: {
      create: {
        after: async (u) => {
          const base = u.email.split("@")[0].toLowerCase().replace(/[^a-z0-9-]/g, "-");
          const slug = `${base}-${crypto.randomUUID().slice(0, 4)}`;
          const orgId = crypto.randomUUID();
          await db.insert(schema.organization).values({
            id: orgId, name: `${u.name || base}'s space`, slug,
          });
          await db.insert(schema.member).values({
            id: crypto.randomUUID(), organizationId: orgId, userId: u.id, role: "owner",
          });
        },
      },
    },
  },
});
