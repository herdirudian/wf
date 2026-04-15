-- CreateTable
CREATE TABLE `KavlingHold` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `checkIn` DATETIME(3) NOT NULL,
    `checkOut` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `KavlingHold_token_key`(`token`),
    INDEX `KavlingHold_expiresAt_idx`(`expiresAt`),
    INDEX `KavlingHold_checkIn_checkOut_idx`(`checkIn`, `checkOut`),
    INDEX `KavlingHold_scope_idx`(`scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KavlingHoldKavling` (
    `id` VARCHAR(191) NOT NULL,
    `holdId` VARCHAR(191) NOT NULL,
    `kavlingId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `KavlingHoldKavling_holdId_idx`(`holdId`),
    INDEX `KavlingHoldKavling_kavlingId_idx`(`kavlingId`),
    UNIQUE INDEX `KavlingHoldKavling_holdId_kavlingId_key`(`holdId`, `kavlingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `KavlingHoldKavling` ADD CONSTRAINT `KavlingHoldKavling_holdId_fkey` FOREIGN KEY (`holdId`) REFERENCES `KavlingHold`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KavlingHoldKavling` ADD CONSTRAINT `KavlingHoldKavling_kavlingId_fkey` FOREIGN KEY (`kavlingId`) REFERENCES `Kavling`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
