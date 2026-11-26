import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { commerceEnabled } from "@/lib/commerce-enabled";
import { customerOrderBotLink } from "@/hostinger/customer-order-telegram";
import { preferredShopLanguage } from "@/lib/shop-language";
import Account from "./account";
import "./account.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My account — digimium.",
  robots: { index: false, follow: false },
};

export default async function AccountPage({ searchParams }: {
  searchParams: Promise<{ checkout?: string; google?: string; returnTo?: string }>;
}) {
  if (!commerceEnabled) notFound();
  const [preferences, query] = await Promise.all([cookies(), searchParams]);
  return <Account lang={preferredShopLanguage(preferences.get("digimium-language")?.value)} orderBotUrl={customerOrderBotLink()} checkout={query.checkout === "1" || query.returnTo === "checkout"} resumeGoogle={query.google === "continue" || query.google === "error"} googleReturnTo={query.returnTo === "checkout" ? "checkout" : query.returnTo === "history" ? "history" : "account"} />;
}
