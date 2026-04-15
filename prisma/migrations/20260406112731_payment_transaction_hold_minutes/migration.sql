-- AlterTable
ALTER TABLE `appconfig` ADD COLUMN `holdMinutes` INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE `PaymentTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `adminUserId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `amountDelta` INTEGER NOT NULL,
    `paidAmountBefore` INTEGER NOT NULL,
    `paidAmountAfter` INTEGER NOT NULL,
    `method` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PaymentTransaction_paymentId_idx`(`paymentId`),
    INDEX `PaymentTransaction_adminUserId_idx`(`adminUserId`),
    INDEX `PaymentTransaction_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PaymentTransaction` ADD CONSTRAINT `PaymentTransaction_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentTransaction` ADD CONSTRAINT `PaymentTransaction_adminUserId_fkey` FOREIGN KEY (`adminUserId`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
