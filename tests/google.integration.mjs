// Requires an empty, explicitly named loopback database and an unused local app port.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import mysql from 'mysql2/promise';

const env={...process.env,ADMIN_AUTH_SECRET:randomBytes(32).toString('hex'),GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:randomUUID()};
const base=new URL(env.APP_ORIGIN);
assert.ok(base.origin===env.APP_ORIGIN && base.protocol==='http:' && base.hostname==='127.0.0.1' && base.port && env.DB_HOST==='127.0.0.1' && /^digimium_test_[a-z0-9_]+$/.test(env.DB_NAME) && env.DB_USER && env.DB_PASSWORD,'Use an empty loopback digimium_test_* database and loopback origin.');
const root=new URL('../',import.meta.url);
const db=await mysql.createConnection({host:env.DB_HOST,port:Number(env.DB_PORT||3306),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,multipleStatements:true});
let server;
const request=(path,options={})=>fetch(new URL(path,base),{...options,redirect:'manual',signal:AbortSignal.timeout(15000)});
const mutate=(path,body,cookie='',origin=base.origin,method='POST')=>request(path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:method==='DELETE'?undefined:JSON.stringify(body)});
const get=(path,cookie='')=>request(path,{headers:{Cookie:cookie}});
async function json(response,status=200){assert.equal(response.status,status);assert.match(response.headers.get('cache-control')||'',/no-store/);return response.json();}
function cookie(response,name,required=true){const value=response.headers.getSetCookie().find(value=>value.startsWith(name+'=')&&!/Max-Age=0(?:;|$)/.test(value));if(!value){assert.ok(!required,'Missing '+name);return '';}assert.match(value,/HttpOnly/i);assert.match(value,/SameSite=Lax/i);return value.split(';')[0];}
function result(html){const start=html.indexOf('window.opener.postMessage(')+'window.opener.postMessage('.length;const end=html.indexOf(','+JSON.stringify(base.origin)+')',start);assert(start>20&&end>start);return JSON.parse(html.slice(start,end));}
async function begin(returnTo='account',session=''){
 const response=await mutate('/api/customer/google/start',{returnTo},session);
 const data=await json(response);const url=new URL(data.url);
 assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.pathname,'/o/oauth2/v2/auth');
 assert.equal(url.searchParams.get('scope'),'openid email profile');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('redirect_uri'),base.origin+'/api/customer/google/callback');
 const flowCookie=cookie(response,'digimium_local_google');assert.ok(!flowCookie.includes(url.searchParams.get('state')),'Flow cookie hides state and secrets');
 return {response,url,cookie:flowCookie,nonce:url.searchParams.get('nonce'),state:url.searchParams.get('state'),challenge:url.searchParams.get('code_challenge')};
}
async function finish(flow,claims={},extra={}){
 const code=Buffer.from(JSON.stringify({nonce:flow.nonce,challenge:flow.challenge,claims,...extra})).toString('base64url');
 const response=await get('/api/customer/google/callback?'+new URLSearchParams({state:flow.state,code}),flow.cookie);
 assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy')||'',/frame-ancestors 'none'/);assert.equal(response.headers.get('referrer-policy'),'no-referrer');
 const html=await response.text();assert.ok(!html.includes('never-persist-fixture-access-token'));
 return {response,html,result:result(html)};
}
async function session(cookieValue){return (await json(await get('/api/customer/session',cookieValue))).customer;}
try{
 const [tables]=await db.query('SHOW TABLES');assert.equal(tables.length,0,'Refusing to test in a nonempty database.');
 const probe=createServer();await new Promise((resolve,reject)=>probe.once('error',reject).listen(Number(base.port),base.hostname,resolve));await new Promise(resolve=>probe.close(resolve));
 await db.query(await readFile(new URL('hostinger/schema.sql',root),'utf8'));
 // Prove the Google migration upgrades existing password-only tables while preserving rows.
 const legacy=await readFile(new URL('hostinger/customer-auth-schema.sql',root),'utf8');
 await db.query(legacy.replace('password_hash VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NULL','password_hash VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NOT NULL')
   .replace('email VARCHAR(254) COLLATE utf8mb4_bin NULL','email VARCHAR(254) COLLATE utf8mb4_bin NOT NULL'));
 const [[oldPasswordColumn]]=await db.query("SHOW COLUMNS FROM digimium_customers LIKE 'password_hash'");assert.equal(oldPasswordColumn.Null,'NO');
 server=spawn(process.execPath,['--import',new URL('tests/fixtures/google-fetch.mjs',root).href,fileURLToPath(new URL('.next/standalone/server.js',root))],{cwd:fileURLToPath(root),env:{...env,NODE_ENV:'production',HOSTNAME:base.hostname,PORT:base.port},stdio:['ignore','inherit','inherit']});
 for(let n=0;;n++){try{assert.equal((await get('/api/customer/google')).status,200);break;}catch(error){if(n>100||server.exitCode!==null)throw error;await delay(100);}}
 assert.deepEqual(await json(await get('/api/customer/google')),{enabled:true});
 assert.deepEqual(await json(await get('/api/customer/google/pending')),{status:'none'});
 assert.equal((await mutate('/api/customer/google/start',{returnTo:'account'},'','https://foreign.invalid')).status,403);
 assert.equal((await mutate('/api/customer/google/start',{returnTo:'https://foreign.invalid'})).status,400);
 assert.equal((await mutate('/api/customer/google/start',{returnTo:'account',redirect_uri:'https://foreign.invalid'})).status,400);
 const localPassword=randomUUID();const localResponse=await mutate('/api/customer/session',{action:'register',email:'local@example.invalid',password:localPassword,name:'Local owner'});
 const local=await json(localResponse,201);const localCookie=cookie(localResponse,'digimium_local_customer');
 const [[beforeHash]]=await db.query('SELECT password_hash FROM digimium_customers WHERE id=?',[local.customer.id]);
 // Shared provider bootstrap upgrades the old schema on first account use, before a Google flow starts.
 const [providerColumns]=await db.query("SHOW COLUMNS FROM digimium_customers WHERE Field IN ('email','password_hash')");assert.ok(providerColumns.every(column=>column.Null==='YES'));
 const first=await begin('checkout');
 const valid=await finish(first);assert.equal(valid.result.status,'success');assert.equal(valid.result.customer.passwordAvailable,false);
 const customerCookie=cookie(valid.response,'digimium_local_customer');const googleCustomer=await session(customerCookie);assert.equal(googleCustomer.email,'google@example.invalid');
 const [[migratedColumn]]=await db.query("SHOW COLUMNS FROM digimium_customers LIKE 'password_hash'");assert.equal(migratedColumn.Null,'YES');
 assert.equal((await session(localCookie)).id,local.customer.id,'Migration retains the existing local account and session');
 const receiptCookie=cookie(valid.response,'digimium_local_google_result');
 assert.equal((await json(await get('/api/customer/google/pending?flow='+first.state,customerCookie+'; '+receiptCookie))).status,'success');
 assert.equal((await json(await get('/api/customer/google/pending?flow='+first.state,first.cookie+'; '+customerCookie+'; '+receiptCookie))).status,'success','The active originating binding accepts its own verified receipt');
 assert.deepEqual(await json(await get('/api/customer/google/pending?flow='+randomBytes(32).toString('base64url'),customerCookie+'; '+receiptCookie)),{status:'none'},'A receipt cannot complete a different OAuth attempt');
 assert.deepEqual(await json(await get('/api/customer/google/pending',localCookie+'; '+receiptCookie)),{status:'none'},'An unrelated remembered session cannot claim Google success');
 const resetReceipt=await begin('account',customerCookie+'; '+receiptCookie);assert.ok(resetReceipt.response.headers.getSetCookie().some(value=>value.startsWith('digimium_local_google_result=;')&&value.includes('Max-Age=0')));
 const resetCancel=await mutate('/api/customer/google/pending',{},resetReceipt.cookie,base.origin,'DELETE');await json(resetCancel);
 assert.deepEqual(resetCancel.headers.getSetCookie(),[],'A cancellation response cannot erase any newer browser binding or receipt if it arrives late');
 const cancelledNewBinding=resetReceipt.cookie+'; '+customerCookie+'; '+receiptCookie;
 assert.deepEqual(await json(await get('/api/customer/google/pending',cancelledNewBinding)),{status:'none'},'A cancelled newer binding cannot fall back to an older successful flow receipt');
 assert.deepEqual(await json(await get('/api/customer/google/pending?flow='+first.state,cancelledNewBinding)),{status:'none'},'An old expected flow cannot bypass a different active browser binding');
 const afterCancelled=await begin('account',cancelledNewBinding);
 assert.deepEqual(resetCancel.headers.getSetCookie(),[],'Delivering the old cancellation after a new start has no cookie mutation to apply');
 assert.equal((await finish(afterCancelled)).result.status,'success','A Google login started after cancellation retains its usable browser binding');
 assert.ok(valid.html.includes('/?checkout=1'));assert.ok(!Object.hasOwn(googleCustomer,'password_hash'));
 const replay=await finish(first);assert.equal(replay.result.status,'error');assert.equal(cookie(replay.response,'digimium_local_customer',false),'');
 const [[passwordRow]]=await db.query('SELECT password_hash FROM digimium_customers WHERE id=?',[googleCustomer.id]);assert.equal(passwordRow.password_hash,null);
 assert.deepEqual(await json(await mutate('/api/customer/email-step',{email:' GOOGLE@EXAMPLE.INVALID '})),{next:'google'});
 assert.equal((await mutate('/api/customer/session',{currentPassword:'none',newPassword:randomUUID()},customerCookie,base.origin,'PATCH')).status,400);
 const changedEmail=await finish(await begin(),{email:'new-google@example.invalid',name:'Changed claim'});assert.equal(changedEmail.result.customer.id,googleCustomer.id);assert.equal(changedEmail.result.customer.email,googleCustomer.email,'Existing verified subject keeps stable account identity');
 const concurrentFlows=await Promise.all([begin(),begin()]);
 const concurrent=await Promise.all(concurrentFlows.map(flow=>finish(flow,{sub:'concurrent-sub',email:'concurrent@example.invalid'})));
 assert.ok(concurrent.every(item=>item.result.status==='success'));assert.equal(concurrent[0].result.customer.id,concurrent[1].result.customer.id);
 const [sameSubject]=await db.query("SELECT * FROM digimium_google_identities WHERE google_sub = ?",['concurrent-sub']);assert.equal(sameSubject.length,1);
 const unnamedFlow=await begin();const unnamed=await finish(unnamedFlow,{sub:'unnamed-sub',email:'unnamed@example.invalid',name:''});assert.equal(unnamed.result.status,'name');
 const nameCookie=cookie(unnamed.response,'digimium_local_google');assert.equal(cookie(unnamed.response,'digimium_local_customer',false),'');
 assert.deepEqual(await json(await get('/api/customer/google/pending?flow='+unnamedFlow.state,nameCookie)),{status:'name'});
 const [[notYet]]=await db.query('SELECT COUNT(*) AS count FROM digimium_customers WHERE email=?',['unnamed@example.invalid']);assert.equal(notYet.count,0);
 assert.equal((await mutate('/api/customer/google/complete',{name:' '},nameCookie)).status,400);
 const namedResponse=await mutate('/api/customer/google/complete',{name:'ဒေါ်မေ'},nameCookie);const named=await json(namedResponse);assert.equal(named.status,'success');assert.equal(named.customer.name,'ဒေါ်မေ');
 assert.equal((await json(await get('/api/customer/google/pending?flow='+unnamedFlow.state,cookie(namedResponse,'digimium_local_customer')+'; '+cookie(namedResponse,'digimium_local_google_result')))).status,'success','Name completion receipt retains the originating OAuth state');
 assert.equal((await mutate('/api/customer/google/complete',{name:'Other'},nameCookie)).status,400,'Name challenge is single-use');
 const link=await finish(await begin(),{sub:'local-google-sub',email:'local@example.invalid'});assert.equal(link.result.status,'link');assert.equal(cookie(link.response,'digimium_local_customer',false),'');
 const linkCookie=cookie(link.response,'digimium_local_google');assert.deepEqual(await json(await get('/api/customer/google/pending',linkCookie)),{status:'link',email:'local@example.invalid'});
 assert.equal((await mutate('/api/customer/google/complete',{password:localPassword},linkCookie,'https://foreign.invalid')).status,403);
 assert.equal((await mutate('/api/customer/google/complete',{password:'wrong'},linkCookie)).status,400);
 const linkedResponse=await mutate('/api/customer/google/complete',{password:localPassword},linkCookie);const linked=await json(linkedResponse);assert.equal(linked.customer.id,local.customer.id);assert.equal(linked.customer.passwordAvailable,undefined);
 const [[afterHash]]=await db.query('SELECT password_hash FROM digimium_customers WHERE id=?',[local.customer.id]);assert.equal(afterHash.password_hash,beforeHash.password_hash);
 assert.equal((await session(localCookie)).id,local.customer.id,'Linking does not delete another remembered local session');
 assert.equal((await finish(await begin(),{sub:'local-google-sub',email:'local@example.invalid'})).result.customer.id,local.customer.id);
 const bounded=await finish(await begin(),{sub:'bounded-link-sub',email:'local@example.invalid'});const boundedCookie=cookie(bounded.response,'digimium_local_google');
 for(let n=0;n<5;n++)assert.equal((await mutate('/api/customer/google/complete',{password:'incorrect'},boundedCookie)).status,400);
 assert.equal((await mutate('/api/customer/google/complete',{password:localPassword},boundedCookie)).status,409,'Pending password confirmation has a bounded attempt count');
 assert.deepEqual(await json(await get('/api/customer/google/pending',boundedCookie)),{status:'none'});
 const double=await begin();const doubled=await Promise.all([finish(double),finish(double)]);assert.deepEqual(doubled.map(item=>item.result.status).sort(),['error','success']);
 const xss=await finish(await begin(),{sub:'xss-sub',email:'xss@example.invalid',name:'</script><script>alert(1)</script>'});assert.equal(xss.result.status,'success');assert.ok(!xss.html.includes('</script><script>'));
 const conflict=await finish(await begin(),{sub:'impostor-sub',email:'google@example.invalid'});assert.equal(conflict.result.status,'error');assert.equal(conflict.result.error,'account_conflict');
 const cancelled=await finish(await begin(),{sub:'cancel-sub',email:'cancel@example.invalid',name:''});const cancelCookie=cookie(cancelled.response,'digimium_local_google');
 assert.equal((await mutate('/api/customer/google/pending',{},cancelCookie,'https://foreign.invalid','DELETE')).status,403);
 await json(await mutate('/api/customer/google/pending',{},cancelCookie,base.origin,'DELETE'));assert.deepEqual(await json(await get('/api/customer/google/pending',cancelCookie)),{status:'none'});
 const slow=await begin();const lateCallback=finish(slow,{sub:'slow-cancel-sub',email:'slow-cancel@example.invalid'},{delay:1500});
 for(let n=0;;n++){const [rows]=await db.execute('SELECT stage FROM digimium_google_auth_challenges WHERE id_hash=?',[createHash('sha256').update(slow.state).digest()]);if(rows[0]?.stage==='exchanging')break;assert.ok(n<50,'Token exchange did not begin');await delay(20);}
 await json(await mutate('/api/customer/google/pending',{},slow.cookie,base.origin,'DELETE'));
 const stopped=await lateCallback;assert.equal(stopped.result.status,'error');assert.equal(cookie(stopped.response,'digimium_local_customer',false),'','Cancel during token exchange prevents a later session');
 const [[notCreated]]=await db.query('SELECT COUNT(*) AS count FROM digimium_customers WHERE email=?',['slow-cancel@example.invalid']);assert.equal(notCreated.count,0);
 const replaced=await begin();const obsoleteCallback=finish(replaced,{sub:'obsolete-sub',email:'obsolete@example.invalid'},{delay:1500});
 for(let n=0;;n++){const [rows]=await db.execute('SELECT stage FROM digimium_google_auth_challenges WHERE id_hash=?',[createHash('sha256').update(replaced.state).digest()]);if(rows[0]?.stage==='exchanging')break;assert.ok(n<50);await delay(20);}
 const replacement=await begin('account',replaced.cookie);const obsolete=await obsoleteCallback;assert.equal(obsolete.result.status,'error','Starting a new flow revokes an older token exchange');assert.ok(!obsolete.response.headers.getSetCookie().some(value=>value.startsWith('digimium_local_google=')),'Late obsolete callback cannot erase the newer flow cookie');
 const staleCancel=await mutate('/api/customer/google/pending?flow='+replaced.state,{},replacement.cookie,base.origin,'DELETE');await json(staleCancel);assert.deepEqual(staleCancel.headers.getSetCookie(),[],'A stale popup cannot cancel the newer browser flow');
 const replacementResult=await finish(replacement,{sub:'replacement-sub',email:'replacement@example.invalid'});assert.equal(replacementResult.result.status,'success');assert.equal(replacementResult.result.customer.email,'replacement@example.invalid');
 const expiry=await begin();await db.execute('UPDATE digimium_google_auth_challenges SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id_hash=?',[createHash('sha256').update(expiry.state).digest()]);assert.equal((await finish(expiry)).result.status,'error');
 const untouched=await begin();const wrongState=await finish({...untouched,state:randomBytes(32).toString('base64url')});assert.equal(wrongState.result.status,'error');assert.ok(!wrongState.response.headers.getSetCookie().some(value=>value.startsWith('digimium_local_google=')),'Unrelated invalid state does not clobber an active login cookie');assert.equal((await finish(untouched)).result.status,'success');
 const deniedFlow=await begin();const deniedResponse=await get('/api/customer/google/callback?'+new URLSearchParams({state:deniedFlow.state,error:'access_denied'}),deniedFlow.cookie);assert.equal(result(await deniedResponse.text()).error,'cancelled');
 for(const claims of [{iss:'https://evil.invalid'},{aud:'wrong-client'},{azp:'wrong-client'},{nonce:'wrong-nonce'},{email_verified:false},{exp:1},{iat:Math.floor(Date.now()/1000)+3600},{sub:''},{email:'bad email'}]){
  const rejected=await finish(await begin(),claims);assert.equal(rejected.result.status,'error');assert.equal(cookie(rejected.response,'digimium_local_customer',false),'');
 }
 assert.equal((await finish(await begin(),{},{badSignature:true})).result.status,'error');
 assert.equal((await finish(await begin(),{},{remove:['email_verified']})).result.status,'error');
 assert.equal((await finish(await begin(),{},{tokenError:true})).result.status,'error');
 const mismatched=await begin();const forged={...mismatched,cookie:mismatched.cookie.slice(0,60)+'X'+mismatched.cookie.slice(61)};assert.equal((await finish(forged)).result.status,'error');
 const [persisted]=await db.query('SELECT payload FROM digimium_google_auth_challenges');assert.ok(persisted.every(row=>!row.payload.includes('code_verifier')&&!row.payload.includes('@example.invalid')),'Stored pending identities are encrypted');
 console.log('Google integration passed: code+PKCE, encrypted browser-bound one-use state, token validation, session issuance, local password linking, missing-name completion, concurrency, in-flight cancellation, verified completion receipts, expiry and replay denial.');
}finally{
 if(server&&server.exitCode===null&&!server.signalCode){const exit=once(server,'exit');server.kill('SIGTERM');const timeout=setTimeout(()=>server.kill('SIGKILL'),8000);try{await exit;}finally{clearTimeout(timeout);}}
 await db.end();
}
