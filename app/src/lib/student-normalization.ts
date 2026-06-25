// Una ficha que llega desde GHL/n8n entra a Torre con solo nombre, correo y
// teléfono: sin producto, sin duración real, sin estado comercial. Queda
// "pendiente de completar" hasta que un operador la normaliza (le asigna un
// producto/inscripción y diligencia el resto de datos).
//
// La señal se DERIVA de datos ya existentes para no requerir migración:
//   • durationAssumed === true → la duración guardada es un default técnico,
//     no una duración real (la fija el endpoint n8n al crear la ficha).
//   • sin inscripciones (enrollmentCount === 0) → todavía no tiene producto.
//
// En cuanto se le crea una inscripción de producto la ficha deja de estar
// pendiente automáticamente. Los estudiantes legacy/manuales (durationAssumed
// === false) nunca se marcan como pendientes por esta vía.

export interface StudentNormalizationInput {
  durationAssumed: boolean;
  enrollmentCount: number;
}

export function isStudentPendingNormalization(
  input: StudentNormalizationInput,
): boolean {
  return input.durationAssumed === true && input.enrollmentCount === 0;
}

export const PENDING_NORMALIZATION_LABEL = "Pendiente de completar";
