import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Talentera Acquisition Command Center",
  description: "Live acquisition performance, pipeline and lead execution from HubSpot.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
