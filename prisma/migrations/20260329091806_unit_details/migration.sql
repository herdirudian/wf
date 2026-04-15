-- AlterTable
ALTER TABLE `unit` ADD COLUMN `category` VARCHAR(191) NULL,
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `includesJson` TEXT NULL;

-- CreateIndex
CREATE INDEX `Unit_category_idx` ON `Unit`(`category`);
