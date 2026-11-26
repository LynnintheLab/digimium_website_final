import { commerceErrorResponse, commerceJson, readCommerceJson } from '@/lib/commerce-http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const { runningHubCustomer } = await import('@/hostinger/runninghub-http');
    const customer = await runningHubCustomer(request);
    const { customerRunningHub } = await import('@/hostinger/runninghub');
    return commerceJson({ ...await customerRunningHub(customer.id), customer });
  } catch (error) { return commerceErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const { runningHubCustomer } = await import('@/hostinger/runninghub-http');
    const customer = await runningHubCustomer(request, true);
    const body = await readCommerceJson(request, 4096);
    const { createRunningHubOrder } = await import('@/hostinger/runninghub');
    const result = await createRunningHubOrder(customer.id, body);
    return commerceJson(result, result.created ? 201 : 200);
  } catch (error) { return commerceErrorResponse(error); }
}
