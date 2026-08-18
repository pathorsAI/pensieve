import { pgTable, text, timestamp, boolean, jsonb, uniqueIndex, index, customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const tsvector = customType<{ data: string }>({ dataType() { return "tsvector"; } });

// ---- better-auth core ----
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("active_organization_id"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  issuer: text("issuer"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ---- better-auth organization plugin ----
export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  metadata: text("metadata"),
});

export const member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  inviterId: text("inviter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});

// ---- pensieve ----
export const document = pgTable("document", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  path: text("path").notNull(),           // "/meetings/2026-08-18-citytowers-retro"
  title: text("title").notNull(),
  date: text("date"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  links: jsonb("links").$type<string[]>().notNull().default([]),
  html: text("html").notNull(),
  text: text("text").notNull().default(""),  // tag-stripped plain text, for search
  source: text("source").notNull().default("cli"), // mount label of whichever sync wrote it
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  tsv: tsvector("tsv").generatedAlwaysAs(
    sql`to_tsvector('english', coalesce(title, '') || ' ' || coalesce(text, ''))`),
}, (t) => [
  uniqueIndex("document_org_path").on(t.organizationId, t.path),
  index("document_tsv_idx").using("gin", t.tsv),
  index("document_text_trgm").using("gin", t.text.op("gin_trgm_ops")),
  index("document_title_trgm").using("gin", t.title.op("gin_trgm_ops")),
]);

export const syncSource = pgTable("sync_source", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("github"),  // github | cli
  repo: text("repo"),                              // "pathorsAI/pathors-docs"
  branch: text("branch").default("main"),
  folder: text("folder").default(""),              // subfolder within repo, "" = root
  mount: text("mount").notNull().default("/"),     // path prefix inside the workspace
  installationId: text("installation_id"),         // GitHub App installation
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const asset = pgTable("asset", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  path: text("path").notNull(),            // "/engineering/assets/docs.css"
  contentType: text("content_type").notNull(),
  data: text("data").notNull(),            // base64 (as GitHub blobs give it)
  source: text("source").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("asset_org_path").on(t.organizationId, t.path)]);
