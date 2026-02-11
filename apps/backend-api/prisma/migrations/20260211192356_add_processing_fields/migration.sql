-- CreateEnum
CREATE TYPE "ProcessingMode" AS ENUM ('TRANSCRIBE', 'TRANSCRIBE_TRANSLATE');

-- AlterEnum
ALTER TYPE "MediaStatus" ADD VALUE 'VALIDATING';

-- AlterTable
ALTER TABLE "media_items" ADD COLUMN     "fail_reason" TEXT,
ADD COLUMN     "processing_mode" "ProcessingMode" NOT NULL DEFAULT 'TRANSCRIBE',
ADD COLUMN     "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "source_language" TEXT,
ADD COLUMN     "transcript_s3_key" TEXT;
