import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mata Remitos",
  description: "Automatización de remitos para PyMEs argentinas",
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
