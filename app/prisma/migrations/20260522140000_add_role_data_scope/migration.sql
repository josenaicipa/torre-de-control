-- Panel-controlled, GHL-tied role/scope configuration for scoped dashboards.

-- CreateEnum
CREATE TYPE "OperationalPosition" AS ENUM ('ADMIN', 'DIRECTOR', 'CLOSER', 'SETTER', 'VIEWER');

-- CreateEnum
CREATE TYPE "DataScope" AS ENUM ('ALL', 'AREA', 'TEAM', 'OWN', 'CUSTOM');

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "areaId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "position" "OperationalPosition" NOT NULL DEFAULT 'VIEWER',
ADD COLUMN     "dataScope" "DataScope" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "areaId" TEXT,
ADD COLUMN     "teamId" TEXT,
ADD COLUMN     "managerId" TEXT,
ADD COLUMN     "ghlUserId" TEXT,
ADD COLUMN     "ghlUserEmail" TEXT,
ADD COLUMN     "ghlUserName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Area_name_key" ON "Area"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Area_slug_key" ON "Area"("slug");

-- CreateIndex
CREATE INDEX "Team_areaId_idx" ON "Team"("areaId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_areaId_name_key" ON "Team"("areaId", "name");

-- CreateIndex
CREATE INDEX "User_position_idx" ON "User"("position");

-- CreateIndex
CREATE INDEX "User_dataScope_idx" ON "User"("dataScope");

-- CreateIndex
CREATE INDEX "User_areaId_idx" ON "User"("areaId");

-- CreateIndex
CREATE INDEX "User_teamId_idx" ON "User"("teamId");

-- CreateIndex
CREATE INDEX "User_managerId_idx" ON "User"("managerId");

-- CreateIndex
CREATE INDEX "User_ghlUserId_idx" ON "User"("ghlUserId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: keep existing admins fully privileged under the future scoped pipeline.
-- Everyone else keeps the backward-compatible ALL scope (default) until Jose
-- configures them per-user from Admin > Usuarios.
UPDATE "User" SET "position" = 'ADMIN', "dataScope" = 'ALL' WHERE "role" = 'ADMIN';

-- Seed default areas and basic teams so Admin > Usuarios has useful options
-- before any area/team management UI exists. Idempotent: ON CONFLICT DO NOTHING
-- against the unique constraints means re-running (or running on a DB that was
-- partially seeded) is safe and never duplicates. Ids/updatedAt are supplied
-- explicitly because Prisma generates those at the application layer, not the DB.
INSERT INTO "Area" ("id", "name", "slug", "active", "createdAt", "updatedAt")
VALUES
  ('area_ventas', 'Ventas', 'ventas', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('area_setters', 'Setters', 'setters', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('area_operaciones', 'Operaciones', 'operaciones', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('area_marketing', 'Marketing', 'marketing', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('area_direccion', 'Dirección', 'direccion', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Basic teams, linked to their area by name lookup so this works regardless of
-- pre-existing area ids. Unique (areaId, name) makes each insert idempotent.
INSERT INTO "Team" ("id", "name", "areaId", "active", "createdAt", "updatedAt")
SELECT t.id, t.name, a.id, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  VALUES
    ('team_ventas_closers', 'Ventas', 'Closers'),
    ('team_ventas_setters', 'Ventas', 'Setters'),
    ('team_operaciones', 'Operaciones', 'Operaciones'),
    ('team_marketing', 'Marketing', 'Marketing')
) AS t("id", "areaName", "name")
JOIN "Area" a ON a."name" = t."areaName"
ON CONFLICT ("areaId", "name") DO NOTHING;
