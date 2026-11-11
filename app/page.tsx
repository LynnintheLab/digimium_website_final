import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import Storefront from './storefront';
import { getPublicCatalog } from '../lib/catalog-store';

export const dynamic = 'force-dynamic';

async function storefrontOrigin() {
  const configured = process.env.APP_ORIGIN;
  if (configured && URL.canParse(configured)) {
    const url = new URL(configured);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin;
  }

  // The Sites deployment has no Hostinger environment settings.
  const host = (await headers()).get('host');
  if (host === 'digimium-minimal.aungnyeinchantun23.chatgpt.site' || host === 'test.buywith-digimium.store') {
    return 'https://' + host;
  }
  return 'https://buywith-digimium.store';
}

export async function generateMetadata(): Promise<Metadata> {
  const origin = await storefrontOrigin();
  const title = 'digimium. — Digital subscriptions';
  const description = 'Find plans for ChatGPT, Canva, Spotify and more. Browse in English or Myanmar and order through Telegram.';
  const image = {
    url: new URL('/assets/digimium-share.png', origin).href,
    width: 1200,
    height: 630,
    type: 'image/png',
    alt: 'Digimium logo on a blue gradient with the words “Digital. Premium. Make Simple.”',
  };
  return {
    title,
    description,
    openGraph: { type: 'website', siteName: 'digimium.', url: origin + '/', title, description, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [{ url: image.url, alt: image.alt }] },
  };
}

export default async function Home() {
  const [catalog, preferences] = await Promise.all([getPublicCatalog(), cookies()]);
  const language = preferences.get('digimium-language')?.value === 'my' ? 'my' : 'en';
  return <Storefront initialCatalog={catalog} initialLanguage={language} />;
}
