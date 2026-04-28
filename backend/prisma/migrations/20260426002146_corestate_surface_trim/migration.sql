/*
  Warnings:

  - You are about to drop the column `worldBounds` on the `Campaign` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Campaign" DROP COLUMN "worldBounds",
ADD COLUMN     "boundsMaxX" DOUBLE PRECISION,
ADD COLUMN     "boundsMaxY" DOUBLE PRECISION,
ADD COLUMN     "boundsMinX" DOUBLE PRECISION,
ADD COLUMN     "boundsMinY" DOUBLE PRECISION,
ADD COLUMN     "currentLocationName" TEXT;
