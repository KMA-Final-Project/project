-- CreateEnum
CREATE TYPE "AiCreditReservationState" AS ENUM ('PENDING', 'CONFIRMED', 'REFUNDED');

-- AlterTable
ALTER TABLE "users"
ADD COLUMN "ai_credits_remaining" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "ai_credits_last_reset_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "plan_variants"
ADD COLUMN "ai_credits_per_month" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "subscriptions"
ADD COLUMN "ai_credits_per_month_snapshot" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ai_credit_reservations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "media_id" TEXT,
    "segment_index" INTEGER,
    "state" "AiCreditReservationState" NOT NULL DEFAULT 'PENDING',
    "credits_reserved" INTEGER NOT NULL DEFAULT 1,
    "request_type" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_credit_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "segment_index" INTEGER NOT NULL,
    "segment_text" TEXT,
    "request_type" TEXT NOT NULL,
    "reservation_id" TEXT,
    "credits_consumed" INTEGER NOT NULL DEFAULT 1,
    "tokens_input" INTEGER NOT NULL DEFAULT 0,
    "tokens_output" INTEGER NOT NULL DEFAULT 0,
    "model_used" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "prompt_version" TEXT NOT NULL,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "cache_hit" BOOLEAN NOT NULL DEFAULT false,
    "rejected" BOOLEAN NOT NULL DEFAULT false,
    "aborted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "segment_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tokens_used" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_feedbacks" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_credit_reservations_idempotency_key_key" ON "ai_credit_reservations"("idempotency_key");

-- CreateIndex
CREATE INDEX "ai_credit_reservations_user_id_state_idx" ON "ai_credit_reservations"("user_id", "state");

-- CreateIndex
CREATE INDEX "ai_credit_reservations_expires_at_state_idx" ON "ai_credit_reservations"("expires_at", "state");

-- CreateIndex
CREATE INDEX "ai_credit_reservations_media_id_segment_index_idx" ON "ai_credit_reservations"("media_id", "segment_index");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_logs_reservation_id_key" ON "ai_usage_logs"("reservation_id");

-- CreateIndex
CREATE INDEX "ai_usage_logs_user_id_idx" ON "ai_usage_logs"("user_id");

-- CreateIndex
CREATE INDEX "ai_usage_logs_media_id_segment_index_idx" ON "ai_usage_logs"("media_id", "segment_index");

-- CreateIndex
CREATE INDEX "ai_usage_logs_created_at_idx" ON "ai_usage_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_sessions_user_id_media_id_segment_index_key" ON "chat_sessions"("user_id", "media_id", "segment_index");

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_idx" ON "chat_sessions"("user_id");

-- CreateIndex
CREATE INDEX "chat_sessions_media_id_idx" ON "chat_sessions"("media_id");

-- CreateIndex
CREATE INDEX "chat_messages_session_id_created_at_idx" ON "chat_messages"("session_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_feedbacks_message_id_key" ON "chat_feedbacks"("message_id");

-- CreateIndex
CREATE INDEX "chat_feedbacks_user_id_idx" ON "chat_feedbacks"("user_id");

-- AddForeignKey
ALTER TABLE "ai_credit_reservations" ADD CONSTRAINT "ai_credit_reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_credit_reservations" ADD CONSTRAINT "ai_credit_reservations_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "ai_credit_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_feedbacks" ADD CONSTRAINT "chat_feedbacks_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_feedbacks" ADD CONSTRAINT "chat_feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
