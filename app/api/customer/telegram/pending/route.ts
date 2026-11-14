import { commerceEnabled } from '../../../../../lib/commerce-enabled';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  const { telegramPending } = await import('../../../../../hostinger/telegram-auth');
  return telegramPending(request);
}
export async function DELETE(request: Request) {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  const { telegramCancel } = await import('../../../../../hostinger/telegram-auth');
  return telegramCancel(request);
}
