import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { preferredShopLanguage } from "../lib/shop-language";
import "./globals.css";
import "./input-focus.css";
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};
export const metadata: Metadata = {
  title: "digimium. — Your digital life, elevated",
  description: "Explore premium AI tools, creative apps, music, and entertainment with Digimium. Find your service and contact us for current plans and prices.",
  icons: { icon: "/assets/symbol-blue.png" },
};
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const preferences = await cookies();
  const language = preferredShopLanguage(preferences.get("digimium-language")?.value);
  return <html lang={language}><body>{children}</body></html>;
}
