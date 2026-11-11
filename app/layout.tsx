import type { Metadata, Viewport } from "next";
import "./globals.css";
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};
export const metadata: Metadata = {
  title: "digimium. — Your digital life, elevated",
  description: "Explore premium AI tools, creative apps, music, and entertainment with Digimium. Find your service and contact us for current plans and prices.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  },
};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {return <html lang="en"><body>{children}</body></html>;}
