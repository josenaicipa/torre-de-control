-- Seed inicial de programas requeridos por el módulo Operaciones.
-- Idempotente vía ON CONFLICT.
INSERT INTO "Program" ("id", "slug", "name", "durationMonthsDefault", "active", "createdAt", "updatedAt")
VALUES
  ('seed_nivel5', 'nivel5', 'Nivel 5', 12, true, NOW(), NOW()),
  ('seed_clases_avanzadas', 'clases-avanzadas', 'Clases Avanzadas', 12, true, NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;
