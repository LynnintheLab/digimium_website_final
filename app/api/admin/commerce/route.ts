import { checkAdmin, isAllowedMutation } from '../../../../lib/admin-auth';
import { commerceEnabled } from '../../../../lib/commerce-enabled';
import { commerceErrorResponse, commerceJson, readCommerceJson } from '../../../../lib/commerce-http';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  try {
    const admin = await checkAdmin();
    if (!admin.ok) return commerceJson({ error: admin.message }, admin.status);
    const { adminCommerce } = await import('../../../../hostinger/orders');
    return commerceJson(await adminCommerce());
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  try {
    const admin = await checkAdmin();
    if (!admin.ok) return commerceJson({ error: admin.message }, admin.status);
    if (!isAllowedMutation(request)) return commerceJson({ error: 'Create orders from this website.' }, 403);
    const body = await readCommerceJson(request, 2 * 1024 * 1024);
    const { createAdminOrder } = await import('../../../../hostinger/orders');
    const result = await createAdminOrder(body);
    return commerceJson(result, result.created ? 201 : 200);
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
