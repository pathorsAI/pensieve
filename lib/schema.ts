import { pgTable, text, timestamp, boolean, integer, jsonb, uniqueIndex, index, customType } from "drizzle-orm/pg-core";
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
  // Title weighted A (raw + stemmed, so acronyms and names still match exactly),
  // body weighted B — ts_rank_cd then floats a title hit above a passing mention.
  // NOTE: drizzle-kit push does not diff generated-column expressions — editing this
  // silently no-ops against an existing DB. Apply it by hand (PG17+):
  //   alter table document alter column tsv set expression as (<the expression below>);
  tsv: tsvector("tsv").generatedAlwaysAs(sql`
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(text, '')), 'B')`),
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

// ---- better-auth mcp / oauth provider ----
// Transcribed from @better-auth/oauth-provider 1.7.0's declared models (pg
// mapping: string[] -> text[].array(), json -> jsonb, date -> timestamp).
// Nullability mirrors each field's `required` flag in the plugin source.
export const oauthClient = pgTable("oauth_client", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret"),
  clientDiscoveryId: text("client_discovery_id"),
  disabled: boolean("disabled").default(false),
  skipConsent: boolean("skip_consent"),
  enableEndSession: boolean("enable_end_session"),
  subjectType: text("subject_type"),
  scopes: text("scopes").array(),
  clientCredentialsScopes: text("client_credentials_scopes").array().default([]),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
  name: text("name"),
  uri: text("uri"),
  icon: text("icon"),
  contacts: text("contacts").array(),
  tos: text("tos"),
  policy: text("policy"),
  softwareId: text("software_id"),
  softwareVersion: text("software_version"),
  softwareStatement: text("software_statement"),
  redirectUris: text("redirect_uris").array().notNull(),
  postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
  backchannelLogoutUri: text("backchannel_logout_uri"),
  backchannelLogoutSessionRequired: boolean("backchannel_logout_session_required"),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
  applicationType: text("application_type"),
  jwks: text("jwks"),
  jwksUri: text("jwks_uri"),
  grantTypes: text("grant_types").array(),
  responseTypes: text("response_types").array(),
  requirePKCE: boolean("require_pkce"),
  dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
  referenceId: text("reference_id"),
  metadata: jsonb("metadata"),
}, (t) => [index("oauth_client_user_id_idx").on(t.userId)]);

// A protected resource the AS issues audience-bound access tokens for.
// The /mcp resource row is seeded by the plugin at boot.
export const oauthResource = pgTable("oauth_resource", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl"),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: text("allowed_scopes").array(),
  customClaims: jsonb("custom_claims"),
  dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required").default(false),
  disabled: boolean("disabled").default(false),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
  policyVersion: integer("policy_version").default(1),
  metadata: jsonb("metadata"),
});

// Join table — which clients may request which resources (RFC 8707 §3).
export const oauthClientResource = pgTable("oauth_client_resource", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  resourceId: text("resource_id").notNull().references(() => oauthResource.identifier, { onDelete: "cascade" }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at"),
}, (t) => [
  index("oauth_client_resource_client_id_idx").on(t.clientId),
  index("oauth_client_resource_resource_id_idx").on(t.resourceId),
  uniqueIndex("oauth_client_resource_pair").on(t.clientId, t.resourceId),
]);

export const oauthRefreshToken = pgTable("oauth_refresh_token", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  clientId: text("client_id").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  authorizationCodeId: text("authorization_code_id"),
  resources: text("resources").array(),
  requestedUserInfoClaims: text("requested_user_info_claims").array(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at"),
  revoked: timestamp("revoked"),
  rotatedAt: timestamp("rotated_at"),
  rotationReplayResponse: text("rotation_replay_response"),
  rotationReplayExpiresAt: timestamp("rotation_replay_expires_at"),
  authTime: timestamp("auth_time"),
  confirmation: jsonb("confirmation"),
  scopes: text("scopes").array().notNull(),
}, (t) => [
  index("oauth_refresh_token_client_id_idx").on(t.clientId),
  index("oauth_refresh_token_session_id_idx").on(t.sessionId),
  index("oauth_refresh_token_user_id_idx").on(t.userId),
  index("oauth_refresh_token_authorization_code_id_idx").on(t.authorizationCodeId),
]);

export const oauthAccessToken = pgTable("oauth_access_token", {
  id: text("id").primaryKey(),
  token: text("token").unique(),
  clientId: text("client_id").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  authorizationCodeId: text("authorization_code_id"),
  resources: text("resources").array(),
  requestedUserInfoClaims: text("requested_user_info_claims").array(),
  refreshId: text("refresh_id").references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at"),
  revoked: timestamp("revoked"),
  confirmation: jsonb("confirmation"),
  scopes: text("scopes").array().notNull(),
}, (t) => [
  index("oauth_access_token_client_id_idx").on(t.clientId),
  index("oauth_access_token_session_id_idx").on(t.sessionId),
  index("oauth_access_token_user_id_idx").on(t.userId),
  index("oauth_access_token_authorization_code_id_idx").on(t.authorizationCodeId),
  index("oauth_access_token_refresh_id_idx").on(t.refreshId),
]);

export const oauthConsent = pgTable("oauth_consent", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  resources: text("resources").array(),
  requestedUserInfoClaims: text("requested_user_info_claims").array(),
  scopes: text("scopes").array().notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
}, (t) => [
  index("oauth_consent_client_id_idx").on(t.clientId),
  index("oauth_consent_user_id_idx").on(t.userId),
]);

// Single-use tombstone for private_key_jwt assertion `jti` values — the id is a
// digest, so a replay collides on the primary key instead of racing.
export const oauthClientAssertion = pgTable("oauth_client_assertion", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
});

// ---- better-auth jwt plugin ----
export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at").notNull(),
  expiresAt: timestamp("expires_at"),
  alg: text("alg"),
  crv: text("crv"),
});
