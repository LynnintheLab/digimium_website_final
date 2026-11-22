import { commerceEnabled } from '../../../../lib/commerce-enabled';
import { commerceErrorResponse, commerceJson, readCommerceJson } from '../../../../lib/commerce-http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!commerceEnabled) return commerceJson({ error: 'Checkout is unavailable.' }, 404);
  try {
    const { currentCustomer } = await import('../../../../hostinger/customer-auth');
    const customer = await currentCustomer(request);
    if (!customer) return commerceJson({ error: 'Sign in to view your checkout.' }, 401);
    const { recoverWebsiteOrder } = await import('../../../../hostinger/orders');
    return commerceJson(await recoverWebsiteOrder(customer.id, new URL(request.url).searchParams.get('requestId') ?? ''));
  } catch (error) { return commerceErrorResponse(error); }
}

export async function POST(request: Request) {
  if (!commerceEnabled) return commerceJson({ error: 'Checkout is unavailable.' }, 404);
  try {
    const { currentCustomer, customerMutationAllowed } = await import('../../../../hostinger/customer-auth');
    if (!customerMutationAllowed(request)) return commerceJson({ error: 'Submit orders from this website.' }, 403);
    const customer = await currentCustomer(request);
    if (!customer) return commerceJson({ error: 'Sign in before placing a website order.' }, 401);
    const { createWebsiteOrder } = await import('../../../../hostinger/orders');
    const result = await createWebsiteOrder(customer.id, await readCommerceJson(request, 1024 * 1024));
    return commerceJson(result, result.created ? 201 : 200);
  } catch (error) { return commerceErrorResponse(error); }
}
