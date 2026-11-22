import { commerceEnabled } from '../../../../../lib/commerce-enabled';
import { commerceErrorResponse, commerceJson } from '../../../../../lib/commerce-http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!commerceEnabled) return commerceJson({ error: 'Orders are unavailable.' }, 404);
  try {
    const { currentCustomer } = await import('../../../../../hostinger/customer-auth');
    const customer = await currentCustomer(request);
    if (!customer) return commerceJson({ error: 'Sign in to view your order.' }, 401);
    const { id } = await context.params;
    const { orderDetails } = await import('../../../../../hostinger/orders');
    return commerceJson(await orderDetails(id, customer.id, new URL(request.url).searchParams.get('view') !== 'status'));
  } catch (error) { return commerceErrorResponse(error); }
}
