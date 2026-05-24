import type { Metadata } from "next";
import { EmbedDetector } from "@/components/embed-detector";
import "./globals.css";

export const metadata: Metadata = {
  title: "Torre de Control",
  description: "Torre de Control v2 — robust platform foundation.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        {children}
        <EmbedDetector />
      </body>
    </html>
  );
}
