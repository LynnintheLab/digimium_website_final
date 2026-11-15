import { commerceEnabled } from '../../../../../lib/commerce-enabled';
import { commerceErrorResponse, commerceJson } from '../../../../../lib/commerce-http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!commerceEnabled) return commerceJson({ error: 'Notifications are unavailable.' }, 404);
  try {
    const { notificationCronAllowed, runScheduledNotifications } = await import('../../../../../hostinger/notifications');
    if (!notificationCronAllowed(request)) return commerceJson({ error: 'Unauthorized notification job.' }, 401);
    if (new URL(request.url).search || request.headers.has('cookie') || request.headers.has('origin')) {
      return commerceJson({ error: 'Use the private scheduler request.' }, 400);
    }
    // Some adapters expose a stream even for Content-Length: 0. Reject bytes, not that wrapper.
    if (request.body) {
      const reader = request.body.getReader();
      try {
        const first = await reader.read();
        if (!first.done) { await reader.cancel(); return commerceJson({ error: 'Use the private scheduler request.' }, 400); }
      } finally { reader.releaseLock(); }
    }
    const { ensureCustomerSchema } = await import('../../../../../hostinger/customer-auth');
    await ensureCustomerSchema();
    return commerceJson(await runScheduledNotifications());
  } catch (error) { return commerceErrorResponse(error); }
}
