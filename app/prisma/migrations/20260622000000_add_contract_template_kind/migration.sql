-- CreateEnum
CREATE TYPE "ContractTemplateKind" AS ENUM ('TRADITIONAL', 'BUSINESS');

-- AlterTable
ALTER TABLE "StudentProductEnrollment" ADD COLUMN     "contractTemplateKind" "ContractTemplateKind" NOT NULL DEFAULT 'TRADITIONAL';
