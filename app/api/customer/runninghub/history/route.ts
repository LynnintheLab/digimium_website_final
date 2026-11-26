import { commerceErrorResponse, commerceJson } from '@/lib/commerce-http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { runningHubCustomer } = await import('@/hostinger/runninghub-http');
    const customer = await runningHubCustomer(request);
    const { customerRunningHubHistory } = await import('@/hostinger/customer-runninghub-history');
    return commerceJson(await customerRunningHubHistory(customer.id, new URL(request.url).searchParams));
  } catch (error) { return commerceErrorResponse(error); }
}
