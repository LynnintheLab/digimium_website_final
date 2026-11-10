import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/admin-auth';
import { chatGPTSignOutPath } from '@/app/chatgpt-auth';
import AdminCatalog from './admin-catalog';
import './admin.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Catalog admin — digimium.',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const user = await requireAdminPage();
  return <AdminCatalog identity={{ name: user.displayName, email: user.email }} signOutHref={chatGPTSignOutPath('/')} />;
}
