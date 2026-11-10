import assert from 'node:assert/strict';
import {authorizeAdmin, isSameOriginMutation} from '../lib/admin-auth-policy.ts';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5185';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('Run mutation checks only against a local preview.');
const user={userId:'test',email:'Owner@example.test',displayName:'Owner',fullName:null};
assert.equal(authorizeAdmin(null,'Owner@example.test').status,401);
assert.equal(authorizeAdmin(user,undefined).status,403);
assert.equal(authorizeAdmin(user,'attacker@example.test').status,403);
assert.equal(authorizeAdmin(user,' owner@example.test ').ok,true);
assert.equal(authorizeAdmin({...user,email:'other@example.test'},'owner@example.test').status,403);
assert.equal(isSameOriginMutation(new Request(base,{headers:{origin:base}})),true);
assert.equal(isSameOriginMutation(new Request(base)),false);
assert.equal(isSameOriginMutation(new Request(base,{headers:{origin:'https://elsewhere.test'}})),false);
const auth={Cookie:'__sites_local_auth=1'};
async function get(path,headers={}){const r=await fetch(base+path,{headers,redirect:'manual'});let value;try{value=await r.json()}catch{value=null}return {status:r.status,value,headers:r.headers};}
async function put(payload,extra={}){const r=await fetch(base+'/api/admin/catalog',{method:'PUT',headers:{...auth,'content-type':'application/json',origin:base,...extra},body:JSON.stringify(payload)});const raw=await r.text();let value;try{value=JSON.parse(raw)}catch{value={error:raw}}return {status:r.status,value};}
assert.equal((await get('/api/admin/catalog')).status,401);
assert.equal((await get('/api/admin/catalog',{'oai-authenticated-user-id':'fake','oai-authenticated-user-email':'seedy@sites.test'})).status,401,'Client headers cannot impersonate local auth');
const read=await get('/api/admin/catalog',auth);assert.equal(read.status,200,JSON.stringify(read.value));const original=structuredClone(read.value);let current=structuredClone(original);
const payload=(catalog)=>({expectedRevision:catalog.revision,products:catalog.products,settings:catalog.settings});
assert.equal((await put(payload(current),{origin:'https://elsewhere.test'})).status,403);
assert.equal((await put(payload(current),{origin:''})).status,403);
assert.equal((await put(payload(current),{'content-type':'text/plain'})).status,415);
const bad=structuredClone(current);bad.products[0].name='<script>alert(1)</script>';assert.equal((await put(payload(bad))).status,400);
const duplicate=structuredClone(current);duplicate.products.push(duplicate.products[0]);assert.equal((await put(payload(duplicate))).status,400);
const badPhone=structuredClone(current);badPhone.settings.viber='javascript:alert(1)';assert.equal((await put(payload(badPhone))).status,400);
try{
 const edited=structuredClone(current);edited.products[0].name='Local QA service';edited.products[0].price='25,000 MMK';edited.products[0].duration='1 month';edited.products[0].availability='available';edited.products[1].published=false;
 const saved=await put(payload(edited));assert.equal(saved.status,200,JSON.stringify(saved.value));current=saved.value;assert.equal(current.revision,original.revision+1);
 const after=await get('/api/admin/catalog',auth);assert.equal(after.value.products[0].price,'25,000 MMK');
 const storefront=await get('/api/catalog');assert.equal(storefront.value.products.some(p=>p.id===edited.products[1].id),false);assert.equal(storefront.value.products[0].name,'Local QA service');
 const html=await (await fetch(base)).text();assert.ok(html.includes('Local QA service'));assert.ok(html.includes('25,000 MMK'));assert.ok(html.includes('1 month'));
 assert.equal((await put(payload(original))).status,409,'Stale updates are rejected');
 const concurrent=await Promise.all([put(payload(current)),put(payload(current))]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);current=concurrent.find(r=>r.status===200).value;
 console.log('PASS: admin authorization, CSRF, input validation, persistent save, storefront visibility, pricing, stale revision, atomic concurrent writes.');
}finally{
 const latest=await get('/api/admin/catalog',auth);
 const restored=await put({expectedRevision:latest.value.revision,products:original.products,settings:original.settings});assert.equal(restored.status,200,'Restore local catalog');
 console.log('Local catalog content restored.');
}
