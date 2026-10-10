-- Run before deploying the matching application code.
-- Existing URLs keep the jack-db85 slug; only its display name changes.
CREATE TABLE IF NOT EXISTS "organization_domain" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "domain" text NOT NULL UNIQUE,
  "auto_join" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "organization_domain_org_idx"
  ON "organization_domain" ("organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "member_org_user"
  ON "member" ("organization_id", "user_id");

UPDATE "organization"
SET "name" = 'Pathors'
WHERE "slug" = 'jack-db85';

INSERT INTO "organization_domain" ("id", "organization_id", "domain", "auto_join")
SELECT 'pathors-com-domain', "id", 'pathors.com', true
FROM "organization"
WHERE "slug" = 'jack-db85'
ON CONFLICT ("domain") DO UPDATE SET "auto_join" = true
WHERE "organization_domain"."organization_id" = EXCLUDED."organization_id";

INSERT INTO "member" ("id", "organization_id", "user_id", "role")
SELECT
  'domain-backfill-' || md5(u."id" || ':' || o."id"),
  o."id",
  u."id",
  'member'
FROM "user" u
CROSS JOIN "organization" o
WHERE o."slug" = 'jack-db85'
  AND u."email_verified" = true
  AND lower(split_part(u."email", '@', 2)) = 'pathors.com'
ON CONFLICT ("organization_id", "user_id") DO NOTHING;
