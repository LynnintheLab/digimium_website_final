import { checkAdmin, isAllowedMutation } from '../../../../../../lib/admin-auth';
import { commerceEnabled } from '../../../../../../lib/commerce-enabled';
import { commerceErrorResponse, commerceJson, readCommerceJson } from '../../../../../../lib/commerce-http';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  if (!commerceEnabled) return commerceJson({ error: 'Notifications are unavailable.' }, 404);
  try {
    const admin = await checkAdmin();
    if (!admin.ok) return commerceJson({ error: admin.message }, admin.status);
    if (request.headers.get('sec-fetch-site') === 'cross-site' || (request.headers.has('origin') && !isAllowedMutation(request))) {
      return commerceJson({ error: 'Open customer messages from this website.' }, 403);
    }
    const { ensureCustomerSchema } = await import('../../../../../../hostinger/customer-auth');
    await ensureCustomerSchema(); const { id } = await context.params;
    const { adminCustomerNotifications } = await import('../../../../../../hostinger/notifications');
    return commerceJson(await adminCustomerNotifications(id, new URL(request.url).searchParams.get('cursor')));
  } catch (error) { return commerceErrorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  if (!commerceEnabled) return commerceJson({ error: 'Notifications are unavailable.' }, 404);
  try {
    const admin = await checkAdmin();
    if (!admin.ok) return commerceJson({ error: admin.message }, admin.status);
    if (!isAllowedMutation(request)) return commerceJson({ error: 'Send messages from this website.' }, 403);
    const body = await readCommerceJson(request, 8192);
    const { ensureCustomerSchema } = await import('../../../../../../hostinger/customer-auth');
    await ensureCustomerSchema(); const { id } = await context.params;
    const { sendCustomerNotification } = await import('../../../../../../hostinger/notifications');
    const result = await sendCustomerNotification(id, body);
    return commerceJson(result, result.created ? 201 : 200);
  } catch (error) { return commerceErrorResponse(error); }
}
