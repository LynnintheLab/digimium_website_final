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
    let body = await readCommerceJson(request, 768 * 1024);
    const fields = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    const explicitGuest = fields.checkoutMode === 'guest';
    if (Object.hasOwn(fields, 'checkoutMode') && !explicitGuest) {
      return commerceJson({ error: 'Choose a valid checkout method.' }, 400);
    }
    // The Telegram-only option stays outside account history, including when the browser is signed in.
    const customer = explicitGuest ? null : await currentCustomer(request);
    if (!customer) {
      const { currentGuest } = await import('../../../../hostinger/guest-checkout');
      const guestKey = currentGuest(request);
      if (!guestKey || (!explicitGuest && !Object.hasOwn(fields, 'guestName'))) {
        return commerceJson({ error: 'Choose guest checkout or sign in before submitting your order.' }, 401);
      }
      const { submitGuestOrder } = await import('../../../../hostinger/orders');
      const result = await submitGuestOrder(guestKey, body, request);
      return commerceJson({ id: result.order.id, order: result.order, telegram: result.telegram,
        customer: { name: result.guestName, email: null, guest: true } }, result.created ? 201 : 200);
    }
    const { submitOrder } = await import('../../../../hostinger/orders');
    if (Object.hasOwn(fields, 'guestName')) {
      // Older name-based clients may have signed in from a second tab before submitting.
      body = Object.fromEntries(Object.entries(fields).filter(([field]) => field !== 'guestName'));
    }
    const result = await submitOrder(customer.id, body);
    return commerceJson({ id: result.order.id, order: result.order, telegram: result.telegram,
      customer: { name: customer.name, email: customer.email } }, result.created ? 201 : 200);
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
