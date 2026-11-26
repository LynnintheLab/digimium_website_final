import { commerceErrorResponse, commerceJson, readCommerceJson } from '@/lib/commerce-http';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const { runningHubAdmin } = await import('@/hostinger/runninghub-http');
    const admin = await runningHubAdmin(request, true);
    const body = await readCommerceJson(request, 256 * 1024);
    const { importRunningHubStock } = await import('@/hostinger/runninghub');
    const result = await importRunningHubStock(body, admin.userId);
    return commerceJson(result, result.created ? 201 : 200);
  } catch (error) { return commerceErrorResponse(error); }
}
