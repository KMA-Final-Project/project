-- DropForeignKey
ALTER TABLE "user_vocabularies" DROP CONSTRAINT "user_vocabularies_media_item_id_fkey";

-- DropIndex
DROP INDEX "user_vocabularies_user_id_vocabulary_id_key";

-- DropIndex
DROP INDEX "vocabularies_word_key";

-- AlterTable
ALTER TABLE "user_vocabularies"
DROP COLUMN "context_sentence",
ADD COLUMN     "contextual_definition" TEXT NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "end_word_index" INTEGER NOT NULL,
ADD COLUMN     "part_of_speech" TEXT NOT NULL,
ADD COLUMN     "phonetic_snapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "segment_index" INTEGER NOT NULL,
ADD COLUMN     "selected_text_snapshot" TEXT NOT NULL,
ADD COLUMN     "source_sentence" TEXT NOT NULL,
ADD COLUMN     "source_sentence_translation" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "start_word_index" INTEGER NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "media_item_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "vocabularies"
DROP COLUMN "example_sentence",
DROP COLUMN "lookup_count",
DROP COLUMN "meaning",
DROP COLUMN "pronunciation",
ADD COLUMN     "normalized_word" TEXT NOT NULL,
ADD COLUMN     "phonetic" TEXT,
ADD COLUMN     "source_language" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "user_vocabularies_user_id_vocabulary_id_idx" ON "user_vocabularies"("user_id", "vocabulary_id");

-- CreateIndex
CREATE INDEX "user_vocabularies_media_item_id_segment_index_idx" ON "user_vocabularies"("media_item_id", "segment_index");

-- CreateIndex
CREATE UNIQUE INDEX "user_vocabularies_user_id_media_item_id_segment_index_start_key" ON "user_vocabularies"("user_id", "media_item_id", "segment_index", "start_word_index", "end_word_index");

-- CreateIndex
CREATE INDEX "vocabularies_source_language_idx" ON "vocabularies"("source_language");

-- CreateIndex
CREATE UNIQUE INDEX "vocabularies_normalized_word_source_language_key" ON "vocabularies"("normalized_word", "source_language");

-- AddForeignKey
ALTER TABLE "user_vocabularies" ADD CONSTRAINT "user_vocabularies_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
