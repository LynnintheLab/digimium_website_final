import { commerceEnabled } from '../../../../../lib/commerce-enabled';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!commerceEnabled) return new Response(null, {status:404});
  const { googlePending } = await import('../../../../../hostinger/google-auth');
  return googlePending(request);
}

export async function DELETE(request: Request) {
  if (!commerceEnabled) return new Response(null, {status:404});
  const {googleCancel} = await import('../../../../../hostinger/google-auth');
  return googleCancel(request);
}
