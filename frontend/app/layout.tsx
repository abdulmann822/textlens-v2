import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TextLens — OCR Tool",
  description: "Extract text from images and PDFs instantly",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
