import type { Metadata } from "next";
import { Barlow_Condensed, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Shell } from "@/components/shell/Shell";
import "./globals.css";

const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  style: ["normal", "italic"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Pit Wall",
  description: "Unofficial Formula 1 live timing and data, powered by OpenF1.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${barlow.variable} ${jetbrains.variable} ${grotesk.variable} antialiased`}>
      <head>
        {/* Icon font used by the Stitch design; next/font cannot load variable icon fonts. */}
        {/* display=block: icon names must not flash as text while the font loads. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
