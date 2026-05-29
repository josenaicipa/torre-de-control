"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoneyDisplay, parseMoneyInput } from "@/lib/money-format";

type BaseInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
>;

interface MoneyInputProps extends BaseInputProps {
  /** Valor canónico numérico ("5000000" o "5000000.50"), almacenado en el state del padre. */
  value: string;
  /** Recibe el nuevo valor canónico numérico (parseable con Number.parseFloat). */
  onChange: (numericStr: string) => void;
}

/**
 * Input controlado para montos en moneda. Muestra separadores de miles
 * con punto y coma decimal (estilo colombiano) mientras el usuario
 * escribe. Emite hacia arriba un string numérico canónico que NO
 * incluye separadores de miles, de modo que el padre lo pase tal cual
 * al backend y a Number.parseFloat para cálculos.
 */
export function MoneyInput({ value, onChange, ...rest }: MoneyInputProps) {
  const [display, setDisplay] = useState(() => formatMoneyDisplay(value));
  const canonicalRef = useRef(value);

  useEffect(() => {
    if (value !== canonicalRef.current) {
      canonicalRef.current = value;
      setDisplay(formatMoneyDisplay(value));
    }
  }, [value]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const canonical = parseMoneyInput(raw);
    // Conservar el separador decimal recién tipeado para que el cursor
    // pueda seguir agregando decimales (ej: "5," antes de "5,5").
    const trimmedRaw = raw.replace(/[^0-9.,]/g, "");
    const endsWithSep = /[.,]$/.test(trimmedRaw);
    const stored =
      endsWithSep && !canonical.includes(".") ? `${canonical || "0"}.` : canonical;
    canonicalRef.current = stored;
    setDisplay(formatMoneyDisplay(stored));
    onChange(stored);
  }

  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    let stored = canonicalRef.current;
    if (stored.endsWith(".")) {
      stored = stored.slice(0, -1);
      canonicalRef.current = stored;
      onChange(stored);
    }
    setDisplay(formatMoneyDisplay(stored));
    rest.onBlur?.(event);
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}
