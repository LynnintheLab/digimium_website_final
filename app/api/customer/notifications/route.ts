import { commerceEnabled } from '../../../../lib/commerce-enabled';
import { commerceErrorResponse, commerceJson, readCommerceJson } from '../../../../lib/commerce-http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!commerceEnabled) return commerceJson({ error: 'Notifications are unavailable.' }, 404);
  try {
    const { currentCustomer, customerMutationAllowed } = await import('../../../../hostinger/customer-auth');
    if (request.headers.get('sec-fetch-site') === 'cross-site' || (request.headers.has('origin') && !customerMutationAllowed(request))) {
      return commerceJson({ error: 'Open notifications from this website.' }, 403);
    }
    const customer = await currentCustomer(request);
    if (!customer) return commerceJson({ error: 'Sign in to view notifications.' }, 401);
    const { customerNotifications } = await import('../../../../hostinger/notifications');
    return commerceJson(await customerNotifications(customer.id, new URL(request.url).searchParams.get('cursor')));
  } catch (error) { return commerceErrorResponse(error); }
}

export async function PATCH(request: Request) {
  if (!commerceEnabled) return commerceJson({ error: 'Notifications are unavailable.' }, 404);
  try {
    const { currentCustomer, customerMutationAllowed } = await import('../../../../hostinger/customer-auth');
    if (!customerMutationAllowed(request)) return commerceJson({ error: 'Update notifications from this website.' }, 403);
    const customer = await currentCustomer(request);
    if (!customer) return commerceJson({ error: 'Sign in to update notifications.' }, 401);
    const body = await readCommerceJson(request, 4096);
    const { readCustomerNotifications } = await import('../../../../hostinger/notifications');
    return commerceJson(await readCustomerNotifications(customer.id, body));
  } catch (error) { return commerceErrorResponse(error); }
}
