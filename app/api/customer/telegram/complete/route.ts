import { commerceEnabled } from '../../../../../lib/commerce-enabled';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  const { telegramComplete } = await import('../../../../../hostinger/telegram-auth');
  return telegramComplete(request);
}
