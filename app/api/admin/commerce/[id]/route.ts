import { checkAdmin, isAllowedMutation } from '../../../../../lib/admin-auth';
import { commerceEnabled } from '../../../../../lib/commerce-enabled';
import { commerceErrorResponse, commerceJson, readCommerceJson } from '../../../../../lib/commerce-http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!commerceEnabled) return commerceJson({ error: 'Orders are unavailable.' }, 404);
  try {
    const admin = await checkAdmin();
    if (!admin.ok) return commerceJson({ error: admin.message }, admin.status);
    const { id } = await context.params;
    const { orderDetails } = await import('../../../../../hostinger/orders');
    return commerceJson(await orderDetails(id, undefined, new URL(request.url).searchParams.get('view') !== 'status'));
  } catch (error) { return commerceErrorResponse(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  try {
    const admin = await checkAdmin();
    if (!admin.ok) return commerceJson({ error: admin.message }, admin.status);
    if (!isAllowedMutation(request)) return commerceJson({ error: 'Update orders from this website.' }, 403);
    const { id } = await context.params;
    const body = await readCommerceJson(request, 2 * 1024 * 1024);
    const { updateOrder } = await import('../../../../../hostinger/orders');
    return commerceJson({ order: await updateOrder(id, body) });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!commerceEnabled) return commerceJson({ error: 'Orders are unavailable.' }, 404);
  try {
    const admin = await checkAdmin();
    if (!admin.ok) return commerceJson({ error: admin.message }, admin.status);
    if (!isAllowedMutation(request)) return commerceJson({ error: 'Remove orders from this website.' }, 403);
    const { id } = await context.params;
    const body = await readCommerceJson(request, 1024);
    const { removeOrder } = await import('../../../../../hostinger/orders');
    return commerceJson(await removeOrder(id, body));
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
