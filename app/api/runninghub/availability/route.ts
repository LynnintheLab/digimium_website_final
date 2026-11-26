import { commerceEnabled } from '@/lib/commerce-enabled';
import { commerceErrorResponse, commerceJson } from '@/lib/commerce-http';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  try {
    const { publicRunningHubStock } = await import('@/hostinger/runninghub');
    return commerceJson({ stock: await publicRunningHubStock() });
  } catch (error) { return commerceErrorResponse(error); }
}
