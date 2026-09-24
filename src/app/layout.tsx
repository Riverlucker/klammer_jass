import type { Metadata } from "next";
import "./globals.css";

const buildTimestamp = process.env.BUILD_TIMESTAMP;
const buildLabel = buildTimestamp
  ? new Intl.DateTimeFormat("de-AT", {
      timeZone: "Europe/Vienna",
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      timeZoneName: "short",
    }).format(new Date(buildTimestamp))
  : null;

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
      <body>
        <div className="build-timestamp">
          {buildLabel
            ? <>Build <time dateTime={buildTimestamp}>{buildLabel}</time></>
            : "Lokale Entwicklung"}
        </div>
        {children}
      </body>
    </html>
  );
}
