import type { Metadata } from "next";
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
      <body>{children}</body>
    </html>
  );
}
