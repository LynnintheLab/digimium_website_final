import { commerceEnabled } from '../../../../lib/commerce-enabled';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!commerceEnabled) return new Response(null, { status: 404 });
  const { customerEmailStep } = await import('../../../../hostinger/customer-email-step');
  return customerEmailStep(request);
}
