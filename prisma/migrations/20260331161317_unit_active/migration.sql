-- AlterTable
ALTER TABLE `unit` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX `Unit_isActive_idx` ON `Unit`(`isActive`);
