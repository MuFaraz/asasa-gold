import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Asasa Gold — buy and sell 24K gold",
  description: "Live-priced gold trading demo with 75-second locked quotes, clear sources and safe settlement.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0D4A46" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh bg-canvas font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
