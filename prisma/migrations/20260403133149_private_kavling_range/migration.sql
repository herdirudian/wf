-- AlterTable
ALTER TABLE `appconfig` ADD COLUMN `privateKavlingEnd` INTEGER NOT NULL DEFAULT 65,
    ADD COLUMN `privateKavlingStart` INTEGER NOT NULL DEFAULT 58;
