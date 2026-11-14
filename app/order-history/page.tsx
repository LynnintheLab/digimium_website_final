import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { commerceEnabled } from "@/lib/commerce-enabled";
import { AccountContent } from "../account/account";
import "../account/account.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Order history — digimium.",
  robots: { index: false, follow: false },
};

export default async function OrderHistoryPage() {
  if (!commerceEnabled) notFound();
  const preferences = await cookies();
  return <AccountContent lang={preferences.get("digimium-language")?.value === "my" ? "my" : "en"} history />;
}
