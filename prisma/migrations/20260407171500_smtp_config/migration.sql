-- AlterTable
ALTER TABLE `appconfig`
    ADD COLUMN `smtpHost` VARCHAR(191) NULL,
    ADD COLUMN `smtpPort` INTEGER NULL,
    ADD COLUMN `smtpSecure` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `smtpUser` VARCHAR(191) NULL,
    ADD COLUMN `smtpPassword` TEXT NULL,
    ADD COLUMN `smtpFromName` VARCHAR(191) NULL,
    ADD COLUMN `paymentNotifyEmails` TEXT NULL;

