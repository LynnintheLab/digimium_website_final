import type { Metadata } from 'next';
import { emailCodeLogin, requireAdminPage, signOutPath } from '@/lib/admin-auth';
import AdminCatalog from './admin-catalog';
import './admin.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Store admin — digimium.',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const user = await requireAdminPage();
  return <AdminCatalog identity={{ name: user.displayName, email: user.email }} signOutHref={signOutPath} postSignOut={emailCodeLogin} />;
}
