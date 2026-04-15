-- CreateTable
CREATE TABLE `Kavling` (
    `id` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Kavling_number_key`(`number`),
    INDEX `Kavling_number_idx`(`number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookingKavling` (
    `id` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
    `unitId` VARCHAR(191) NOT NULL,
    `kavlingId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BookingKavling_bookingId_idx`(`bookingId`),
    INDEX `BookingKavling_unitId_idx`(`unitId`),
    INDEX `BookingKavling_kavlingId_idx`(`kavlingId`),
    UNIQUE INDEX `BookingKavling_bookingId_unitId_kavlingId_key`(`bookingId`, `unitId`, `kavlingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BookingKavling` ADD CONSTRAINT `BookingKavling_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingKavling` ADD CONSTRAINT `BookingKavling_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingKavling` ADD CONSTRAINT `BookingKavling_kavlingId_fkey` FOREIGN KEY (`kavlingId`) REFERENCES `Kavling`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
