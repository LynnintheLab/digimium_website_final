import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/admin-auth';
import { commerceEnabled } from '@/lib/commerce-enabled';
import AdminRunningHub from './admin-runninghub';
import '../admin.css';
import './runninghub.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Running HUB — Store admin — digimium.',
  robots: { index: false, follow: false },
};

export default async function RunningHubAdminPage() {
  if (!commerceEnabled) notFound();
  await requireAdminPage();
  return <AdminRunningHub />;
}
