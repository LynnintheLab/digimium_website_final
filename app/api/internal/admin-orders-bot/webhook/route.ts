import { z } from 'zod';
import { commerceEnabled } from '@/lib/commerce-enabled';
import { CommerceError, readCommerceJson } from '@/lib/commerce-http';
import { AdminOrdersActionError, adminOrdersBotConfig, equalAdminOrdersBotSecret, type AdminOrdersBotAdapter, type AdminOrdersBotConfig } from '@/hostinger/admin-orders-telegram';
import { runningHubAdminOrdersAdapter } from '@/hostinger/runninghub-admin-bot';

export const dynamic = 'force-dynamic';
// Add future checkout adapters here. Each must verify its own MAC namespace before dispatch.
const adapters: readonly AdminOrdersBotAdapter[] = [runningHubAdminOrdersAdapter];
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
function say(config: AdminOrdersBotConfig, text: string, sourceTopic?: number) {
  const topic = sourceTopic && sourceTopic > 1 ? sourceTopic : config.runningHubTopicId ?? config.topicId;
  return Response.json({ method: 'sendMessage', chat_id: Number(config.ownerId), text, protect_content: true,
    link_preview_options: { is_disabled: true }, ...(topic ? { message_thread_id: topic } : {}) }, { headers });
}
function topicAllowed(config: AdminOrdersBotConfig, topic: number | undefined) {
  if (config.runningHubTopicId !== undefined && topic === config.runningHubTopicId) return true;
  // Previously issued signed approval messages remain valid in their original private topic.
  return config.topicId !== undefined ? topic === config.topicId : topic === undefined || topic === 1;
}

export async function POST(request: Request) {
  const config = commerceEnabled && adminOrdersBotConfig();
  if (!config) return empty(404);
  if (!equalAdminOrdersBotSecret(config.secret, request.headers.get('x-telegram-bot-api-secret-token'))) return empty(403);
  let body: unknown;
  try { body = await readCommerceJson(request, 16384); }
  catch (error) { return empty(error instanceof CommerceError ? error.status : 400); }

  const callback = callbackSchema.safeParse(body);
  if (callback.success) {
    const value = callback.data.callback_query;
    if (String(value.from.id) !== config.ownerId || String(value.message.chat.id) !== config.ownerId ||
      String(value.message.from.id) !== config.botId || !topicAllowed(config, value.message.message_thread_id)) {
      return answer(value.id, 'This action is only available to the owner in the Admin Orders payment chat.', true);
    }
    const matching = adapters.filter(adapter => adapter.matchesCallback(config.secret, value.data));
    if (matching.length !== 1) return answer(value.id, 'This approval button is unavailable. Open the latest receipt.', true);
    try {
      return answer(value.id, await matching[0].beginApproval(config, value.data));
    } catch (error) {
      if (error instanceof AdminOrdersActionError) return answer(value.id, error.message, true);
      return error instanceof CommerceError && error.status < 500
        ? answer(value.id, 'This order changed, was already reviewed, or is unavailable. Review it in Admin.', true) : empty(503);
    }
  }

  const reply = replySchema.safeParse(body);
  if (!reply.success) return empty();
  const message = reply.data.message, prompt = message.reply_to_message;
  if (String(message.from.id) !== config.ownerId || String(message.chat.id) !== config.ownerId ||
    String(prompt.chat.id) !== config.ownerId || String(prompt.from.id) !== config.botId ||
    !topicAllowed(config, message.message_thread_id)) return empty();
  const matching = adapters.filter(adapter => adapter.matchesReply(config.secret, prompt.text));
  if (matching.length !== 1) return empty();
  try {
    return say(config, await matching[0].completeApproval(config, prompt.text, message.text), message.message_thread_id);
  } catch (error) {
    if (error instanceof CommerceError && error.status < 500) {
      return say(config, 'The order or payment reference could not be approved. Review the current order and wallet payment in Admin.', message.message_thread_id);
    }
    return empty(503);
  }
}
