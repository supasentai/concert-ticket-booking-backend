-- CreateEnum
CREATE TYPE "VoucherDiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "VoucherUsageStatus" AS ENUM ('APPLIED', 'RELEASED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "subtotal" DECIMAL(12,2),
ADD COLUMN     "voucherCodeSnapshot" TEXT,
ADD COLUMN     "voucherDiscountTypeSnapshot" "VoucherDiscountType",
ADD COLUMN     "voucherDiscountValueSnapshot" DECIMAL(12,2),
ADD COLUMN     "voucherId" TEXT,
ADD COLUMN     "voucherMaximumDiscountAmountSnapshot" DECIMAL(12,2);

UPDATE "Booking" SET "subtotal" = "totalAmount" WHERE "subtotal" IS NULL;

ALTER TABLE "Booking" ALTER COLUMN "subtotal" SET NOT NULL;

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "VoucherDiscountType" NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "maximumDiscountAmount" DECIMAL(12,2),
    "minimumOrderAmount" DECIMAL(12,2),
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "perUserUsageLimit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherUsage" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "status" "VoucherUsageStatus" NOT NULL DEFAULT 'APPLIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "VoucherUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherUserUsage" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoucherUserUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_code_key" ON "Voucher"("code");

-- CreateIndex
CREATE INDEX "Voucher_code_idx" ON "Voucher"("code");

-- CreateIndex
CREATE INDEX "Voucher_isActive_startsAt_expiresAt_idx" ON "Voucher"("isActive", "startsAt", "expiresAt");

-- CreateIndex
CREATE INDEX "Voucher_expiresAt_idx" ON "Voucher"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherUsage_bookingId_key" ON "VoucherUsage"("bookingId");

-- CreateIndex
CREATE INDEX "VoucherUsage_voucherId_userId_idx" ON "VoucherUsage"("voucherId", "userId");

-- CreateIndex
CREATE INDEX "VoucherUsage_voucherId_status_idx" ON "VoucherUsage"("voucherId", "status");

-- CreateIndex
CREATE INDEX "VoucherUsage_userId_status_idx" ON "VoucherUsage"("userId", "status");

-- CreateIndex
CREATE INDEX "VoucherUserUsage_userId_idx" ON "VoucherUserUsage"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherUserUsage_voucherId_userId_key" ON "VoucherUserUsage"("voucherId", "userId");

-- CreateIndex
CREATE INDEX "Booking_voucherId_idx" ON "Booking"("voucherId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherUsage" ADD CONSTRAINT "VoucherUsage_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherUsage" ADD CONSTRAINT "VoucherUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherUsage" ADD CONSTRAINT "VoucherUsage_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherUserUsage" ADD CONSTRAINT "VoucherUserUsage_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherUserUsage" ADD CONSTRAINT "VoucherUserUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
