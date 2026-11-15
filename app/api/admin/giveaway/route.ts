import { checkAdmin, isAllowedMutation } from '@/lib/admin-auth';
import { commerceEnabled } from '@/lib/commerce-enabled';
import { CommerceError, commerceJson, readCommerceJson } from '@/lib/commerce-http';

export const dynamic = 'force-dynamic';
function failure(error: unknown) {
  return commerceJson({ error: error instanceof CommerceError ? error.message : 'The giveaway is temporarily unavailable. Please try again.' }, error instanceof CommerceError ? error.status : 503);
}
export async function GET(request: Request) {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  try {
    const admin = await checkAdmin();
    if (!admin.ok) return commerceJson({ error: admin.message }, admin.status);
    const page = Number(new URL(request.url).searchParams.get('page') || '1');
    if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) return commerceJson({ error: 'Choose a valid entries page.' }, 400);
    const { adminGiveaway } = await import('@/hostinger/giveaway');
    return commerceJson(await adminGiveaway(page));
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  try {
    const admin = await checkAdmin();
    if (!admin.ok) return commerceJson({ error: admin.message }, admin.status);
    if (!isAllowedMutation(request)) return commerceJson({ error: 'Update the giveaway from this website.' }, 403);
    const { updateGiveaway } = await import('@/hostinger/giveaway');
    return commerceJson(await updateGiveaway(await readCommerceJson(request, 2048)));
  } catch (error) { return failure(error); }
}
