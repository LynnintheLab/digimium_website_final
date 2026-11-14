import { commerceEnabled } from '../../../../../lib/commerce-enabled';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  const { telegramWebhook } = await import('../../../../../hostinger/telegram-auth');
  return telegramWebhook(request);
}
