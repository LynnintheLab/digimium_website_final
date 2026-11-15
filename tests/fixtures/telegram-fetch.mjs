// Only imported by the explicitly disposable local integration server.
import assert from 'node:assert/strict';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const originalFetch = globalThis.fetch;
let messageId = 1000;
globalThis.fetch = async function(input, options) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const prefix = 'https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/';
  if (!url.startsWith(prefix)) return originalFetch(input, options);
  const method = url.slice(prefix.length);
  assert.ok(['sendMessage','sendPhoto','answerCallbackQuery','editMessageText','editMessageCaption'].includes(method));
  assert.equal(options?.method, 'POST'); assert.equal(options?.redirect, 'error');
  let fields;
  if (method === 'sendPhoto') {
    assert.ok(options.body instanceof FormData);
    const photo = options.body.get('photo');
    assert.ok(photo instanceof Blob); assert.equal(photo.type, 'image/jpeg');
    assert.ok(photo.size > 100 && photo.size <= 2 * 1024 * 1024);
    const bytes = new Uint8Array(await photo.arrayBuffer());
    assert.equal(bytes[0], 0xff); assert.equal(bytes[1], 0xd8);
    fields = { chat_id: options.body.get('chat_id'), caption: options.body.get('caption'),
      protect_content: options.body.get('protect_content') === 'true',
      photo: { name: photo.name, type: photo.type, size: photo.size },
      ...(options.body.has('caption_entities') ? { caption_entities: JSON.parse(options.body.get('caption_entities')) } : {}),
      ...(options.body.has('reply_markup') ? { reply_markup: JSON.parse(options.body.get('reply_markup')) } : {}) };
  } else fields = JSON.parse(options.body);
  if (method === 'sendPhoto' || method === 'editMessageCaption') {
    assert.equal(typeof fields.caption, 'string'); assert.ok(fields.caption.length <= 1024);
    assert.equal(fields.link_preview_options, undefined);
    assert.equal(fields.parse_mode, undefined);
    for (const entity of fields.caption_entities || []) assert.ok(entity.offset >= 0 && entity.length > 0 && entity.offset + entity.length <= fields.caption.length);
  }
  let control = {}; try { control = JSON.parse(await readFile(process.env.TELEGRAM_FIXTURE_CONTROL,'utf8')); } catch {}
  const isSend = method === 'sendMessage' || method === 'sendPhoto';
  const nextMessageId = isSend ? ++messageId : undefined;
  await appendFile(process.env.TELEGRAM_FIXTURE_LOG, JSON.stringify({method,fields,...(isSend ? {messageId:nextMessageId} : {})})+'\n', {mode:0o600});
  if (isSend) {
    const photo = method === 'sendPhoto', wait = photo ? control.delayPhotoMs : control.delaySendMs;
    if (wait) await delay(wait, undefined, { signal: options.signal });
    const failureKey = photo ? 'failPhotos' : 'failSends';
    if (control[failureKey] > 0) { await writeFile(process.env.TELEGRAM_FIXTURE_CONTROL,JSON.stringify({...control,[failureKey]:control[failureKey]-1})); return Response.json({ok:false},{status:500}); }
    const result = { message_id: nextMessageId, date:Math.floor(Date.now()/1000), chat:{id:Number(fields.chat_id),type:'private'},from:{id:Number(process.env.TELEGRAM_BOT_TOKEN.split(':')[0]),is_bot:true,first_name:'Digimium test bot'},...(photo ? {caption:fields.caption, photo:[{file_id:'fixture-photo',width:1200,height:600}]} : {text:fields.text}),...(control.badMessage || {}) };
    return Response.json({ok:true,result});
  }
  return Response.json({ok:true,result:true});
};
