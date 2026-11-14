import { commerceEnabled } from '../../../../lib/commerce-enabled';
import { commerceErrorResponse } from '../../../../lib/commerce-http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  try {
    const { guestSession } = await import('../../../../hostinger/guest-checkout');
    return await guestSession(request);
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
