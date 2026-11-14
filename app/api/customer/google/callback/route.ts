import { commerceEnabled } from '../../../../../lib/commerce-enabled';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!commerceEnabled) return new Response(null, {status:404});
  const { googleCallback } = await import('../../../../../hostinger/google-auth');
  return googleCallback(request);
}
