// Refuses any nonempty database or non-loopback target; no real Telegram calls are made.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
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
const mutate=(path,body,cookie='',origin=base.origin,method='POST')=>request(path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:method==='DELETE'?undefined:JSON.stringify(body)});
const get=(path,cookie='')=>request(path,{headers:{Cookie:cookie}});
async function json(response,status=200){assert.equal(response.status,status);assert.match(response.headers.get('cache-control')||'',/no-store/);return response.json();}
function cookie(response,name,required=true){const value=response.headers.getSetCookie().find(value=>value.startsWith(name+'=')&&!/Max-Age=0(?:;|$)/.test(value));if(!value){assert.ok(!required,'Missing '+name);return '';}assert.match(value,/HttpOnly/i);assert.match(value,/SameSite=Lax/i);return value.split(';')[0];}
const human=(id=7845123,extra={})=>({id,is_bot:false,first_name:'Telegram',last_name:'Customer',username:'telegram_fixture',...extra});
const bot={id:123456789,is_bot:true,first_name:'Digimium test bot'};
async function webhook(body,secret=env.TELEGRAM_WEBHOOK_SECRET){return request('/api/customer/telegram/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':secret},body:JSON.stringify({update_id:++updateId,...body})});}
async function calls(){try{return (await readFile(env.TELEGRAM_FIXTURE_LOG,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch{return [];}}
async function begin(returnTo='account',session=''){const response=await mutate('/api/customer/telegram/start',{returnTo},session);const flow=await json(response);assert.match(flow.flow,/^[A-Za-z0-9_-]{43}$/);assert.match(flow.code,/^\d{4}$/);assert.equal(new URL(flow.url).origin,'https://t.me');assert.equal(new URL(flow.url).searchParams.get('start'),'login_'+flow.flow);assert.equal(flow.returnTo,returnTo);assert.ok(Date.parse(flow.expiresAt)>Date.now()+290000&&Date.parse(flow.expiresAt)<=Date.now()+301000);return {...flow,cookie:cookie(response,'digimium_local_telegram'),response};}
async function launch(flow,user=human(),extra={}){const before=(await calls()).length;const response=await webhook({message:{message_id:100+updateId,date:Math.floor(Date.now()/1000),from:user,chat:{id:user.id,type:'private'},text:'/start login_'+flow.flow,...extra}});await json(response);const added=(await calls()).slice(before).filter(call=>call.method==='sendMessage');if(!added.length)return null;const call=added.at(-1),buttons=call.fields.reply_markup.inline_keyboard.flat();assert.equal(buttons.length,5);assert.equal(new Set(buttons.slice(0,4).map(item=>item.text)).size,4);assert.ok(buttons.slice(0,4).some(item=>item.text===flow.code));assert.ok(buttons.every(item=>Buffer.byteLength(item.callback_data)<=64));assert.ok(buttons.every(item=>!item.callback_data.includes(flow.flow)));const [rows]=await db.execute('SELECT stage,payload FROM digimium_telegram_auth_challenges WHERE id_hash=?',[hash(flow.flow)]);if(!rows[0])return null;assert.equal(rows[0].stage,'sent');const sends=(await calls()).filter(call=>call.method==='sendMessage');return {user,buttons,messageId:1000+sends.length,fields:call.fields};}
async function choose(launchInfo,index,extra={}){return webhook({callback_query:{id:String(++updateId),from:launchInfo.user,data:launchInfo.buttons[index].callback_data,message:{message_id:launchInfo.messageId,date:Math.floor(Date.now()/1000),chat:{id:launchInfo.user.id,type:'private'},from:bot},...extra}});}
async function approve(flow,user=human()){const info=await launch(flow,user);assert.ok(info);await json(await choose(info,info.buttons.findIndex(item=>item.text===flow.code)));assert.equal((await json(await get('/api/customer/telegram/pending?flow='+flow.flow,flow.cookie))).status,'approved');return info;}
async function finish(flow,session=''){const response=await mutate('/api/customer/telegram/complete',{flow:flow.flow},[flow.cookie,session].filter(Boolean).join('; '));return {response,data:await json(response)};}
async function stage(flow){const [rows]=await db.execute('SELECT stage FROM digimium_telegram_auth_challenges WHERE id_hash=?',[hash(flow.flow)]);return rows[0]?.stage;}

async function command(text,user=human(),extra={}) {
 const before=(await calls()).length;
 await json(await webhook({message:{message_id:5000+updateId,date:Math.floor(Date.now()/1000),from:user,chat:{id:user.id,type:'private'},text,...extra}}));
 const added=(await calls()).slice(before),send=added.find(call=>call.method==='sendMessage');
 if(!send)return null;
 assert.equal(send.fields.chat_id,String(user.id));assert.equal(send.fields.protect_content,true);
 const messageId=1000+(await calls()).filter(call=>call.method==='sendMessage').length;
 const final=added.filter(call=>call.method==='editMessageText').at(-1)?.fields||send.fields;
 assert.ok(final.text.length<=4096);assert.equal(final.parse_mode,undefined);
 const buttons=final.reply_markup?.inline_keyboard.flat()||[];
 assert.ok(buttons.filter(button=>button.callback_data).every(button=>Buffer.byteLength(button.callback_data)<=64));
 return {user,messageId,fields:final,buttons};
}
async function navigate(panel,button,extra={}) {
 const before=(await calls()).length;
 await json(await webhook({callback_query:{id:String(++updateId),from:panel.user,data:button.callback_data,message:{message_id:panel.messageId,date:Math.floor(Date.now()/1000),chat:{id:panel.user.id,type:'private'},from:bot},...extra}}));
 const added=(await calls()).slice(before),edit=added.filter(call=>call.method==='editMessageText').at(-1);
 if(!edit)return {added,panel:null};
 assert.equal(edit.fields.chat_id,String(panel.user.id));assert.ok(edit.fields.text.length<=4096);assert.equal(edit.fields.parse_mode,undefined);
 return {added,panel:{...panel,fields:edit.fields,buttons:edit.fields.reply_markup?.inline_keyboard.flat()||[]}};
}
function approvedDelivery(id,owner,lines) {
 const key=createHmac('sha256',env.ORDER_FULFILLMENT_SECRET?.trim()||env.ADMIN_AUTH_SECRET).update('digimium/order-fulfillment/v1').digest();
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(id+'/'+owner));
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(lines),'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');
}
async function fixtureOrder(customerId,productName,{approved=true,createdAt=new Date().toISOString(),startDate=null,endDate=null,guest=false,lineCount=1,orderId=randomUUID()}={}) {
 const id=orderId,guestKey=guest?randomBytes(32):null;
 const lines=Array.from({length:lineCount},(_,index)=>({id:randomUUID(),productId:'chatgpt',planId:null,productName:productName+(lineCount>1?'-'+(index+1):''),planName:'Purchased plan',duration:'1 month',price:'12,000 MMK',quantity:1}));
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
 const first=await begin('checkout');assert.equal((await json(await get('/api/customer/telegram/pending',first.cookie))).flow,first.flow);
 assert.equal((await mutate('/api/customer/telegram/complete',{flow:first.flow},first.cookie)).status,400,'Cannot finish before bot approval');
 assert.deepEqual(await json(await get('/api/customer/telegram/pending?flow='+first.flow)),{status:'none'},'Flow token alone is insufficient');
 const firstLaunch=await approve(first);const completed=await finish(first);assert.equal(completed.data.customer.email,null);assert.equal(completed.data.customer.passwordAvailable,false);assert.equal(completed.data.customer.telegram.id,String(human().id));assert.equal(completed.data.customer.telegram.username,'telegram_fixture');
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
 const slow=await begin();await writeFile(env.TELEGRAM_FIXTURE_CONTROL,JSON.stringify({delaySendMs:1000}));const inflight=launch(slow,human(7845126));for(let n=0;;n++){if(await stage(slow)==='sending')break;assert.ok(n<100);await delay(20);}await json(await mutate('/api/customer/telegram/pending?flow='+slow.flow,{},slow.cookie,base.origin,'DELETE'));await inflight;assert.equal(await stage(slow),undefined,'Cancel during send prevents later approval binding');await writeFile(env.TELEGRAM_FIXTURE_CONTROL,'{}');
 const retryFlow=await begin();await writeFile(env.TELEGRAM_FIXTURE_CONTROL,JSON.stringify({failSends:1}));const failedSend=await webhook({message:{message_id:100+updateId,date:Math.floor(Date.now()/1000),from:human(),chat:{id:human().id,type:'private'},text:'/start login_'+retryFlow.flow}});assert.equal(failedSend.status,503);assert.equal(await stage(retryFlow),'waiting','Failed send cannot leave an approveable keyboard');await writeFile(env.TELEGRAM_FIXTURE_CONTROL,'{}');await approve(retryFlow);assert.equal((await finish(retryFlow)).data.customer.id,completed.data.customer.id);
 const guarded=await begin();await approve(guarded,human(7845127));const lock=await mysql.createConnection({host:env.DB_HOST,port:Number(env.DB_PORT||3306),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME});await lock.beginTransaction();await lock.execute('DELETE FROM digimium_telegram_auth_challenges WHERE id_hash=?',[hash(guarded.flow)]);const racingCompletion=mutate('/api/customer/telegram/complete',{flow:guarded.flow},guarded.cookie);await delay(150);await lock.commit();await lock.end();assert.equal((await racingCompletion).status,400,'A cancellation committing during completion prevents session creation');const [[noGuardedIdentity]]=await db.query('SELECT COUNT(*) AS count FROM digimium_telegram_identities WHERE telegram_id=?',['7845127']);assert.equal(noGuardedIdentity.count,0,'Cancelled completion creates no account');
 const browserBound=await begin();const boundPrompt=await launch(browserBound);assert.equal(await launch(browserBound,human(9999998)),null,'A second user cannot replace an already bound prompt');await json(await choose(boundPrompt,boundPrompt.buttons.findIndex(item=>item.text===browserBound.code)));assert.equal((await finish(browserBound)).data.customer.id,completed.data.customer.id);
 const forgedCookie={...fresh,cookie:fresh.cookie.slice(0,65)+'X'+fresh.cookie.slice(66)};assert.deepEqual(await json(await get('/api/customer/telegram/pending?flow='+fresh.flow,forgedCookie.cookie)),{status:'none'});
 const [stored]=await db.query('SELECT payload FROM digimium_telegram_auth_challenges');assert.ok(stored.every(row=>!row.payload.includes('telegram_fixture')&&!row.payload.includes('firstName')),'Telegram identity/prompt metadata is encrypted');
 // Private bot menu and history never accept a customer ID from Telegram payloads.
 const beforeGroup=(await calls()).length;
 assert.equal(await command('/history',human(),{chat:{id:-100123,type:'supergroup'}}),null);
 assert.equal(await command('/plans',human(),{chat:{id:99999999,type:'private'}}),null);
 assert.equal((await calls()).length,beforeGroup,'Group/mismatched-chat commands send no bot response');
 const menu=await command('/start');assert.ok(menu);
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
 while(historyPage.buttons.some(button=>button.text.includes('နောက်ထပ်'))){
  assert.ok(historyPages++<10,'History pagination must terminate');
  historyPage=(await navigate(historyPage,historyPage.buttons.find(button=>button.text.includes('နောက်ထပ်')))).panel;
  assert.ok(historyPage);allHistory+='\n'+historyPage.fields.text;
 }
 assert.ok(historyPages>=3);for(const label of ['A-Pending-Only','A-Active-Only','A-EndsToday-Only','A-Expired-Only','A-Upcoming-Only','A-Undated-Only','A-Long-Only'])assert.ok(allHistory.includes(label),label+' must be reachable');
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
 for(const label of ['A-Active-Only','A-EndsToday-Only','A-Expired-Only','A-Upcoming-Only','A-Undated-Only'])assert.ok(allPlans.includes(label));
 assert.ok(allPlans.includes(today));assert.match(allPlans,/20/,'Actual dates determine remaining days');
 assert.match(allPlans,/[█▓▰■]/u,'Plan term includes a remaining-time visual');
 const isolatedText=allHistory+'\n'+allPlans;
 for(const sentinel of ['PRIVATE-DELIVERY-PASSWORD-SENTINEL','B-PRIVATE-PURCHASE-SENTINEL','LOCAL-PRIVATE-PURCHASE-SENTINEL','GUEST-PRIVATE-PURCHASE-SENTINEL','PRIVATE-GUEST-SENTINEL','telegram-local@example.invalid'])assert.ok(!isolatedText.includes(sentinel),sentinel+' must never be included');

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
 // Every rendered message, not only the text assertions above, excludes stored delivery credentials.
 for(const call of await calls())assert.ok(!JSON.stringify(call.fields).includes('PRIVATE-DELIVERY-PASSWORD-SENTINEL'));
 console.log('Telegram protocol/history integration passed: login safeguards, stable identity, private history/plans, date visuals, bounded pagination, callback HMAC ownership/message binding and credential/guest/customer isolation.');
} finally {
 if(server&&server.exitCode===null&&!server.signalCode){const exit=once(server,'exit');server.kill('SIGTERM');const timeout=setTimeout(()=>server.kill('SIGKILL'),8000);try{await exit;}finally{clearTimeout(timeout);}}
 await db.end();
}
