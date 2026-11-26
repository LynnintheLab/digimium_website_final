import { commerceErrorResponse, commerceJson, readCommerceJson } from '@/lib/commerce-http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { runningHubAdmin } = await import('@/hostinger/runninghub-http');
    await runningHubAdmin(request);
    const { runningHubOrder } = await import('@/hostinger/runninghub');
    return commerceJson(await runningHubOrder((await context.params).id));
  } catch (error) { return commerceErrorResponse(error); }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { runningHubAdmin } = await import('@/hostinger/runninghub-http');
    const admin = await runningHubAdmin(request, true);
    const body = await readCommerceJson(request, 8192);
    const { decideRunningHubOrder } = await import('@/hostinger/runninghub');
    return commerceJson(await decideRunningHubOrder((await context.params).id, body, admin.userId));
  } catch (error) { return commerceErrorResponse(error); }
}
