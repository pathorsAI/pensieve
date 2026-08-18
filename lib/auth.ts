import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { db } from "./db";
import * as schema from "./schema";

// Origin only — better-auth appends the /api/auth basePath itself, but the MCP
// resource identifier lives at the app root (/mcp), so it is built from this.
const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

// Every new user gets a personal workspace on signup.
export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  plugins: [
    organization(),
    // MCP access tokens are JWTs verified against /api/auth/jwks.
    jwt(),
    mcp({
      loginPage: "/login",
      consentPage: "/consent",
      resource: `${baseURL}/mcp`,
      // MCP clients (Claude Code, claude.ai, ChatGPT) have no pre-registered
      // client_id — they discover the AS and register themselves, unauthenticated,
      // before the user ever reaches the login page.
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }),
  ],
  onAPIError: {
    onError(e) { console.error("[auth]", e instanceof Error ? e.stack ?? e.message : JSON.stringify(e)); },
  },
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
