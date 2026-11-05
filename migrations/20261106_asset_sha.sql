-- Run before deploying the matching application code (the sync selects asset.sha).
-- Additive and nullable: existing rows get NULL, which the next sync treats as
-- "changed" and backfills once.
ALTER TABLE "asset" ADD COLUMN IF NOT EXISTS "sha" text;
