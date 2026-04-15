-- AlterTable
ALTER TABLE `appconfig` ADD COLUMN `balanceReminderDays` INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE `booking` ADD COLUMN `balanceReminderSentAt` DATETIME(3) NULL;

-- RedefineIndex
CREATE UNIQUE INDEX `Payment_gatewayExternalId_key` ON `Payment`(`gatewayExternalId`);
DROP INDEX `payment_gatewayExternalId_key` ON `payment`;

-- RedefineIndex
CREATE INDEX `Payment_gatewayRef_idx` ON `Payment`(`gatewayRef`);
DROP INDEX `payment_gatewayRef_idx` ON `payment`;
