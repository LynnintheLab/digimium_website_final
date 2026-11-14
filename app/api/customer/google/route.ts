import { commerceEnabled } from '../../../../lib/commerce-enabled';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!commerceEnabled) return new Response(null, {status:404});
  const { googleCapabilities } = await import('../../../../hostinger/google-auth');
  return googleCapabilities();
}
