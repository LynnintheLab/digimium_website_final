import { checkAdmin, isAllowedMutation } from '../../../../../lib/admin-auth';
import { commerceEnabled } from '../../../../../lib/commerce-enabled';
import { commerceErrorResponse, commerceJson, readCommerceJson } from '../../../../../lib/commerce-http';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  try {
    const admin = await checkAdmin();
    if (!admin.ok) return commerceJson({ error: admin.message }, admin.status);
    if (!isAllowedMutation(request)) return commerceJson({ error: 'Update orders from this website.' }, 403);
    const { id } = await context.params;
    const body = await readCommerceJson(request, 2 * 1024 * 1024);
    const { saveFulfillment } = await import('../../../../../hostinger/orders');
    return commerceJson({ order: await saveFulfillment(id, body) });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
