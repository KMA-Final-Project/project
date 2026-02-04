-- CreateEnum
CREATE TYPE "OtpType" AS ENUM ('REGISTER', 'FORGOT_PASSWORD');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "otps" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "user_id" TEXT,
    "code" TEXT NOT NULL,
    "type" "OtpType" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "otps_email_type_idx" ON "otps"("email", "type");

-- CreateIndex
CREATE INDEX "otps_user_id_type_idx" ON "otps"("user_id", "type");

-- AddForeignKey
ALTER TABLE "otps" ADD CONSTRAINT "otps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
