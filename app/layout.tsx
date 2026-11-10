import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "digimium. — Your digital life, elevated",
  description: "Explore premium AI tools, creative apps, music, and entertainment with Digimium. Find your service and contact us for current plans and prices.",
  icons: { icon: "/assets/symbol-blue.png" },
};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {return <html lang="en"><body>{children}</body></html>;}
