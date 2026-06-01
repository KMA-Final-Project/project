-- AlterTable
ALTER TABLE "media_items" ADD COLUMN     "has_thumbnail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "youtube_video_id" TEXT;
