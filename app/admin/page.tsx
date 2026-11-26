import type { Metadata } from 'next';
import { emailCodeLogin, requireAdminPage, signOutPath } from '@/lib/admin-auth';
import AdminCatalog from './admin-catalog';
import './admin.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Store admin — digimium.',
  robots: { index: false, follow: false },
};

const recordId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export default async function AdminPage({ searchParams }: {
  searchParams: Promise<{ order?: string | string[]; customer?: string | string[] }>;
}) {
  const user = await requireAdminPage();
  const { order, customer } = await searchParams;
  const initialRecord = typeof order === 'string' && recordId.test(order) ? { view: 'orders' as const, id: order.toLowerCase() }
    : typeof customer === 'string' && recordId.test(customer) ? { view: 'customers' as const, id: customer.toLowerCase() }
    : undefined;
  return <AdminCatalog identity={{ name: user.displayName, email: user.email }} signOutHref={signOutPath}
    postSignOut={emailCodeLogin} initialRecord={initialRecord} />;
}
