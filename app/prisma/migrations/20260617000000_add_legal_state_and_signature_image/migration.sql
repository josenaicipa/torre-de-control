-- Departamento / estado / provincia del estudiante para el contrato real.
ALTER TABLE "Student" ADD COLUMN     "legalState" TEXT;

-- Imagen (data URL base64) de la firma manuscrita del estudiante.
ALTER TABLE "StudentProductEnrollment" ADD COLUMN     "contractStudentSignatureImage" TEXT;
