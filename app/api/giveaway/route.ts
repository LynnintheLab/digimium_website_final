import { commerceEnabled } from '@/lib/commerce-enabled';
import { CommerceError, commerceJson, readCommerceJson } from '@/lib/commerce-http';

export const dynamic = 'force-dynamic';
function failure(error: unknown) {
  return commerceJson({ error: error instanceof CommerceError ? error.message : 'The giveaway is temporarily unavailable. Please try again.' }, error instanceof CommerceError ? error.status : 503);
}
export async function GET(request: Request) {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  try {
    const { currentCustomer } = await import('@/hostinger/customer-auth');
    const { publicGiveaway } = await import('@/hostinger/giveaway');
    return commerceJson(await publicGiveaway(await currentCustomer(request)));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  try {
    const { currentCustomer, customerMutationAllowed } = await import('@/hostinger/customer-auth');
    if (!customerMutationAllowed(request)) return commerceJson({ error: 'Join from this website.' }, 403);
    const customer = await currentCustomer(request);
    if (!customer) return commerceJson({ error: 'Sign in before joining the giveaway.' }, 401);
    const { joinGiveaway } = await import('@/hostinger/giveaway');
    const result = await joinGiveaway(customer, await readCommerceJson(request, 1024));
    return commerceJson(result.data, result.created ? 201 : 200);
  } catch (error) { return failure(error); }
}
