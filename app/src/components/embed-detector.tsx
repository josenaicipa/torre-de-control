"use client";

import { useEffect } from "react";

/**
 * Detecta si la pagina corre dentro de un iframe. Si si, agrega
 * la clase 'embed-mode' al <body> para que el CSS oculte el sidebar
 * replicado y maximice el area de contenido.
 */
export function EmbedDetector() {
  useEffect(() => {
    try {
      if (window.self !== window.top) {
        document.body.classList.add("embed-mode");
      }
    } catch {
      document.body.classList.add("embed-mode");
    }
  }, []);
  return null;
}
