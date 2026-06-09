-- Add updated_at column, backfill from created_at, then enforce NOT NULL
ALTER TABLE "media_items" ADD COLUMN "updated_at" TIMESTAMP(3);
UPDATE "media_items" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;
ALTER TABLE "media_items" ALTER COLUMN "updated_at" SET NOT NULL;
