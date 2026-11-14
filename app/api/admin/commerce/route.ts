import { checkAdmin } from '../../../../lib/admin-auth';
import { commerceEnabled } from '../../../../lib/commerce-enabled';
import { commerceErrorResponse, commerceJson } from '../../../../lib/commerce-http';

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
