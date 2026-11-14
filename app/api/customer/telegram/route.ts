import { commerceEnabled } from '../../../../lib/commerce-enabled';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  const { telegramCapabilities } = await import('../../../../hostinger/telegram-auth');
  return telegramCapabilities();
}
