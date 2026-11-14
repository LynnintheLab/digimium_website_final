import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { commerceEnabled } from "@/lib/commerce-enabled";
import { preferredShopLanguage } from "@/lib/shop-language";
import Account from "./account";
import "./account.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My account — digimium.",
  robots: { index: false, follow: false },
};

export default async function AccountPage({ searchParams }: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  if (!commerceEnabled) notFound();
  const [preferences, query] = await Promise.all([cookies(), searchParams]);
  return <Account lang={preferredShopLanguage(preferences.get("digimium-language")?.value)} checkout={query.checkout === "1"} />;
}
