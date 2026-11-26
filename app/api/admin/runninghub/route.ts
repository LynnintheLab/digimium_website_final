import { commerceErrorResponse, commerceJson, readCommerceJson } from '@/lib/commerce-http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const { runningHubAdmin } = await import('@/hostinger/runninghub-http');
    await runningHubAdmin(request);
    const { adminRunningHub } = await import('@/hostinger/runninghub');
    return commerceJson(await adminRunningHub());
  } catch (error) { return commerceErrorResponse(error); }
}
export async function PUT(request: Request) {
  try {
    const { runningHubAdmin } = await import('@/hostinger/runninghub-http');
    const admin = await runningHubAdmin(request, true);
    const body = await readCommerceJson(request, 8192);
    const { saveRunningHubSettings } = await import('@/hostinger/runninghub');
    return commerceJson(await saveRunningHubSettings(body, admin.userId));
  } catch (error) { return commerceErrorResponse(error); }
}
