import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { commerceEnabled } from '@/lib/commerce-enabled';
import { preferredShopLanguage } from '@/lib/shop-language';
import Checkout from './checkout';
import '../account/account.css';
import './checkout.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Checkout — digimium.',
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  if (!commerceEnabled) notFound();
  const preferences = await cookies();
  return <Checkout lang={preferredShopLanguage(preferences.get('digimium-language')?.value)} />;
}
