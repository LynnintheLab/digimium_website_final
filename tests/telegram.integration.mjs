// Refuses any nonempty database or non-loopback target; no real Telegram calls are made.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const scratch = await mkdtemp(join(tmpdir(),'digimium-telegram-protocol-'));
const env = {...process.env, ADMIN_AUTH_SECRET:randomBytes(32).toString('hex'), TELEGRAM_BOT_TOKEN:'123456789:'+randomBytes(32).toString('base64url'), TELEGRAM_BOT_USERNAME:'digimium_fixture_bot',TELEGRAM_WEBHOOK_SECRET:randomBytes(32).toString('base64url'), TELEGRAM_FIXTURE_LOG:join(scratch,'bot.jsonl'),TELEGRAM_FIXTURE_CONTROL:join(scratch,'control.json')};
const base = new URL(env.APP_ORIGIN);
assert.ok(base.origin===env.APP_ORIGIN&&base.protocol==='http:'&&base.hostname==='127.0.0.1'&&base.port&&env.DB_HOST==='127.0.0.1'&&/^digimium_test_[a-z0-9_]+$/.test(env.DB_NAME)&&env.DB_USER&&env.DB_PASSWORD,'Use an empty loopback digimium_test_* database and loopback origin.');
const root=new URL('../',import.meta.url);
const db=await mysql.createConnection({host:env.DB_HOST,port:Number(env.DB_PORT||3306),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,multipleStatements:true});
let server; let updateId=0;
const hash=value=>createHash('sha256').update(value).digest();
const request=(path,options={})=>fetch(new URL(path,base),{...options,redirect:'manual',signal:AbortSignal.timeout(20000)});
const mutate=(path,body,cookie='',origin=base.origin,method='POST',headers={})=>request(path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json',...headers},body:method==='DELETE'?undefined:JSON.stringify(body)});
const get=(path,cookie='')=>request(path,{headers:{Cookie:cookie}});
async function json(response,status=200){assert.equal(response.status,status);assert.match(response.headers.get('cache-control')||'',/no-store/);return response.json();}
function cookie(response,name,required=true){const value=response.headers.getSetCookie().find(value=>value.startsWith(name+'=')&&!/Max-Age=0(?:;|$)/.test(value));if(!value){assert.ok(!required,'Missing '+name);return '';}assert.match(value,/HttpOnly/i);assert.match(value,/SameSite=Lax/i);return value.split(';')[0];}
const human=(id=7845123,extra={})=>({id,is_bot:false,first_name:'Telegram',last_name:'Customer',username:'telegram_fixture',...extra});
const bot={id:123456789,is_bot:true,first_name:'Digimium test bot'};
async function webhook(body,secret=env.TELEGRAM_WEBHOOK_SECRET){return request('/api/customer/telegram/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':secret},body:JSON.stringify({update_id:++updateId,...body})});}
async function calls(){try{return (await readFile(env.TELEGRAM_FIXTURE_LOG,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch{return [];}}
async function begin(returnTo='account',session='',headers={}){const response=await mutate('/api/customer/telegram/start',{returnTo},session,base.origin,'POST',headers);const flow=await json(response);assert.match(flow.flow,/^[A-Za-z0-9_-]{43}$/);assert.match(flow.code,/^\d{4}$/);assert.equal(new URL(flow.url).origin,'https://t.me');assert.equal(new URL(flow.url).searchParams.get('start'),'login_'+flow.flow);assert.equal(flow.returnTo,returnTo);assert.ok(Date.parse(flow.expiresAt)>Date.now()+290000&&Date.parse(flow.expiresAt)<=Date.now()+301000);return {...flow,cookie:cookie(response,'digimium_local_telegram'),response};}
async function launch(flow,user=human(),extra={}) {
 const before=(await calls()).length;
 await json(await webhook({message:{message_id:100+updateId,date:Math.floor(Date.now()/1000),from:user,chat:{id:user.id,type:'private'},text:'/start login_'+flow.flow,...extra}}));
 const added=(await calls()).slice(before),call=added.filter(call=>['sendMessage','sendPhoto'].includes(call.method)&&call.fields.reply_markup?.inline_keyboard?.flat().some(button=>button.callback_data?.startsWith('tg1.'))).at(-1);
 if(!call)return null;
 const buttons=call.fields.reply_markup.inline_keyboard.flat();
 assert.equal(buttons.length,5);assert.equal(new Set(buttons.slice(0,4).map(item=>item.text)).size,4);
 assert.ok(buttons.slice(0,4).some(item=>item.text===flow.code));assert.ok(buttons.every(item=>Buffer.byteLength(item.callback_data)<=64));assert.ok(buttons.every(item=>!item.callback_data.includes(flow.flow)));
 const [rows]=await db.execute('SELECT stage,payload FROM digimium_telegram_auth_challenges WHERE id_hash=?',[hash(flow.flow)]);
 if(!rows[0])return null;assert.equal(rows[0].stage,'sent');
 return {user,buttons,messageId:call.messageId,fields:call.fields,text:call.fields.caption??call.fields.text,photo:call.method==='sendPhoto'};
}
async function choose(launchInfo,index,extra={}){return webhook({callback_query:{id:String(++updateId),from:launchInfo.user,data:launchInfo.buttons[index].callback_data,message:{message_id:launchInfo.messageId,date:Math.floor(Date.now()/1000),chat:{id:launchInfo.user.id,type:'private'},from:bot,...(launchInfo.photo?{photo:[{file_id:'fixture-photo',width:1200,height:600}]}:{})},...extra}});}
async function approve(flow,user=human()){const info=await launch(flow,user);assert.ok(info);await json(await choose(info,info.buttons.findIndex(item=>item.text===flow.code)));assert.equal((await json(await get('/api/customer/telegram/pending?flow='+flow.flow,flow.cookie))).status,'approved');return info;}
async function finish(flow,session=''){const response=await mutate('/api/customer/telegram/complete',{flow:flow.flow},[flow.cookie,session].filter(Boolean).join('; '));return {response,data:await json(response)};}
async function stage(flow){const [rows]=await db.execute('SELECT stage FROM digimium_telegram_auth_challenges WHERE id_hash=?',[hash(flow.flow)]);return rows[0]?.stage;}

async function updatePayload(flow,change) {
 const idHash=hash(flow.flow),aad='challenge:'+idHash.toString('base64url');
 const [[row]]=await db.execute('SELECT payload FROM digimium_telegram_auth_challenges WHERE id_hash=?',[idHash]);
 const key=createHmac('sha256',env.ADMIN_AUTH_SECRET).update('digimium/telegram-auth/v1\n'+base.origin).digest();
 const bytes=Buffer.from(row.payload,'base64url'),decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
 decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(bytes.subarray(12,28));
 const value=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));
 change(value);
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 await db.execute('UPDATE digimium_telegram_auth_challenges SET payload=? WHERE id_hash=?',[Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url'),idHash]);
}

async function command(text,user=human(),extra={}) {
 const before=(await calls()).length;
 await json(await webhook({message:{message_id:5000+updateId,date:Math.floor(Date.now()/1000),from:user,chat:{id:user.id,type:'private'},text,...extra}}));
 const added=(await calls()).slice(before),send=added.find(call=>call.method==='sendMessage');
 if(!send)return null;
 assert.equal(send.fields.chat_id,String(user.id));assert.equal(send.fields.protect_content,true);
 const messageId=send.messageId;
 const final=added.filter(call=>call.method==='editMessageText').at(-1)?.fields||send.fields;
 assert.ok(final.text.length<=4096);assert.equal(final.parse_mode,undefined);
 const buttons=final.reply_markup?.inline_keyboard.flat()||[];
 assert.ok(buttons.filter(button=>button.callback_data).every(button=>Buffer.byteLength(button.callback_data)<=64));
 return {user,messageId,fields:final,buttons};
}
async function navigate(panel,button,extra={}) {
 const before=(await calls()).length;
 await json(await webhook({callback_query:{id:String(++updateId),from:panel.user,data:button.callback_data,message:{message_id:panel.messageId,date:Math.floor(Date.now()/1000),chat:{id:panel.user.id,type:'private'},from:bot,...(panel.photo?{photo:[{file_id:'fixture-photo',width:1200,height:600}]}:{})},...extra}}));
 const added=(await calls()).slice(before),edit=added.filter(call=>call.method==='editMessageText').at(-1);
 if(!edit)return {added,panel:null};
 assert.equal(edit.fields.chat_id,String(panel.user.id));assert.ok(edit.fields.text.length<=4096);assert.equal(edit.fields.parse_mode,undefined);
 return {added,panel:{...panel,messageId:edit.fields.message_id,photo:false,fields:edit.fields,buttons:edit.fields.reply_markup?.inline_keyboard.flat()||[]}};
}
function approvedDelivery(id,owner,lines) {
 const key=createHmac('sha256',env.ORDER_FULFILLMENT_SECRET?.trim()||env.ADMIN_AUTH_SECRET).update('digimium/order-fulfillment/v1').digest();
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(id+'/'+owner));
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(lines),'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');
}
async function fixtureOrder(customerId,productName,{approved=true,createdAt=new Date().toISOString(),startDate=null,endDate=null,guest=false,lineCount=1,orderId=randomUUID(),planName='Purchased plan'}={}) {
 const id=orderId,guestKey=guest?randomBytes(32):null;
 const lines=Array.from({length:lineCount},(_,index)=>({id:randomUUID(),productId:'chatgpt',planId:null,productName:productName+(lineCount>1?'-'+(index+1):''),planName,duration:'1 month',price:'12,000 MMK',quantity:1}));
 const snapshot={lines,totalMmk:12000*lineCount};
 const owner=customerId??'guest:'+guestKey.toString('hex');
 const fulfillment=approved?approvedDelivery(id,owner,lines.map(line=>({id:line.id,startDate,endDate,accountInfo:'PRIVATE-DELIVERY-PASSWORD-SENTINEL'}))):null;
 await db.execute('INSERT INTO digimium_orders (id,customer_id,guest_key,guest_name,request_id,request_hash,created_at,approved_at,snapshot,fulfillment) VALUES (?,?,?,?,?,?,?,?,?,?)',
  [id,customerId,guestKey,guest?'PRIVATE-GUEST-SENTINEL':null,randomUUID(),randomBytes(32),createdAt,approved?createdAt:null,JSON.stringify(snapshot),fulfillment]);
 return id;
}
function signedNavigation(userId,messageId,view,cursor='-',expires=Math.floor(Date.now()/1000)+86400) {
 const key=createHmac('sha256',env.ADMIN_AUTH_SECRET).update('digimium/telegram-navigation/v1\n'+base.origin).digest();
 const mac=createHmac('sha256',key).update(JSON.stringify([String(userId),String(userId),messageId,view,cursor,expires])).digest().subarray(0,12).toString('base64url');
 return {callback_data:`th1.${view}.${cursor}.${expires.toString(36)}.${mac}`};
}
try {
 const [tables]=await db.query('SHOW TABLES');assert.equal(tables.length,0,'Refusing a nonempty database.');
 const probe=createServer();await new Promise((resolve,reject)=>probe.once('error',reject).listen(Number(base.port),base.hostname,resolve));await new Promise(resolve=>probe.close(resolve));
 await db.query(await readFile(new URL('hostinger/schema.sql',root),'utf8'));
 // A real pre-Telegram schema must migrate without losing its local customer/session.
 let legacy=await readFile(new URL('hostinger/customer-auth-schema.sql',root),'utf8');legacy=legacy.replace('email VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NULL','email VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL').replace('password_hash VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NULL','password_hash VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NOT NULL');
 await db.query(legacy);
 server=spawn(process.execPath,['--import',new URL('tests/fixtures/telegram-fetch.mjs',root).href,fileURLToPath(new URL('.next/standalone/server.js',root))],{cwd:fileURLToPath(root),env:{...env,NODE_ENV:'production',HOSTNAME:base.hostname,PORT:base.port},stdio:['ignore','inherit','inherit']});
 for(let n=0;;n++){try{assert.equal((await get('/api/customer/telegram')).status,200);break;}catch(error){if(n>100||server.exitCode!==null)throw error;await delay(100);}}
 assert.deepEqual(await json(await get('/api/customer/telegram')),{enabled:true});assert.deepEqual(await json(await get('/api/customer/telegram/pending')),{status:'none'});
 assert.equal((await mutate('/api/customer/telegram/start',{returnTo:'account'},'','https://foreign.invalid')).status,403);
 for(const body of [{returnTo:'https://evil.invalid'},{returnTo:'account',identity:{id:1}},{flow:'1234'}])assert.equal((await mutate('/api/customer/telegram/start',body)).status,400);
 assert.equal((await webhook({message:{}},'bad-secret')).status,403);assert.equal((await webhook({message:{}},'é'.repeat(env.TELEGRAM_WEBHOOK_SECRET.length))).status,403);
 const localPassword=randomUUID(),localResponse=await mutate('/api/customer/session',{action:'register',email:'telegram-local@example.invalid',password:localPassword,name:'Local owner'});const local=await json(localResponse,201),localCookie=cookie(localResponse,'digimium_local_customer');
 const first=await begin('checkout','',{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1','X-Forwarded-For':'8.8.8.8','CF-IPCity':'FORGED-CITY-SENTINEL'});assert.equal((await json(await get('/api/customer/telegram/pending',first.cookie))).flow,first.flow);
 assert.equal((await mutate('/api/customer/telegram/complete',{flow:first.flow},first.cookie)).status,400,'Cannot finish before bot approval');
 assert.deepEqual(await json(await get('/api/customer/telegram/pending?flow='+first.flow)),{status:'none'},'Flow token alone is insufficient');
 const beforeFirst=(await calls()).length,firstLaunch=await approve(first);
 const firstPromptCalls=(await calls()).slice(beforeFirst),photo=firstPromptCalls.find(call=>call.method==='sendPhoto');
 assert.ok(photo,'Code selection is one photo with its caption and keyboard');assert.equal(photo.fields.protect_content,true);assert.equal(photo.fields.photo.type,'image/jpeg');
 assert.equal(photo.fields.photo.name,'digimium-login-verify.jpg');assert.equal(firstLaunch.photo,true);
 assert.equal(firstPromptCalls.filter(call=>call.method==='sendPhoto').length,1,'Deep-link login does not repeat the generic welcome picture');
 assert.ok(!firstPromptCalls.some(call=>call.method==='sendMessage'),'Photo prompt does not duplicate the same request as a separate text message');
 assert.ok(photo.fields.caption_entities.some(entity=>entity.type==='bold'&&entity.offset===0));
 assert.match(firstLaunch.text,/Safari · iPhone/);assert.match(firstLaunch.text,/နိုင်ငံ \(IP ခန့်မှန်း\) — United States/);assert.match(firstLaunch.text,/https:\/\/db-ip\.com/);assert.ok(!firstLaunch.text.includes('FORGED-CITY-SENTINEL'));
 assert.ok(firstPromptCalls.some(call=>call.method==='editMessageCaption'&&call.fields.message_id===firstLaunch.messageId&&call.fields.caption.includes('Code အတည်ပြုပြီး')),'Photo approval edits the caption of the bound prompt');
 assert.ok(!firstPromptCalls.some(call=>(call.fields.caption??call.fields.text??'').includes('Website အကောင့်ဝင်ပြီးပါပြီ')),'Code approval must not claim a website session exists');
 const completed=await finish(first);
 const completedCalls=(await calls()).filter(call=>['sendMessage','sendPhoto'].includes(call.method)&&(call.fields.caption??call.fields.text??'').includes('Website အကောင့်ဝင်ပြီးပါပြီ'));
 assert.equal(completedCalls.length,1,'Only successful browser completion sends the success notification');assert.equal(completedCalls[0].method,'sendPhoto');
 assert.equal(completedCalls[0].fields.photo.name,'digimium-login-success.jpg');assert.equal(completedCalls[0].fields.chat_id,String(human().id));
 const completedEdit=(await calls()).find(call=>call.method==='editMessageCaption'&&call.fields.message_id===completedCalls[0].messageId);
 assert.ok(completedEdit.fields.reply_markup.inline_keyboard.flat().some(button=>button.text.includes('Plan')),'Completion menu is bound to its own new photo');
 assert.equal(completed.data.customer.email,null);assert.equal(completed.data.customer.passwordAvailable,false);assert.equal(completed.data.customer.telegram.id,String(human().id));assert.equal(completed.data.customer.telegram.username,'telegram_fixture');
 const sessionCookie=cookie(completed.response,'digimium_local_customer'),resultCookie=cookie(completed.response,'digimium_local_telegram_result');
 assert.equal((await json(await get('/api/customer/session',sessionCookie))).customer.id,completed.data.customer.id);
 assert.equal((await json(await get('/api/customer/session',localCookie))).customer.id,local.customer.id,'Old password account/session survives migration');
 const [[emailColumn]]=await db.query("SHOW COLUMNS FROM digimium_customers LIKE 'email'");assert.equal(emailColumn.Null,'YES');
 const [[passwordColumn]]=await db.query("SHOW COLUMNS FROM digimium_customers LIKE 'password_hash'");assert.equal(passwordColumn.Null,'YES');
 assert.equal((await json(await get('/api/customer/telegram/pending?flow='+first.flow,first.cookie+'; '+sessionCookie+'; '+resultCookie))).status,'success');
 assert.deepEqual(await json(await get('/api/customer/telegram/pending?flow='+randomBytes(32).toString('base64url'),sessionCookie+'; '+resultCookie)),{status:'none'});
 assert.deepEqual(await json(await get('/api/customer/telegram/pending?flow='+first.flow,resultCookie)),{status:'none'},'Receipt cannot create a missing session');
 assert.equal((await mutate('/api/customer/telegram/complete',{flow:first.flow},first.cookie)).status,400,'Single-use flow denies replay without session receipt');
 assert.equal((await json(await mutate('/api/customer/telegram/complete',{flow:first.flow},first.cookie+'; '+sessionCookie+'; '+resultCookie))).customer.id,completed.data.customer.id,'Acknowledgement retry requires receipt and same active customer');
 assert.equal((await calls()).filter(call=>['sendMessage','sendPhoto'].includes(call.method)&&(call.fields.caption??call.fields.text??'').includes('Website အကောင့်ဝင်ပြီးပါပြီ')).length,1,'Acknowledgement retry does not duplicate the completion notice');
 await json(await choose(firstLaunch,firstLaunch.buttons.findIndex(item=>item.text===first.code)));assert.equal(await stage(first),undefined,'Late callback does not resurrect consumed flow');
 const repeat=await begin();await approve(repeat,human(undefined,{first_name:'Changed',username:'renamed_fixture'}));const repeated=await finish(repeat);assert.equal(repeated.data.customer.id,completed.data.customer.id);assert.equal(repeated.data.customer.name,'Telegram Customer');assert.equal(repeated.data.customer.telegram.username,'renamed_fixture');
 const another=await begin();await approve(another,human(7845124,{username:'renamed_fixture'}));const separate=await finish(another);assert.notEqual(separate.data.customer.id,completed.data.customer.id,'Matching mutable names/usernames never merge accounts');
 const rejected=await begin(),rejectedLaunch=await launch(rejected);await json(await choose(rejectedLaunch,4));assert.equal((await json(await get('/api/customer/telegram/pending?flow='+rejected.flow,rejected.cookie))).status,'rejected');assert.equal((await mutate('/api/customer/telegram/complete',{flow:rejected.flow},rejected.cookie)).status,400);
 const wrong=await begin(),wrongLaunch=await launch(wrong);await json(await choose(wrongLaunch,wrongLaunch.buttons.findIndex(item=>/^\d/.test(item.text)&&item.text!==wrong.code)));await json(await choose(wrongLaunch,wrongLaunch.buttons.findIndex(item=>item.text===wrong.code)));assert.equal(await stage(wrong),'rejected','Wrong choice invalidates request permanently');
 const protectedFlow=await begin(),protectedLaunch=await launch(protectedFlow);
 await json(await choose(protectedLaunch,protectedLaunch.buttons.findIndex(item=>item.text===protectedFlow.code),{from:human(9999999)}));assert.equal(await stage(protectedFlow),'sent','Wrong Telegram sender cannot approve');
 await json(await choose(protectedLaunch,0,{message:{message_id:99999,date:Math.floor(Date.now()/1000),chat:{id:human().id,type:'private'},from:bot}}));assert.equal(await stage(protectedFlow),'sent','Wrong message cannot approve');
 await json(await choose(protectedLaunch,0,{message:{message_id:protectedLaunch.messageId,date:Math.floor(Date.now()/1000),chat:{id:human().id,type:'group'},from:bot}}));assert.equal(await stage(protectedFlow),'sent','Group callback cannot approve');
 await json(await choose(protectedLaunch,0,{message:{message_id:protectedLaunch.messageId,date:Math.floor(Date.now()/1000),chat:{id:human().id,type:'private'},from:{...bot,id:111111}}}));assert.equal(await stage(protectedFlow),'sent','Another bot message cannot approve');
 const unseen=await begin();assert.equal(await launch(unseen,human(),{chat:{id:human().id,type:'group'}}),null);assert.equal(await stage(unseen),'waiting');
 const expired=await begin();await db.execute('UPDATE digimium_telegram_auth_challenges SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id_hash=?',[hash(expired.flow)]);assert.equal((await json(await get('/api/customer/telegram/pending?flow='+expired.flow,expired.cookie))).status,'expired');assert.equal(await launch(expired),null);
 const cancel=await begin(),cancelLaunch=await launch(cancel);assert.equal((await mutate('/api/customer/telegram/pending?flow='+cancel.flow,{},cancel.cookie,'https://foreign.invalid','DELETE')).status,403);await json(await mutate('/api/customer/telegram/pending?flow='+cancel.flow,{},cancel.cookie,base.origin,'DELETE'));await json(await choose(cancelLaunch,cancelLaunch.buttons.findIndex(item=>item.text===cancel.code)));assert.equal(await stage(cancel),undefined);assert.equal((await mutate('/api/customer/telegram/complete',{flow:cancel.flow},cancel.cookie)).status,400);
 const old=await begin(),oldLaunch=await launch(old),fresh=await begin('history',old.cookie);await json(await choose(oldLaunch,oldLaunch.buttons.findIndex(item=>item.text===old.code)));assert.equal(await stage(old),undefined);await json(await mutate('/api/customer/telegram/pending?flow='+old.flow,{},fresh.cookie,base.origin,'DELETE'));assert.equal(await stage(fresh),'waiting','Late A cancellation cannot cancel B');await approve(fresh);assert.equal((await finish(fresh)).data.customer.id,completed.data.customer.id);
 const double=await begin();await approve(double,human(7845125));const concurrent=await Promise.all([mutate('/api/customer/telegram/complete',{flow:double.flow},double.cookie),mutate('/api/customer/telegram/complete',{flow:double.flow},double.cookie)]);assert.deepEqual(concurrent.map(item=>item.status).sort(),[200,400]);const [[oneCustomer]]=await db.query('SELECT COUNT(*) AS count FROM digimium_telegram_identities WHERE telegram_id=?',['7845125']);assert.equal(oneCustomer.count,1);
 const slow=await begin(),beforeSlow=(await calls()).length;await writeFile(env.TELEGRAM_FIXTURE_CONTROL,JSON.stringify({delayPhotoMs:1000}));const inflight=launch(slow,human(7845126));for(let n=0;;n++){if(await stage(slow)==='sending')break;assert.ok(n<100);await delay(20);}await json(await mutate('/api/customer/telegram/pending?flow='+slow.flow,{},slow.cookie,base.origin,'DELETE'));await inflight;assert.equal(await stage(slow),undefined,'Cancel during send prevents later approval binding');
 const slowCalls=(await calls()).slice(beforeSlow),cancelledPhoto=slowCalls.find(call=>call.method==='sendPhoto'&&call.fields.photo.name==='digimium-login-verify.jpg');
 assert.ok(cancelledPhoto);assert.ok(slowCalls.some(call=>call.method==='editMessageCaption'&&call.fields.message_id===cancelledPhoto.messageId&&call.fields.reply_markup.inline_keyboard.length===0),'Cancelling during photo delivery clears the code keyboard by editing that photo caption');await writeFile(env.TELEGRAM_FIXTURE_CONTROL,'{}');
 const retryFlow=await begin(),beforeRetry=(await calls()).length;await writeFile(env.TELEGRAM_FIXTURE_CONTROL,JSON.stringify({failPhotos:1,failSends:1}));
 const failedSend=await webhook({message:{message_id:100+updateId,date:Math.floor(Date.now()/1000),from:human(),chat:{id:human().id,type:'private'},text:'/start login_'+retryFlow.flow}});
 assert.equal(failedSend.status,503);assert.equal(await stage(retryFlow),'waiting','Failed photo and text sends cannot leave an approveable keyboard');
 await writeFile(env.TELEGRAM_FIXTURE_CONTROL,'{}');await approve(retryFlow);assert.equal((await finish(retryFlow)).data.customer.id,completed.data.customer.id);
 assert.equal((await calls()).slice(beforeRetry).filter(call=>call.method==='sendPhoto'&&call.fields.photo.name==='digimium-login-verify.jpg').length,2,'A failed code-photo attempt can be retried, without a generic welcome picture');
 const missingPhoto=await begin();await writeFile(env.TELEGRAM_FIXTURE_CONTROL,JSON.stringify({failPhotos:1}));
 const legacyLaunch=await launch(missingPhoto,human(7845130));assert.equal(legacyLaunch.photo,false,'Code photo failure falls back to a complete text prompt');
 await updatePayload(missingPhoto,value=>{delete value.messageKind;});
 const beforeLegacy=(await calls()).length;await json(await choose(legacyLaunch,legacyLaunch.buttons.findIndex(button=>button.text===missingPhoto.code)));
 assert.ok((await calls()).slice(beforeLegacy).some(call=>call.method==='editMessageText'&&call.fields.message_id===legacyLaunch.messageId),'Pre-release prompts without messageKind remain text-editable');
 assert.equal((await finish(missingPhoto)).response.status,200,'Decorative image failure never blocks sign-in');await writeFile(env.TELEGRAM_FIXTURE_CONTROL,'{}');
 const missingNotice=await begin();await approve(missingNotice,human(7845131));await writeFile(env.TELEGRAM_FIXTURE_CONTROL,JSON.stringify({failPhotos:1,failSends:1}));
 const noticeFailure=await finish(missingNotice);assert.equal(noticeFailure.response.status,200,'Photo and text notification failure never rolls back an issued browser session');assert.ok(cookie(noticeFailure.response,'digimium_local_customer'));await writeFile(env.TELEGRAM_FIXTURE_CONTROL,'{}');
 const textSuccess=await begin();await approve(textSuccess,human(7845132));await writeFile(env.TELEGRAM_FIXTURE_CONTROL,JSON.stringify({failPhotos:1}));
 const beforeTextSuccess=(await calls()).length;assert.equal((await finish(textSuccess)).response.status,200);
 assert.ok((await calls()).slice(beforeTextSuccess).some(call=>call.method==='sendMessage'&&call.fields.text.includes('Website အကောင့်ဝင်ပြီးပါပြီ')),'Success-photo failure falls back to the truthful text success notice');await writeFile(env.TELEGRAM_FIXTURE_CONTROL,'{}');
 const slowSuccess=await begin();await approve(slowSuccess,human(7845133));await writeFile(env.TELEGRAM_FIXTURE_CONTROL,JSON.stringify({delayPhotoMs:1600}));
 const slowStarted=Date.now(),beforeSlowSuccess=(await calls()).length;assert.equal((await finish(slowSuccess)).response.status,200);assert.ok(Date.now()-slowStarted<2600,'The shared completion notification deadline is bounded');
 assert.ok((await calls()).slice(beforeSlowSuccess).some(call=>call.method==='sendMessage'&&call.fields.text.includes('Website အကောင့်ဝင်ပြီးပါပြီ')),'A slow success photo leaves time for text fallback');await writeFile(env.TELEGRAM_FIXTURE_CONTROL,'{}');
 const invalidAck=await begin();await writeFile(env.TELEGRAM_FIXTURE_CONTROL,JSON.stringify({badMessage:{chat:{id:111111,type:'private'}}}));
 assert.equal((await webhook({message:{message_id:100+updateId,date:Math.floor(Date.now()/1000),from:human(7845134),chat:{id:7845134,type:'private'},text:'/start login_'+invalidAck.flow}})).status,503);
 assert.equal(await stage(invalidAck),'waiting','Invalid photo/text acknowledgement cannot bind approval to a different chat');await writeFile(env.TELEGRAM_FIXTURE_CONTROL,'{}');
 const oversized=await begin();await updatePayload(oversized,value=>{value.context='Long device text 🙂 '.repeat(100);});const beforeOversized=(await calls()).length;
 const oversizedLaunch=await launch(oversized,human(7845135));assert.equal(oversizedLaunch.photo,false);assert.ok(oversizedLaunch.text.length>1024);
 assert.ok(!(await calls()).slice(beforeOversized).some(call=>call.method==='sendPhoto'),'Oversized photo caption selects text before any upload');
 await json(await choose(oversizedLaunch,oversizedLaunch.buttons.findIndex(button=>button.text===oversized.code)));assert.equal((await finish(oversized)).response.status,200);
 const guarded=await begin();await approve(guarded,human(7845127));const lock=await mysql.createConnection({host:env.DB_HOST,port:Number(env.DB_PORT||3306),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME});await lock.beginTransaction();await lock.execute('DELETE FROM digimium_telegram_auth_challenges WHERE id_hash=?',[hash(guarded.flow)]);const racingCompletion=mutate('/api/customer/telegram/complete',{flow:guarded.flow},guarded.cookie);await delay(150);await lock.commit();await lock.end();assert.equal((await racingCompletion).status,400,'A cancellation committing during completion prevents session creation');const [[noGuardedIdentity]]=await db.query('SELECT COUNT(*) AS count FROM digimium_telegram_identities WHERE telegram_id=?',['7845127']);assert.equal(noGuardedIdentity.count,0,'Cancelled completion creates no account');
 const browserBound=await begin();const boundPrompt=await launch(browserBound);assert.equal(await launch(browserBound,human(9999998)),null,'A second user cannot replace an already bound prompt');await json(await choose(boundPrompt,boundPrompt.buttons.findIndex(item=>item.text===browserBound.code)));assert.equal((await finish(browserBound)).data.customer.id,completed.data.customer.id);
 const forgedCookie={...fresh,cookie:fresh.cookie.slice(0,65)+'X'+fresh.cookie.slice(66)};assert.deepEqual(await json(await get('/api/customer/telegram/pending?flow='+fresh.flow,forgedCookie.cookie)),{status:'none'});
 const [stored]=await db.query('SELECT payload FROM digimium_telegram_auth_challenges');assert.ok(stored.every(row=>!row.payload.includes('telegram_fixture')&&!row.payload.includes('firstName')),'Telegram identity/prompt metadata is encrypted');
 // Private bot menu and history never accept a customer ID from Telegram payloads.
 const beforeGroup=(await calls()).length;
 assert.equal(await command('/history',human(),{chat:{id:-100123,type:'supergroup'}}),null);
 assert.equal(await command('/plans',human(),{chat:{id:99999999,type:'private'}}),null);
 assert.equal((await calls()).length,beforeGroup,'Group/mismatched-chat commands send no bot response');
 const beforeMenu=(await calls()).length,menu=await command('/start');assert.ok(menu);assert.equal((await calls()).slice(beforeMenu).filter(call=>call.method==='sendPhoto').length,1,'A private /start shows the welcome image before the existing menu');
 assert.ok(menu.buttons.some(button=>button.text.includes('အော်ဒါ')));assert.ok(menu.buttons.some(button=>button.text.includes('Plan')));
 const help=await command('/help@digimium_fixture_bot');assert.ok(help?.buttons.length);
 const noIdentity=await command('/history',human(98765432));assert.ok(noIdentity);
 assert.ok(noIdentity.buttons.some(button=>button.url===base.origin+'/account'));
 assert.equal(noIdentity.buttons.some(button=>button.text.includes('နောက်ထပ်')),false);
 const empty=await command('/plans',human(7845124));assert.ok(empty?.fields.text);

 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Yangon',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const today=['year','month','day'].map(type=>parts.find(part=>part.type===type).value).join('-');
 const day=offset=>new Date(Date.parse(today+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
 const timestamp=offset=>new Date(Date.now()+offset*1000).toISOString();
 const own=completed.data.customer.id,other=separate.data.customer.id;
 await fixtureOrder(own,'A-Pending-Only',{approved:false,createdAt:timestamp(70)});
 const rejectedOrder=await fixtureOrder(own,'A-Rejected-Only',{approved:false,createdAt:timestamp(68)});
 await db.execute('UPDATE digimium_orders SET rejected_at=?, customer_note=? WHERE id=?',
  [timestamp(69),'PRIVATE-CUSTOMER-NOTE-SENTINEL',rejectedOrder]);
 await fixtureOrder(own,'A-Multi-Only',{lineCount:5,createdAt:timestamp(65),startDate:day(-10),endDate:day(20)});
 await fixtureOrder(own,'A-Active-Only',{createdAt:timestamp(60),startDate:day(-10),endDate:day(20)});
 const sameCreated=timestamp(55);
 await fixtureOrder(own,'A-Tie-Low',{createdAt:sameCreated,orderId:'00000000-0000-4000-8000-000000000000',startDate:day(-10),endDate:day(20)});
 await fixtureOrder(own,'A-Tie-High',{createdAt:sameCreated,orderId:'ffffffff-ffff-4fff-8fff-ffffffffffff',startDate:day(-10),endDate:day(20)});
 await fixtureOrder(own,'A-EndsToday-Only',{createdAt:timestamp(50),startDate:day(-20),endDate:today});
 await fixtureOrder(own,'A-Expired-Only',{createdAt:timestamp(40),startDate:day(-40),endDate:day(-10)});
 await fixtureOrder(own,'A-Upcoming-Only',{createdAt:timestamp(30),startDate:day(2),endDate:day(32)});
 await fixtureOrder(own,'A-Undated-Only',{createdAt:timestamp(20)});
 await fixtureOrder(own,'A-Long-Only '+('မြန်မာ🚀'.repeat(200)),{createdAt:timestamp(10),startDate:day(-1),endDate:day(2)});
 const otherCreated=timestamp(100),otherOrderId=await fixtureOrder(other,'B-PRIVATE-PURCHASE-SENTINEL',{createdAt:otherCreated,startDate:day(-1),endDate:day(40)});
 await fixtureOrder(local.customer.id,'LOCAL-PRIVATE-PURCHASE-SENTINEL',{createdAt:timestamp(110),startDate:day(-1),endDate:day(40)});
 await fixtureOrder(null,'GUEST-PRIVATE-PURCHASE-SENTINEL',{guest:true,createdAt:timestamp(120),startDate:day(-1),endDate:day(40)});
 let historyPage=await command('/history',human(undefined,{first_name:'New display name',username:'copied_name'}));
 assert.ok(historyPage);let allHistory=historyPage.fields.text,historyPages=1;
 assert.match(historyPage.fields.text,/A-Pending-Only/);assert.match(historyPage.fields.text,/A-Multi-Only/);
 const rejectedHistory=historyPage.fields.text.split('အော်ဒါ #'+rejectedOrder.slice(0,8).toUpperCase())[1].split('\n\nအော်ဒါ #')[0];
 assert.match(rejectedHistory,/❌ ငြင်းပယ်ထားသည်/);assert.match(rejectedHistory,/A-Rejected-Only/);
 assert.doesNotMatch(rejectedHistory,/အတည်ပြုရန် စောင့်နေသည်|အတည်ပြုပြီးရင် သက်တမ်းရက်တွေ ပြပါမယ်|စရက် —|ကုန်ရက် —|ရက် ကျန်|▰|▱/);
 while(historyPage.buttons.some(button=>button.text.includes('နောက်ထပ်'))){
  assert.ok(historyPages++<10,'History pagination must terminate');
  historyPage=(await navigate(historyPage,historyPage.buttons.find(button=>button.text.includes('နောက်ထပ်')))).panel;
  assert.ok(historyPage);allHistory+='\n'+historyPage.fields.text;
 }
 assert.ok(historyPages>=3);for(const label of ['A-Pending-Only','A-Rejected-Only','A-Active-Only','A-EndsToday-Only','A-Expired-Only','A-Upcoming-Only','A-Undated-Only','A-Long-Only'])assert.ok(allHistory.includes(label),label+' must be reachable');
 assert.equal(allHistory.match(/A-Multi-Only/g)?.length,5,'A multi-line order crosses page boundaries without skipping/duplicating lines');
 assert.ok(allHistory.indexOf('A-Tie-High')<allHistory.indexOf('A-Tie-Low'),'Equal timestamps use UUID descending tie-breaks');
 assert.ok(historyPage.buttons.some(button=>button.text==='အစမှ'));
 const firstAgain=(await navigate(historyPage,historyPage.buttons.find(button=>button.text==='အစမှ'))).panel;
 assert.match(firstAgain.fields.text,/A-Pending-Only/);
 const refreshed=(await navigate(firstAgain,firstAgain.buttons.find(button=>button.text.includes('ပြန်စစ်')))).panel;
 assert.equal(refreshed.fields.text,firstAgain.fields.text,'Refresh preserves current page and reads current data');
 let plansPage=await command('/plans'),allPlans=plansPage.fields.text,planPages=1;
 while(plansPage.buttons.some(button=>button.text.includes('နောက်ထပ်'))){assert.ok(planPages++<10);plansPage=(await navigate(plansPage,plansPage.buttons.find(button=>button.text.includes('နောက်ထပ်')))).panel;allPlans+='\n'+plansPage.fields.text;}
 assert.ok(!allPlans.includes('A-Pending-Only'),'Unapproved order is not a purchased plan');
 assert.ok(!allPlans.includes('A-Rejected-Only'),'Rejected order is not a purchased plan');
 for(const label of ['A-Active-Only','A-EndsToday-Only','A-Expired-Only','A-Upcoming-Only','A-Undated-Only'])assert.ok(allPlans.includes(label));
 assert.ok(allPlans.includes(today));assert.match(allPlans,/20/,'Actual dates determine remaining days');
 assert.match(allPlans,/[█▓▰■]/u,'Plan term includes a remaining-time visual');
 const isolatedText=allHistory+'\n'+allPlans;
 for(const sentinel of ['PRIVATE-CUSTOMER-NOTE-SENTINEL','PRIVATE-DELIVERY-PASSWORD-SENTINEL','B-PRIVATE-PURCHASE-SENTINEL','LOCAL-PRIVATE-PURCHASE-SENTINEL','GUEST-PRIVATE-PURCHASE-SENTINEL','PRIVATE-GUEST-SENTINEL','telegram-local@example.invalid'])assert.ok(!isolatedText.includes(sentinel),sentinel+' must never be included');

 const target=await command('/history'),targetNext=target.buttons.find(button=>button.callback_data);
 const forgedAttempts=[
  {from:human(7845124),message:{message_id:target.messageId,date:Math.floor(Date.now()/1000),chat:{id:7845124,type:'private'},from:bot}},
  {message:{message_id:target.messageId+999,date:Math.floor(Date.now()/1000),chat:{id:human().id,type:'private'},from:bot}},
  {message:{message_id:target.messageId,date:Math.floor(Date.now()/1000),chat:{id:human().id,type:'group'},from:bot}},
  {message:{message_id:target.messageId,date:Math.floor(Date.now()/1000),chat:{id:human().id,type:'private'},from:{...bot,id:111111}}},
  {data:targetNext.callback_data.slice(0,-1)+(targetNext.callback_data.endsWith('A')?'B':'A')},
 ];
 for(const forged of forgedAttempts){const outcome=await navigate(target,targetNext,forged);assert.equal(outcome.panel,null);assert.ok(!outcome.added.some(call=>['sendMessage','editMessageText'].includes(call.method)),'Forged/cross-user navigation must not render any account data');}
 const beforeInvalidFlood=(await calls()).length;
 for(let n=0;n<20;n++)await navigate(target,{callback_data:'th1.h.-.1.'+'A'.repeat(16)});
 assert.equal((await calls()).length,beforeInvalidFlood,'Invalid MAC callback floods cannot amplify into Bot API requests');
 const expiredNavigation=signedNavigation(human().id,target.messageId,'h','-',Math.floor(Date.now()/1000)-1);
 const expiredMenu=(await navigate(target,expiredNavigation)).panel;assert.ok(expiredMenu);assert.ok(!expiredMenu.fields.text.includes('A-Active-Only'),'Expired buttons reopen a generic menu, not account data');
 assert.ok(expiredMenu.buttons.some(button=>button.text.includes('Plan')));
 const ownPlansFromMenu=(await navigate(expiredMenu,expiredMenu.buttons.find(button=>button.text.includes('Plan')))).panel;
 assert.ok(ownPlansFromMenu.fields.text.includes('A-Multi-Only'));
 const foreignPosition=Buffer.alloc(24);foreignPosition.writeUIntBE(Date.parse(otherCreated),0,6);Buffer.from(otherOrderId.replaceAll('-',''),'hex').copy(foreignPosition,6);
 const foreignPositionResult=(await navigate(target,signedNavigation(human().id,target.messageId,'h',foreignPosition.toString('base64url')))).panel;
 assert.ok(foreignPositionResult.fields.text.includes('A-Pending-Only'));assert.ok(!foreignPositionResult.fields.text.includes('B-PRIVATE-PURCHASE-SENTINEL'),'Even a valid signed foreign position never changes actual sender ownership');
 const otherHistory=await command('/history',human(7845124));assert.match(otherHistory.fields.text,/B-PRIVATE-PURCHASE-SENTINEL/);assert.ok(!otherHistory.fields.text.includes('A-Active-Only'));
 // Browsing uses its own limits; ordinary menu use must not exhaust the tighter login budget.
 for(let n=0;n<30;n++)assert.ok(await command('/menu'));
 const afterBrowsing=await begin();await approve(afterBrowsing);assert.equal((await finish(afterBrowsing)).data.customer.id,own);
 const navigationBucket=Math.floor(Date.now()/900000),navigationScope=hash('telegram:900:navigation:user:'+human().id);
 await db.execute('UPDATE digimium_customer_auth_limits SET attempts=120 WHERE bucket=? AND scope_hash=?',[navigationBucket,navigationScope]);
 const beforeLimitedCallbacks=(await calls()).length;
 for(let n=0;n<20;n++)assert.equal((await navigate(target,targetNext)).panel,null);
 assert.equal((await calls()).length,beforeLimitedCallbacks,'Valid callbacks beyond the read quota emit no warnings, data or other Bot API amplification');
 // A photo menu opens a new full-length text panel; it never squeezes history into a caption.
 const otherSuccessPhoto=(await calls()).filter(call=>call.method==='sendPhoto'&&call.fields.chat_id==='7845124'&&call.fields.caption.includes('Website အကောင့်ဝင်ပြီးပါပြီ')).at(-1);
 const otherSuccessEdit=(await calls()).find(call=>call.method==='editMessageCaption'&&call.fields.message_id===otherSuccessPhoto.messageId);
 const photoMenu={user:human(7845124),messageId:otherSuccessPhoto.messageId,photo:true,fields:otherSuccessEdit.fields,buttons:otherSuccessEdit.fields.reply_markup.inline_keyboard.flat()};
 for(let n=0;n<4;n++)await fixtureOrder(other,'PHOTO-HISTORY-'+n+' '+('X'.repeat(100)),{createdAt:timestamp(200-n),startDate:day(-1),endDate:day(40),planName:'Long plan '+('Y'.repeat(140))});
 const photoHistoryButton=photoMenu.buttons.find(button=>button.text.includes('အော်ဒါ'));
 const forgedPhotoResult=await navigate(photoMenu,photoHistoryButton,{from:human()});assert.equal(forgedPhotoResult.panel,null);assert.equal(forgedPhotoResult.added.length,0,'Forged photo-menu callback fails before any Bot API calls');
 const converted=await navigate(photoMenu,photoHistoryButton);assert.ok(converted.panel);assert.notEqual(converted.panel.messageId,photoMenu.messageId);
 assert.ok(converted.panel.fields.text.length>1024,'History keeps full text beyond the photo caption limit');assert.ok(converted.added.some(call=>call.method==='sendMessage'));assert.ok(!converted.added.some(call=>call.method==='editMessageCaption'));
 const convertedNext=converted.panel.buttons.find(button=>button.text.includes('နောက်ထပ်'));assert.ok(convertedNext);
 const lastPhotoHistory=await navigate(converted.panel,convertedNext);assert.ok(lastPhotoHistory.panel.fields.text.includes('PHOTO-HISTORY-3'));
 assert.equal(lastPhotoHistory.panel.messageId,converted.panel.messageId,'New text-panel pagination stays bound to its own actual message');assert.ok(!lastPhotoHistory.added.some(call=>call.method==='sendMessage'));
 // Link mode proves Telegram control without replacing the current Google/email customer.
 async function beginLink(session) {
  const response=await mutate('/api/customer/telegram/start',{returnTo:'account',purpose:'link'},session);
  const flow=await json(response);assert.equal(flow.purpose,'link');
  assert.ok(!JSON.stringify(flow).includes('sessionHash'));assert.ok(!Object.hasOwn(flow,'link'));
  return {...flow,cookie:cookie(response,'digimium_local_telegram'),session};
 }
 async function approveLink(flow,user) {
  const prompt=await launch(flow,user);assert.ok(prompt);assert.match(prompt.text,/Telegram ချိတ်ရန်/);
  await json(await choose(prompt,prompt.buttons.findIndex(item=>item.text===flow.code)));
  const pending=await json(await get('/api/customer/telegram/pending?flow='+flow.flow,flow.cookie+'; '+flow.session));
  assert.equal(pending.status,'approved');assert.equal(pending.purpose,'link');return prompt;
 }
 async function countLink(telegramId) {return Number((await db.execute('SELECT COUNT(*) AS count FROM digimium_telegram_identities WHERE telegram_id=?',[String(telegramId)]))[0][0].count);}
 assert.equal((await mutate('/api/customer/telegram/start',{returnTo:'account',purpose:'link'})).status,401);
 assert.equal((await mutate('/api/customer/telegram/start',{returnTo:'account',purpose:'link'},localCookie,'https://foreign.invalid')).status,403);
 for(const body of [{returnTo:'history',purpose:'link'},{returnTo:'account',purpose:'wrong'},{returnTo:'account',purpose:'link',customerId:own}])assert.equal((await mutate('/api/customer/telegram/start',body,localCookie)).status,400);
 const linkingUser=human(88550001,{username:'linked_email_owner'}),emailLink=await beginLink(localCookie);
 await approveLink(emailLink,linkingUser);assert.equal(await countLink(linkingUser.id),0,'Bot code approval alone never persists a link');
 assert.equal((await get('/api/customer/telegram/pending?flow='+emailLink.flow,emailLink.cookie)).status,401);
 assert.equal((await mutate('/api/customer/telegram/complete',{flow:emailLink.flow},emailLink.cookie+'; '+sessionCookie)).status,401,'A different signed-in account cannot complete the original link');
 const beforeLinkNotice=(await calls()).length,emailLinked=await finish(emailLink,localCookie);
 assert.equal(emailLinked.data.purpose,'link');assert.equal(emailLinked.data.customer.id,local.customer.id);assert.equal(emailLinked.data.customer.name,local.customer.name);
 assert.equal(emailLinked.data.customer.email,local.customer.email);assert.equal(emailLinked.data.customer.telegram.id,String(linkingUser.id));
 assert.deepEqual(emailLinked.data.customer.signInMethods,{emailPassword:true,google:false,telegram:true});
 assert.equal(cookie(emailLinked.response,'digimium_local_customer',false),'','Linking keeps the original authenticated session');
 assert.equal((await json(await get('/api/customer/session',localCookie))).customer.id,local.customer.id);
 assert.ok((await calls()).slice(beforeLinkNotice).some(call=>call.method==='sendMessage'&&call.fields.text.includes('Telegram ချိတ်ဆက်ပြီးပါပြီ')));
 assert.ok(!(await calls()).slice(beforeLinkNotice).some(call=>call.method==='sendPhoto'),'Link completion does not use the misleading LOGIN SUCCESSFUL image');
 const linkedBotHistory=await command('/history',linkingUser);assert.match(linkedBotHistory.fields.text,/LOCAL-PRIVATE-PURCHASE-SENTINEL/);
 assert.ok(!linkedBotHistory.fields.text.includes('A-Active-Only'),'Linking keeps the original account history, without merging another customer');
 const emailLogin=await mutate('/api/customer/session',{action:'login',email:local.customer.email,password:localPassword});
 assert.equal((await json(emailLogin)).customer.id,local.customer.id,'Original email/password login remains the same customer');
 const linkedTelegramFlow=await begin();await approve(linkedTelegramFlow,linkingUser);
 assert.equal((await finish(linkedTelegramFlow)).data.customer.id,local.customer.id,'Later Telegram login resolves the existing email account');
 const anotherLink=await beginLink(sessionCookie);await approveLink(anotherLink,linkingUser);
 assert.deepEqual(await json(await mutate('/api/customer/telegram/complete',{flow:anotherLink.flow},anotherLink.cookie+'; '+sessionCookie),409),{error:'telegram_already_linked'});
 const googleId=randomUUID(),googleToken=randomBytes(32).toString('base64url'),googleCookie='digimium_local_customer='+googleToken;
 await db.execute('INSERT INTO digimium_customers (id,name,email,password_hash,created_at) VALUES (?,?,?,NULL,UTC_TIMESTAMP())',[googleId,'Google linked owner','google-link@example.invalid']);
 await db.execute('INSERT INTO digimium_google_identities (google_sub,customer_id,created_at) VALUES (?,?,UTC_TIMESTAMP())',['verified-google-link-subject',googleId]);
 await db.execute('INSERT INTO digimium_customer_sessions (token_hash,customer_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR))',[hash(googleToken),googleId]);
 assert.deepEqual((await json(await get('/api/customer/session',googleCookie))).customer.signInMethods,{emailPassword:false,google:true,telegram:false});
 const beforeGoogleOrder=await fixtureOrder(googleId,'GOOGLE-EARLIER-PURCHASE',{startDate:day(-3),endDate:day(27)});
 const googleConflict=await beginLink(googleCookie);await approveLink(googleConflict,linkingUser);
 assert.deepEqual(await json(await mutate('/api/customer/telegram/complete',{flow:googleConflict.flow},googleConflict.cookie+'; '+googleCookie),409),{error:'telegram_in_use'});
 assert.equal((await json(await get('/api/customer/session',googleCookie))).customer.telegram,undefined);
 const googleLink=await beginLink(googleCookie),googleTelegram=human(88550002,{username:'google_linked_owner'});await approveLink(googleLink,googleTelegram);
 const linkedGoogle=await finish(googleLink,googleCookie);assert.equal(linkedGoogle.data.customer.id,googleId);
 assert.deepEqual(linkedGoogle.data.customer.signInMethods,{emailPassword:false,google:true,telegram:true});
 assert.ok((await json(await get('/api/customer/orders?view=history',googleCookie))).orders.some(order=>order.id===beforeGoogleOrder));
 assert.match((await command('/plans',googleTelegram)).fields.text,/GOOGLE-EARLIER-PURCHASE/);
 assert.equal((await db.execute('SELECT customer_id FROM digimium_google_identities WHERE google_sub=?',['verified-google-link-subject']))[0][0].customer_id,googleId);
 const googleTelegramLogin=await begin();await approve(googleTelegramLogin,googleTelegram);assert.equal((await finish(googleTelegramLogin)).data.customer.id,googleId);
 // Switching/revoking the original website session invalidates its outstanding link.
 async function linkFixture(label) {
  const password=randomUUID(),response=await mutate('/api/customer/session',{action:'register',email:label+'@example.invalid',password,name:label});
  const data=await json(response,201);return {id:data.customer.id,email:data.customer.email,password,cookie:cookie(response,'digimium_local_customer')};
 }
 const revokedOwner=await linkFixture('revoked-link'),revokedLink=await beginLink(revokedOwner.cookie),revokedUser=human(88550003);await approveLink(revokedLink,revokedUser);
 await json(await mutate('/api/customer/session',{},revokedOwner.cookie,base.origin,'DELETE'));
 assert.equal((await mutate('/api/customer/telegram/complete',{flow:revokedLink.flow},revokedLink.cookie+'; '+revokedOwner.cookie)).status,401);assert.equal(await countLink(revokedUser.id),0);
 const switchedOwner=await linkFixture('switched-link'),switchedLink=await beginLink(switchedOwner.cookie),switchedUser=human(88550004);await approveLink(switchedLink,switchedUser);
 const newerSession=await mutate('/api/customer/session',{action:'login',email:switchedOwner.email,password:switchedOwner.password});await json(newerSession);
 assert.equal((await mutate('/api/customer/telegram/complete',{flow:switchedLink.flow},switchedLink.cookie+'; '+cookie(newerSession,'digimium_local_customer'))).status,401,'A different session of the same account cannot inherit an old link challenge');
 assert.equal(await countLink(switchedUser.id),0);
 const cancelledOwner=await linkFixture('cancelled-link'),cancelledLink=await beginLink(cancelledOwner.cookie),cancelledUser=human(88550005);await approveLink(cancelledLink,cancelledUser);
 await json(await mutate('/api/customer/telegram/pending?flow='+cancelledLink.flow,{},cancelledLink.cookie+'; '+cancelledOwner.cookie,base.origin,'DELETE'));
 assert.equal((await mutate('/api/customer/telegram/complete',{flow:cancelledLink.flow},cancelledLink.cookie+'; '+cancelledOwner.cookie)).status,400);assert.equal(await countLink(cancelledUser.id),0);
 const raceOwnerA=await linkFixture('race-link-a'),raceOwnerB=await linkFixture('race-link-b'),raceUser=human(88550006);
 const raceA=await beginLink(raceOwnerA.cookie),raceB=await beginLink(raceOwnerB.cookie);await approveLink(raceA,raceUser);await approveLink(raceB,raceUser);
 const raceResults=await Promise.all([mutate('/api/customer/telegram/complete',{flow:raceA.flow},raceA.cookie+'; '+raceOwnerA.cookie),mutate('/api/customer/telegram/complete',{flow:raceB.flow},raceB.cookie+'; '+raceOwnerB.cookie)]);
 assert.deepEqual(raceResults.map(result=>result.status).sort(),[200,409]);assert.equal(await countLink(raceUser.id),1,'Concurrent linking cannot transfer or duplicate a Telegram identity');
 const expiryOwner=await linkFixture('expired-link'),expiryLink=await beginLink(expiryOwner.cookie),expiryUser=human(88550007);await approveLink(expiryLink,expiryUser);
 await db.execute('UPDATE digimium_telegram_auth_challenges SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id_hash=?',[hash(expiryLink.flow)]);
 assert.equal((await mutate('/api/customer/telegram/complete',{flow:expiryLink.flow},expiryLink.cookie+'; '+expiryOwner.cookie)).status,400);assert.equal(await countLink(expiryUser.id),0,'An expired approved link cannot attach an identity');
 for(const revoke of ['challenge','session']) {
  const raceOwner=await linkFixture('atomic-'+revoke+'-link'),raceFlow=await beginLink(raceOwner.cookie),raceIdentity=human(revoke==='challenge'?88550008:88550009);await approveLink(raceFlow,raceIdentity);
  const transaction=await mysql.createConnection({host:env.DB_HOST,port:Number(env.DB_PORT||3306),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME});
  await transaction.beginTransaction();
  if(revoke==='challenge')await transaction.execute('DELETE FROM digimium_telegram_auth_challenges WHERE id_hash=?',[hash(raceFlow.flow)]);
  else await transaction.execute('DELETE FROM digimium_customer_sessions WHERE token_hash=?',[hash(raceOwner.cookie.split('=')[1])]);
  const completion=mutate('/api/customer/telegram/complete',{flow:raceFlow.flow},raceFlow.cookie+'; '+raceOwner.cookie);await delay(150);
  await transaction.commit();await transaction.end();assert.equal((await completion).status,revoke==='challenge'?400:401);
  assert.equal(await countLink(raceIdentity.id),0,'Atomic '+revoke+' revocation prevents attaching a Telegram identity');
 }
 // Every rendered message, not only the text assertions above, excludes stored delivery credentials.
 for(const call of await calls())assert.ok(!JSON.stringify(call.fields).includes('PRIVATE-DELIVERY-PASSWORD-SENTINEL'));
 console.log('Telegram protocol/history integration passed: login safeguards, session-bound Google/email-to-Telegram linking, no-merge conflicts and revocation races, private history/plans, bounded pagination and credential/guest/customer isolation.');
} finally {
 if(server&&server.exitCode===null&&!server.signalCode){const exit=once(server,'exit');server.kill('SIGTERM');const timeout=setTimeout(()=>server.kill('SIGKILL'),8000);try{await exit;}finally{clearTimeout(timeout);}}
 await db.end();
}
