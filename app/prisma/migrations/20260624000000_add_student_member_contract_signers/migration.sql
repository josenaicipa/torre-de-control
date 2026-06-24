-- Firmantes del contrato interno. El titular Student SIEMPRE firma; cuando un
-- equipo entra junto, cada integrante marcado con isContractSigner firma además.
-- La evidencia de firma de cada integrante se guarda en StudentMember; el
-- contrato no se libera hasta que el titular y todos los firmantes requeridos
-- hayan firmado.
ALTER TABLE "StudentMember" ADD COLUMN     "isContractSigner" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN     "contractSignerName" TEXT,
    ADD COLUMN     "contractSignedAt" TIMESTAMP(3),
    ADD COLUMN     "contractSignatureImage" TEXT,
    ADD COLUMN     "contractSignatureHash" TEXT,
    ADD COLUMN     "contractSignedIp" TEXT,
    ADD COLUMN     "contractSignedUserAgent" TEXT;
