-- CreateTable
CREATE TABLE "TilesetPack" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "projectTilesize" INTEGER NOT NULL DEFAULT 24,
    "scaleAlgo" TEXT NOT NULL DEFAULT 'nearest',
    "origin" JSONB NOT NULL DEFAULT '{}',
    "traitVocab" JSONB NOT NULL DEFAULT '{}',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "TilesetPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tileset" (
    "id" UUID NOT NULL,
    "packId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "imageWidth" INTEGER NOT NULL DEFAULT 0,
    "imageHeight" INTEGER NOT NULL DEFAULT 0,
    "nativeTilesize" INTEGER NOT NULL DEFAULT 16,
    "regions" JSONB NOT NULL DEFAULT '[]',
    "sliceMode" TEXT NOT NULL DEFAULT 'whole',
    "atlas" JSONB NOT NULL DEFAULT '{}',
    "renderedVariants" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Tileset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tile" (
    "id" UUID NOT NULL,
    "tilesetId" UUID NOT NULL,
    "regionId" TEXT NOT NULL DEFAULT '',
    "localId" INTEGER NOT NULL,
    "col" INTEGER NOT NULL DEFAULT 0,
    "row" INTEGER NOT NULL DEFAULT 0,
    "nativeSize" INTEGER NOT NULL DEFAULT 16,
    "atoms" JSONB NOT NULL DEFAULT '[]',
    "traits" JSONB NOT NULL DEFAULT '{}',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "autotileGroupId" UUID,
    "autotileRole" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Tile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutotileGroup" (
    "id" UUID NOT NULL,
    "tilesetId" UUID NOT NULL,
    "regionId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "layout" TEXT NOT NULL DEFAULT 'blob_47',
    "originCol" INTEGER NOT NULL DEFAULT 0,
    "originRow" INTEGER NOT NULL DEFAULT 0,
    "cols" INTEGER,
    "rows" INTEGER,
    "cells" JSONB NOT NULL DEFAULT '{}',
    "traits" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "AutotileGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectionRule" (
    "id" UUID NOT NULL,
    "packId" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "leftTraits" JSONB NOT NULL DEFAULT '{}',
    "rightTraits" JSONB NOT NULL DEFAULT '{}',
    "via" TEXT NOT NULL DEFAULT 'autotile_group',
    "viaRef" JSONB NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ConnectionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapDoc" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "size" JSONB NOT NULL DEFAULT '[64,64]',
    "projectTilesize" INTEGER NOT NULL DEFAULT 24,
    "packIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "layers" JSONB NOT NULL DEFAULT '{}',
    "collision" TEXT NOT NULL DEFAULT '',
    "objects" JSONB NOT NULL DEFAULT '[]',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "campaignId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "MapDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapActor" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "appearance" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "MapActor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TilesetPack_userId_idx" ON "TilesetPack"("userId");

-- CreateIndex
CREATE INDEX "Tileset_packId_idx" ON "Tileset"("packId");

-- CreateIndex
CREATE INDEX "Tile_tilesetId_idx" ON "Tile"("tilesetId");

-- CreateIndex
CREATE INDEX "Tile_autotileGroupId_idx" ON "Tile"("autotileGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "Tile_tilesetId_localId_key" ON "Tile"("tilesetId", "localId");

-- CreateIndex
CREATE INDEX "AutotileGroup_tilesetId_idx" ON "AutotileGroup"("tilesetId");

-- CreateIndex
CREATE INDEX "ConnectionRule_packId_idx" ON "ConnectionRule"("packId");

-- CreateIndex
CREATE INDEX "MapDoc_userId_idx" ON "MapDoc"("userId");

-- CreateIndex
CREATE INDEX "MapActor_userId_idx" ON "MapActor"("userId");

-- AddForeignKey
ALTER TABLE "Tileset" ADD CONSTRAINT "Tileset_packId_fkey" FOREIGN KEY ("packId") REFERENCES "TilesetPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tile" ADD CONSTRAINT "Tile_tilesetId_fkey" FOREIGN KEY ("tilesetId") REFERENCES "Tileset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tile" ADD CONSTRAINT "Tile_autotileGroupId_fkey" FOREIGN KEY ("autotileGroupId") REFERENCES "AutotileGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutotileGroup" ADD CONSTRAINT "AutotileGroup_tilesetId_fkey" FOREIGN KEY ("tilesetId") REFERENCES "Tileset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionRule" ADD CONSTRAINT "ConnectionRule_packId_fkey" FOREIGN KEY ("packId") REFERENCES "TilesetPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
