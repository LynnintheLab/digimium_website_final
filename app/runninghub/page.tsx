import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { commerceEnabled } from '@/lib/commerce-enabled';
import { preferredShopLanguage } from '@/lib/shop-language';
import RunningHub from './runninghub';
import '../account/account.css';
import './runninghub.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Running HUB API Key — digimium.', robots: { index: false, follow: false } };

export default async function RunningHubPage() {
  if (!commerceEnabled) notFound();
  const preferences = await cookies();
  return <RunningHub lang={preferredShopLanguage(preferences.get('digimium-language')?.value)} />;
}
