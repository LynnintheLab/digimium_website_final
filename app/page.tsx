import { cookies } from 'next/headers';
import Storefront from './storefront';
import { getPublicCatalog } from '../lib/catalog-store';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [catalog, preferences] = await Promise.all([getPublicCatalog(), cookies()]);
  const language = preferences.get('digimium-language')?.value === 'my' ? 'my' : 'en';
  return <Storefront initialCatalog={catalog} initialLanguage={language} />;
}
