import type { Metadata } from "next";
import { EmbedDetector } from "@/components/embed-detector";
import "./globals.css";

export const metadata: Metadata = {
  title: "Torre de Control — Unlocked",
  description: "Torre de Control v2 — robust platform foundation.",
};

// Detecta el iframe de forma síncrona, antes del primer paint, y marca
// <html> con la clase embed-mode. Así el CSS oculta el menú Next replicado
// desde el primer render y evita el salto/parpadeo (ver globals.css).
const EMBED_DETECT_SCRIPT =
  "(function(){try{if(window.self!==window.top){document.documentElement.classList.add('embed-mode');}}catch(e){document.documentElement.classList.add('embed-mode');}})();";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{ __html: EMBED_DETECT_SCRIPT }} />
      </head>
      <body>
        {children}
        <EmbedDetector />
      </body>
    </html>
  );
}
