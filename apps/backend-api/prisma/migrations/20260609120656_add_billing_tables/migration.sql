-- CreateTable
CREATE TABLE "billing_webhook_events" (
    "id" TEXT NOT NULL,
    "stripe_event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "api_version" TEXT,
    "raw_payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "failure_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_checkout_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "stripe_session_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "success_url" TEXT,
    "cancel_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "billing_checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_webhook_events_stripe_event_id_key" ON "billing_webhook_events"("stripe_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_checkout_sessions_stripe_session_id_key" ON "billing_checkout_sessions"("stripe_session_id");

-- AddForeignKey
ALTER TABLE "billing_checkout_sessions" ADD CONSTRAINT "billing_checkout_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_checkout_sessions" ADD CONSTRAINT "billing_checkout_sessions_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "plan_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: Add stripeCustomerId to users
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" TEXT;
CREATE UNIQUE INDEX "users_stripe_customer_id_key" ON "users"("stripe_customer_id");

-- AlterTable: Add Stripe fields to subscriptions
ALTER TABLE "subscriptions" ADD COLUMN "stripe_subscription_id" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "stripe_price_id" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "stripe_status" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "current_period_start" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN "current_period_end" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Add billing config to plan_variants
ALTER TABLE "plan_variants" ADD COLUMN "checkout_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "plan_variants" ADD COLUMN "stripe_product_id" TEXT;
ALTER TABLE "plan_variants" ADD COLUMN "stripe_price_id" TEXT;
