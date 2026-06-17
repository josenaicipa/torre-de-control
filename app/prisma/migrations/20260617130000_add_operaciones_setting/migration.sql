-- Configuración global de Operaciones (key-value). Hoy almacena la firma fija
-- de Jose Naicipa (key "jose_signature_image") usada en todos los contratos.
CREATE TABLE "OperacionesSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "OperacionesSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "OperacionesSetting_updatedById_idx" ON "OperacionesSetting"("updatedById");

-- AddForeignKey
ALTER TABLE "OperacionesSetting" ADD CONSTRAINT "OperacionesSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
