-- CreateTable
CREATE TABLE `UnitDailyRate` (
    `id` VARCHAR(191) NOT NULL,
    `unitId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `price` INTEGER NOT NULL,
    `allotment` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UnitDailyRate_date_idx`(`date`),
    UNIQUE INDEX `UnitDailyRate_unitId_date_key`(`unitId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UnitDailyRate` ADD CONSTRAINT `UnitDailyRate_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
