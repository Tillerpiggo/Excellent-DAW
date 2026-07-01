import type { CSSProperties } from "react";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cabin Dot Grid",
  description: "A spatial dot grid with refined interaction and modular audio orchestration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased"
        style={
          {
            "--font-geist-sans":
              '"Avenir Next", "Segoe UI Variable Text", "SF Pro Text", "Helvetica Neue", sans-serif',
            "--font-geist-mono":
              '"SFMono-Regular", "JetBrains Mono", Consolas, "Liberation Mono", monospace',
          } as CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
