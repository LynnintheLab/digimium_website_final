import { commerceEnabled } from '../../../../lib/commerce-enabled';
import { commerceErrorResponse, commerceJson, readCommerceJson } from '../../../../lib/commerce-http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  try {
    const { currentCustomer } = await import('../../../../hostinger/customer-auth');
    const customer = await currentCustomer(request);
    if (!customer) return commerceJson({ error: 'Sign in to view your orders.' }, 401);
    const { customerOrders, currentOrderContact } = await import('../../../../hostinger/orders');
    // A contact configuration issue should not hide a customer's purchase history.
    const [allOrders, telegram] = await Promise.all([customerOrders(customer.id), currentOrderContact().catch(() => '')]);
    const view = new URL(request.url).searchParams.get('view');
    let remaining = 3;
    const orders = view === 'history' ? allOrders.filter(order => order.status === 'approved') : view === 'overview'
      ? allOrders.flatMap(order => {
          if (order.status === 'pending') return [{...order, lines: order.lines.map(line => ({...line, accountInfo: ''}))}];
          const lines = order.lines.slice(0, remaining).map(line => ({...line, accountInfo: ''}));
          remaining -= lines.length;
          return lines.length ? [{...order, lines}] : [];
        }) : allOrders;
    return commerceJson({ orders, telegram, customer });
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
    if (!customer) {
      const { currentGuest } = await import('../../../../hostinger/guest-checkout');
      const guestKey = currentGuest(request);
      if (!guestKey) return commerceJson({ error: 'Choose guest checkout or sign in before submitting your order.' }, 401);
      const body = await readCommerceJson(request, 768 * 1024);
      if (!body || typeof body !== 'object' || !Object.hasOwn(body, 'guestName')) {
        return commerceJson({ error: 'Choose guest checkout or sign in before submitting your order.' }, 401);
      }
      const { submitGuestOrder } = await import('../../../../hostinger/orders');
      const result = await submitGuestOrder(guestKey, body, request);
      // submitGuestOrder has validated and normalized this name before saving the order.
      const name = (body as { guestName: string }).guestName.trim();
      return commerceJson({ id: result.order.id, order: result.order, telegram: result.telegram,
        customer: { name, email: null, guest: true } }, result.created ? 201 : 200);
    }
    const { submitOrder } = await import('../../../../hostinger/orders');
    let body = await readCommerceJson(request, 768 * 1024);
    if (body && typeof body === 'object' && !Array.isArray(body) && Object.hasOwn(body, 'guestName')) {
      // Another tab may have signed in while the guest form was open. The verified account wins.
      body = Object.fromEntries(Object.entries(body).filter(([field]) => field !== 'guestName'));
    }
    const result = await submitOrder(customer.id, body);
    return commerceJson({ id: result.order.id, order: result.order, telegram: result.telegram,
      customer: { name: customer.name, email: customer.email } }, result.created ? 201 : 200);
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
