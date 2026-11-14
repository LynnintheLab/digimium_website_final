import { commerceEnabled } from '../../../../lib/commerce-enabled';
import { commerceErrorResponse, commerceJson, readCommerceJson } from '../../../../lib/commerce-http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  try {
    const { currentCustomer } = await import('../../../../hostinger/customer-auth');
    const customer = await currentCustomer(request);
    if (!customer) return commerceJson({ error: 'Sign in to view your orders.' }, 401);
    const { customerOrders } = await import('../../../../hostinger/orders');
    return commerceJson({ orders: await customerOrders(customer.id) });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  try {
    const { customerMutationAllowed, currentCustomer } = await import('../../../../hostinger/customer-auth');
    if (!customerMutationAllowed(request)) return commerceJson({ error: 'Submit orders from this website.' }, 403);
    const customer = await currentCustomer(request);
    if (!customer) return commerceJson({ error: 'Sign in before submitting your order.' }, 401);
    const { submitOrder } = await import('../../../../hostinger/orders');
    const result = await submitOrder(customer.id, await readCommerceJson(request, 768 * 1024));
    return commerceJson({ id: result.id }, result.created ? 201 : 200);
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
