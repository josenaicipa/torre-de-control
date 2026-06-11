"use client";

import { useEffect } from "react";

/**
 * Fallback de hidratación: el script inline del layout ya marca <html>
 * con 'embed-mode' antes del primer paint. Esto reafirma la clase por si
 * el script inline fue bloqueado (CSP, etc.) para que el CSS oculte el
 * menú Next replicado y maximice el área de contenido.
 */
export function EmbedDetector() {
  useEffect(() => {
    try {
      if (window.self !== window.top) {
        document.documentElement.classList.add("embed-mode");
      }
    } catch {
      document.documentElement.classList.add("embed-mode");
    }
  }, []);
  return null;
}
