import { commerceErrorResponse, commerceJson, readCommerceJson } from '@/lib/commerce-http';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { runningHubAdmin } = await import('@/hostinger/runninghub-http');
    const admin = await runningHubAdmin(request, true);
    const body = await readCommerceJson(request, 1024);
    const { revealRunningHubKey } = await import('@/hostinger/runninghub');
    return commerceJson(await revealRunningHubKey((await context.params).id, body, admin.userId));
  } catch (error) { return commerceErrorResponse(error); }
}
