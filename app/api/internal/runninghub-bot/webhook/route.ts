import { z } from 'zod';
import { commerceEnabled } from '@/lib/commerce-enabled';
import { CommerceError, readCommerceJson } from '@/lib/commerce-http';
import { normalizeRunningHubReference } from '@/lib/runninghub';
import { equalRunningHubBotSecret, promptRunningHubApproval, readRunningHubApproval, readRunningHubApprovalPrompt,
  runningHubAdminBotConfig, runningHubApprovalRequestId, type RunningHubAdminBotConfig } from '@/hostinger/runninghub-admin-bot';

export const dynamic = 'force-dynamic';
const id = z.number().int().positive().max(2 ** 52 - 1);
const privateChat = z.object({ id, type: z.literal('private') });
const botSender = z.object({ id, is_bot: z.literal(true) });
const ownerSender = z.object({ id, is_bot: z.literal(false) });
const callbackSchema = z.object({ callback_query: z.object({
  id: z.string().min(1).max(128), data: z.string().max(64), from: ownerSender,
  message: z.object({ chat: privateChat, from: botSender, date: id, message_id: id, message_thread_id: id.optional() }),
}) });
const replySchema = z.object({ message: z.object({
  message_id: id, text: z.string().max(100), from: ownerSender, chat: privateChat, message_thread_id: id.optional(),
  reply_to_message: z.object({ message_id: id, text: z.string().max(1000), chat: privateChat, from: botSender }),
}) });
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
function empty(status = 200) { return new Response(null, { status, headers }); }
function answer(callbackId: string, text: string, alert = false) {
  return Response.json({ method: 'answerCallbackQuery', callback_query_id: callbackId, text, show_alert: alert }, { headers });
}
function say(config: RunningHubAdminBotConfig, text: string) {
  return Response.json({ method: 'sendMessage', chat_id: Number(config.ownerId), text, protect_content: true,
    link_preview_options: { is_disabled: true }, ...(config.topicId ? { message_thread_id: config.topicId } : {}) }, { headers });
}
function topicAllowed(config: RunningHubAdminBotConfig, topic: number | undefined) {
  return config.topicId === undefined || config.topicId === topic;
}

export async function POST(request: Request) {
  const config = commerceEnabled && runningHubAdminBotConfig();
  if (!config) return empty(404);
  if (!equalRunningHubBotSecret(config.secret, request.headers.get('x-telegram-bot-api-secret-token'))) return empty(403);
  let body: unknown;
  try { body = await readCommerceJson(request, 16384); }
  catch (error) { return empty(error instanceof CommerceError ? error.status : 400); }

  const callback = callbackSchema.safeParse(body);
  if (callback.success) {
    const value = callback.data.callback_query;
    if (String(value.from.id) !== config.ownerId || String(value.message.chat.id) !== config.ownerId ||
      String(value.message.from.id) !== config.botId || !topicAllowed(config, value.message.message_thread_id)) {
      return answer(value.id, 'This action is only available to the owner in the dedicated payment chat.', true);
    }
    const binding = readRunningHubApproval(config.secret, value.data);
    if (!binding) return answer(value.id, 'This approval button is unavailable. Open the latest receipt.', true);
    try {
      const { runningHubOrder } = await import('@/hostinger/runninghub');
      const { order } = await runningHubOrder(binding.id);
      if (order.status !== 'payment_review' || order.proofRequestId !== binding.proofRequestId || order.revision !== binding.revision) {
        return answer(value.id, 'This order changed or was already reviewed. Open the latest receipt.', true);
      }
      if (!await promptRunningHubApproval(config, value.data, binding.id)) return empty(503);
      return answer(value.id, 'Reply to the payment-check message with the checked wallet reference.');
    } catch (error) {
      return error instanceof CommerceError && error.status < 500
        ? answer(value.id, 'This order is unavailable. Review it in Admin.', true) : empty(503);
    }
  }

  const reply = replySchema.safeParse(body);
  if (!reply.success) return empty();
  const message = reply.data.message, prompt = message.reply_to_message;
  if (String(message.from.id) !== config.ownerId || String(message.chat.id) !== config.ownerId ||
    String(prompt.chat.id) !== config.ownerId || String(prompt.from.id) !== config.botId ||
    !topicAllowed(config, message.message_thread_id)) return empty();
  const binding = readRunningHubApprovalPrompt(config.secret, prompt.text);
  if (!binding) return empty();
  const reference = normalizeRunningHubReference(message.text);
  if (!reference) return say(config, 'Use the checked wallet transaction reference: 6–80 letters or digits. Reply to the payment-check message again.');
  try {
    const { decideRunningHubOrder } = await import('@/hostinger/runninghub');
    const result = await decideRunningHubOrder(binding.order.id, {
      action: 'approve', revision: binding.order.revision, proofRequestId: binding.order.proofRequestId,
      requestId: runningHubApprovalRequestId(config.secret, binding.code), paymentReference: reference,
    }, 'telegram:' + config.ownerId);
    return say(config, result.applied ? 'Payment approved. The key is available in the customer’s website purchase details.' : 'This approval was already recorded.');
  } catch (error) {
    if (error instanceof CommerceError && error.status < 500) {
      return say(config, 'The order or payment reference could not be approved. Review the current order and wallet payment in Admin.');
    }
    return empty(503);
  }
}
