import { z } from 'zod';
import { commerceEnabled } from '../../../../../lib/commerce-enabled';
import { CommerceError, readCommerceJson } from '../../../../../lib/commerce-http';
import { equalOrderBotSecret, orderBotActions, orderBotActionSettings, readOrderBotCallbackData } from '../../../../../hostinger/order-bot-actions';

export const dynamic = 'force-dynamic';

const id = z.number().int().positive().max(2 ** 52 - 1);
const updateSchema = z.object({ callback_query: z.object({
  id: z.string().min(1).max(128),
  data: z.string().max(64),
  from: z.object({ id, is_bot: z.literal(false) }),
  message: z.object({
    chat: z.object({ id, type: z.literal('private') }),
    from: z.object({ id, is_bot: z.literal(true) }),
    date: id,
    message_id: id,
    message_thread_id: id,
  }),
}) });
const statusUpdateSchema = z.object({ message: z.object({
  text: z.string().min(1).max(150),
  from: z.object({ id, is_bot: z.literal(false) }),
  chat: z.object({ id, type: z.literal('private') }),
  message_thread_id: id.optional(),
}) });

const successText = {
  'payment-approve': 'Payment approved.',
  'order-send': 'Delivery sent to the customer’s website account.',
};

function answer(callbackId: string, text: string, showAlert = false) {
  // Telegram accepts a Bot API method as the webhook response, without another token-bearing request.
  return Response.json({ method: 'answerCallbackQuery', callback_query_id: callbackId, text, show_alert: showAlert });
}

export async function POST(request: Request) {
  const config = commerceEnabled && orderBotActionSettings();
  if (!config) return new Response(null, { status: 404 });
  if (!equalOrderBotSecret(config.secret, request.headers.get('x-telegram-bot-api-secret-token'))) {
    return new Response(null, { status: 403 });
  }

  let body: unknown;
  try { body = await readCommerceJson(request, 16384); }
  catch (error) { return new Response(null, { status: error instanceof CommerceError ? error.status : 400 }); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    const incoming = statusUpdateSchema.safeParse(body);
    if (!incoming.success) return new Response(null, { status: 200 });
    const message = incoming.data.message;
    try {
      const { customerOrderTelegramReply } = await import('../../../../../hostinger/customer-order-telegram');
      const reply = await customerOrderTelegramReply({ senderId: String(message.from.id), chatId: String(message.chat.id),
        chatType: message.chat.type, text: message.text });
      return reply ? Response.json({ ...reply, ...(message.message_thread_id ? { message_thread_id: message.message_thread_id } : {}) })
        : new Response(null, { status: 200 });
    } catch { return new Response(null, { status: 503 }); }
  }
  const callback = parsed.data.callback_query;
  if (callback.from.id !== config.owner || callback.message.chat.id !== config.owner || callback.message.from.id !== config.bot) {
    return answer(callback.id, 'This action is available to the store owner in the private order bot.', true);
  }
  const signed = readOrderBotCallbackData(config.secret, callback.data);
  if (!signed || callback.message.message_thread_id !== config.topics[signed.kind]) {
    return answer(callback.id, 'This button is unavailable. Open the latest order alert.', true);
  }

  try {
    const { readOrderBotAlert } = await import('../../../../../hostinger/notifications');
    const alert = await readOrderBotAlert(signed.id, signed.kind);
    if (!alert) return answer(callback.id, 'This alert is out of date. Open the latest order alert or review in Admin.', true);
    const { readAdminOrderActionRevision, applyAdminOrderAction } = await import('../../../../../hostinger/orders');
    const revision = await readAdminOrderActionRevision(alert.entityId);
    const { action } = orderBotActions[signed.kind];
    const result = await applyAdminOrderAction(alert.entityId, {
      action, revision, requestId: signed.id,
      ...(alert.kind === 'payment-proof-submitted' ? { proofRequestId: alert.proofRequestId } : {}),
      ...(alert.kind === 'order-delivery-ready' ? { deliveryDraftId: alert.deliveryDraftId } : {}),
    });
    return answer(callback.id, result.applied ? successText[action] : 'This action was already recorded.');
  } catch (error) {
    if (error instanceof CommerceError && error.status < 500) {
      return answer(callback.id, 'The order has changed or is not ready for this action. Review the current order in Admin.', true);
    }
    // Telegram retries transient errors, and the mutation uses the signed alert ID as its replay key.
    return new Response(null, { status: 503 });
  }
}
