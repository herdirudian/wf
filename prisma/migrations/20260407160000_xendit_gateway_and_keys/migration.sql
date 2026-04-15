-- AlterTable
ALTER TABLE `payment`
    ADD COLUMN `gateway` VARCHAR(191) NULL,
    ADD COLUMN `gatewayRef` VARCHAR(191) NULL,
    ADD COLUMN `gatewayExternalId` VARCHAR(191) NULL,
    ADD COLUMN `checkoutUrl` TEXT NULL,
    ADD COLUMN `gatewayStatus` VARCHAR(191) NULL,
    ADD COLUMN `gatewayExpiresAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `appconfig`
    ADD COLUMN `xenditSecretKey` TEXT NULL,
    ADD COLUMN `xenditCallbackToken` TEXT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `payment_gatewayExternalId_key` ON `payment`(`gatewayExternalId`);

-- CreateIndex
CREATE INDEX `payment_gatewayRef_idx` ON `payment`(`gatewayRef`);

