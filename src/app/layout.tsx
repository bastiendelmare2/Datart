import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Datart",
  description: "Tri local de fichiers Excel",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
