-- Onboarding Torre: campos para el link público de diligenciamiento que el
-- estudiante completa tras la venta. Aditiva e idempotente (ADD COLUMN IF NOT
-- EXISTS); el token es único para poder buscar la ficha por token.
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "onboardingToken" TEXT,
    ADD COLUMN IF NOT EXISTS "onboardingTokenCreatedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "onboardingResponses" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "Student_onboardingToken_key" ON "Student"("onboardingToken");
