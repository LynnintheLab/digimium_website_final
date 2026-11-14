// Only imported by the explicitly disposable local integration server.
import assert from 'node:assert/strict';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
const originalFetch = globalThis.fetch;
let messageId = 1000;
globalThis.fetch = async function(input, options) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const prefix = 'https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/';
  if (!url.startsWith(prefix)) return originalFetch(input, options);
  const method = url.slice(prefix.length);
  assert.ok(['sendMessage','answerCallbackQuery','editMessageText'].includes(method));
  assert.equal(options?.method, 'POST'); assert.equal(options?.redirect, 'error');
  const fields = JSON.parse(options.body);
  let control = {}; try { control = JSON.parse(await readFile(process.env.TELEGRAM_FIXTURE_CONTROL,'utf8')); } catch {}
  await appendFile(process.env.TELEGRAM_FIXTURE_LOG, JSON.stringify({method,fields})+'\n', {mode:0o600});
  if (method === 'sendMessage') {
    const nextMessageId = ++messageId;
    if (control.delaySendMs) await new Promise(resolve => setTimeout(resolve,control.delaySendMs));
    if (control.failSends > 0) { await writeFile(process.env.TELEGRAM_FIXTURE_CONTROL,JSON.stringify({...control,failSends:control.failSends-1})); return Response.json({ok:false},{status:500}); }
    const result = { message_id: nextMessageId, date:Math.floor(Date.now()/1000), chat:{id:Number(fields.chat_id),type:'private'},from:{id:Number(process.env.TELEGRAM_BOT_TOKEN.split(':')[0]),is_bot:true,first_name:'Digimium test bot'},text:fields.text,...(control.badMessage || {}) };
    return Response.json({ok:true,result});
  }
  return Response.json({ok:true,result:true});
};
