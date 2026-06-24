-- Documento de identidad de cada integrante adicional del equipo. Aditiva e
-- idempotente (ADD COLUMN IF NOT EXISTS): cuando está presente se imprime junto
-- al nombre en la cláusula REUNIDOS y en el bloque de firma del PDF.
ALTER TABLE "StudentMember" ADD COLUMN IF NOT EXISTS "documentType" TEXT,
    ADD COLUMN IF NOT EXISTS "documentNumber" TEXT;
