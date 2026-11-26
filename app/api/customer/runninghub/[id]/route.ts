import { commerceErrorResponse, commerceJson } from '@/lib/commerce-http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { runningHubCustomer } = await import('@/hostinger/runninghub-http');
    const customer = await runningHubCustomer(request);
    const { id } = await context.params;
    const { runningHubOrder } = await import('@/hostinger/runninghub');
    return commerceJson(await runningHubOrder(id, customer.id));
  } catch (error) { return commerceErrorResponse(error); }
}
