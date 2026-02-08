/*
  Warnings:

  - You are about to drop the column `max_duration_per_file` on the `subscription_plans` table. All the data in the column will be lost.
  - You are about to drop the column `monthly_quota_seconds` on the `subscription_plans` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `subscription_plans` table. All the data in the column will be lost.
  - You are about to drop the column `amount_paid` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `plan_id` on the `subscriptions` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[code]` on the table `subscription_plans` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `code` to the `subscription_plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `subscription_plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `max_duration_per_file_snapshot` to the `subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `monthly_quota_seconds_snapshot` to the `subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `price_snapshot` to the `subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `variant_id` to the `subscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "BillingCycleType" AS ENUM ('MONTHLY', 'SIX_MONTHS', 'YEARLY', 'LIFETIME');

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_plan_id_fkey";

-- AlterTable
ALTER TABLE "subscription_plans" DROP COLUMN "max_duration_per_file",
DROP COLUMN "monthly_quota_seconds",
DROP COLUMN "price",
ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "features" JSONB,
ADD COLUMN     "tierLevel" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "amount_paid",
DROP COLUMN "plan_id",
ADD COLUMN     "max_duration_per_file_snapshot" INTEGER NOT NULL,
ADD COLUMN     "monthly_quota_seconds_snapshot" INTEGER NOT NULL,
ADD COLUMN     "price_snapshot" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "variant_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "plan_variants" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "billing_cycle_type" "BillingCycleType" NOT NULL,
    "max_duration_per_file" INTEGER NOT NULL,
    "monthly_quota_seconds" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- AddForeignKey
ALTER TABLE "plan_variants" ADD CONSTRAINT "plan_variants_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "plan_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
