import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Klammer Jass",
  description: "Klammer Jass für zwei Spieler – sicher und live synchronisiert.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
