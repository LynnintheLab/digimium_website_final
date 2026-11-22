import { commerceEnabled } from '../../../../../../lib/commerce-enabled';
import { commerceErrorResponse, commerceJson, readCommerceJson } from '../../../../../../lib/commerce-http';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!commerceEnabled) return commerceJson({ error: 'Orders are unavailable.' }, 404);
  try {
    const { currentCustomer, customerMutationAllowed } = await import('../../../../../../hostinger/customer-auth');
    if (!customerMutationAllowed(request)) return commerceJson({ error: 'Choose payment from this website.' }, 403);
    const customer = await currentCustomer(request);
    if (!customer) return commerceJson({ error: 'Sign in to pay for your order.' }, 401);
    const { id } = await context.params;
    const { selectOrderPayment } = await import('../../../../../../hostinger/orders');
    return commerceJson(await selectOrderPayment(customer.id, id, await readCommerceJson(request, 1024)));
  } catch (error) { return commerceErrorResponse(error); }
}
