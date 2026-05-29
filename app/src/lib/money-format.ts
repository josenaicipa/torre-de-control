/**
 * Convierte una entrada de usuario (puede incluir símbolos como "$",
 * espacios, puntos como separador de miles, coma decimal, etc.) a un
 * string numérico canónico parseable con Number.parseFloat
 * (p.ej. "5000000" o "5000000.50"). Devuelve "" si no hay dígitos.
 *
 * Reglas para detectar el separador decimal:
 *   - Si hay tanto "." como ",", el último en aparecer es el decimal.
 *   - Si solo hay un tipo de separador, el último es decimal si está
 *     seguido por 1 o 2 dígitos; en otro caso, todos son separador
 *     de miles.
 */
export function parseMoneyInput(raw: string | null | undefined): string {
  if (raw == null) return "";
  const stripped = String(raw).replace(/[^0-9.,]/g, "");
  if (stripped === "") return "";

  const lastDot = stripped.lastIndexOf(".");
  const lastComma = stripped.lastIndexOf(",");
  const hasDot = lastDot >= 0;
  const hasComma = lastComma >= 0;

  let decimalIdx = -1;
  if (hasDot && hasComma) {
    decimalIdx = Math.max(lastDot, lastComma);
  } else if (hasDot || hasComma) {
    const lastIdx = hasDot ? lastDot : lastComma;
    const digitsAfter = stripped.length - lastIdx - 1;
    if (digitsAfter >= 1 && digitsAfter <= 2) {
      decimalIdx = lastIdx;
    }
  }

  let intPart: string;
  let decPart: string;
  if (decimalIdx >= 0) {
    intPart = stripped.slice(0, decimalIdx).replace(/[.,]/g, "");
    decPart = stripped.slice(decimalIdx + 1).replace(/[.,]/g, "");
  } else {
    intPart = stripped.replace(/[.,]/g, "");
    decPart = "";
  }

  intPart = intPart.replace(/^0+(?=\d)/, "");
  if (intPart === "" && decPart === "") return "";
  if (intPart === "") intPart = "0";

  return decPart ? `${intPart}.${decPart}` : intPart;
}

/**
 * Formatea un string numérico canónico ("5000000.5") como moneda
 * visual con puntos como separador de miles y coma como decimal
 * ("5.000.000,5"). Conserva un separador decimal en proceso de
 * escritura: "5000000." → "5.000.000,".
 */
export function formatMoneyDisplay(
  numericStr: string | null | undefined,
): string {
  if (numericStr == null || numericStr === "") return "";
  const value = String(numericStr);
  const trailing = value.endsWith(".");
  const [intRaw, decRaw = ""] = value.split(".");
  const intDigits = (intRaw ?? "").replace(/\D/g, "");
  const intFormatted =
    intDigits === "" ? "" : intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (trailing) return `${intFormatted},`;
  return decRaw === "" ? intFormatted : `${intFormatted},${decRaw}`;
}
