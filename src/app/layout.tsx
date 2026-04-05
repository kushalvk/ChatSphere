import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./Providers";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,      // Prevents iOS Safari from zooming in on inputs
  userScalable: false,  // Prevents user pinch zooming to keep native app feel
};

export const metadata: Metadata = {
  title: "ChatShere1 OTP Chat",
  description: "Real-time Next.js Chat Application",
  manifest: "/manifest.json", // Good practice for PWA
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
