-- Run before deploying the matching application code (the sync reads
-- document.sha and writes the sync_source status columns).
-- Additive and nullable: existing documents get NULL sha, which the next sync
-- treats as "changed" and backfills once; existing sources show no last attempt
-- until they sync again.
ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "sha" text;
ALTER TABLE "sync_source" ADD COLUMN IF NOT EXISTS "last_sync_status" text;
ALTER TABLE "sync_source" ADD COLUMN IF NOT EXISTS "last_sync_started_at" timestamp;
ALTER TABLE "sync_source" ADD COLUMN IF NOT EXISTS "last_sync_finished_at" timestamp;
ALTER TABLE "sync_source" ADD COLUMN IF NOT EXISTS "last_sync_error" text;
ALTER TABLE "sync_source" ADD COLUMN IF NOT EXISTS "last_sync_trigger" text;
ALTER TABLE "sync_source" ADD COLUMN IF NOT EXISTS "last_sync_commit" text;
ALTER TABLE "sync_source" ADD COLUMN IF NOT EXISTS "last_sync_stats" jsonb;
