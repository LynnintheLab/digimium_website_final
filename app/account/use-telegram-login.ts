'use client';

import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {CommerceCustomer} from '../../lib/commerce-types';

export type TelegramChallenge = {flow:string;code:string;url:string;expiresAt:string};
export type TelegramLoginStatus = 'idle' | 'starting' | 'waiting' | 'approved' | 'rejected' | 'expired' | 'error';
type TelegramResult = Partial<TelegramChallenge> & {status?:string;customer?:CommerceCustomer;error?:string};
type Callbacks = {onSuccess:(customer:CommerceCustomer)=>void;onBusyChange?:(busy:boolean)=>void};
// Keep cookie-mutating responses ordered even when AuthForm is unmounted and reopened in this page.
let telegramMutations:Promise<unknown> = Promise.resolve();

function challengeFrom(value:TelegramResult):TelegramChallenge | null {
  if (typeof value.flow !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.flow) || typeof value.code !== 'string' || !/^\d{4}$/.test(value.code) || typeof value.url !== 'string' || typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt))) return null;
  try {
    const link = new URL(value.url);
    if (link.origin !== 'https://t.me' || !/^\/[A-Za-z0-9_]{5,32}$/.test(link.pathname) || link.searchParams.get('start') !== 'login_' + value.flow || link.username || link.password || link.hash) return null;
  } catch { return null; }
  return {flow:value.flow,code:value.code,url:value.url,expiresAt:value.expiresAt};
}

export function useTelegramLogin(returnTo:'account'|'checkout'|'history',callbacks:Callbacks,options:{autoResume?:boolean}={}) {
  const [enabled,setEnabled] = useState<boolean|null>(null);
  const [active,setActive] = useState(false);
  const [busy,setBusy] = useState(false);
  const [status,setStatus] = useState<TelegramLoginStatus>('idle');
  const [challenge,setChallenge] = useState<TelegramChallenge|null>(null);
  const [error,setError] = useState('');
  const [clock,setClock] = useState(()=>Date.now());
  const handlers = useRef(callbacks);
  useLayoutEffect(()=>{handlers.current=callbacks;});
  const mounted = useRef(true);
  const generation = useRef(0);
  const currentChallenge = useRef<TelegramChallenge|null>(null);
  const currentStatus = useRef<TelegramLoginStatus>('idle');
  const isActive = useRef(false);
  const networkBusy = useRef(false);
  const initialPending = useRef(options.autoResume!==false);
  const initialController = useRef<AbortController|null>(null);
  const pollController = useRef<AbortController|null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const failures = useRef(0);

  // Start/cancel/complete share a queue: an old response cannot overwrite a newer binding cookie.
  function enqueue<T>(operation:()=>Promise<T>):Promise<T> {
    const result=telegramMutations.catch(()=>{}).then(operation);
    telegramMutations=result.catch(()=>{});
    return result;
  }
  function publishStatus(next:TelegramLoginStatus) {currentStatus.current=next;if(mounted.current)setStatus(next);}
  function publishBusy(next:boolean) {
    networkBusy.current=next;
    if(mounted.current){setBusy(next);handlers.current.onBusyChange?.(next);}
  }
  function stopPolling() {
    clearTimeout(pollTimer.current);
    pollController.current?.abort();pollController.current=null;
  }
  function isCurrent(run:number,flow?:string) {return mounted.current && generation.current===run && (!flow || currentChallenge.current?.flow===flow);}
  function success(customer:CommerceCustomer,run:number) {
    if(!isCurrent(run))return;
    generation.current++;stopPolling();currentChallenge.current=null;isActive.current=false;
    setChallenge(null);setActive(false);publishStatus('idle');publishBusy(false);setError('');
    handlers.current.onSuccess(customer);
  }
  async function discard(flow?:string) {
    try {await fetch('/api/customer/telegram/pending'+(flow?'?flow='+encodeURIComponent(flow):''),{method:'DELETE',cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{/* A cancelled/expired request cannot authenticate without browser completion. */}
  }
  function schedulePoll(run:number,flow:string,delay=2000) {
    clearTimeout(pollTimer.current);
    if(!isCurrent(run,flow)||document.hidden||currentStatus.current!=='waiting')return;
    pollTimer.current=setTimeout(()=>{void poll(run,flow);},delay);
  }
  async function complete(run:number,flow:string) {
    if(!isCurrent(run,flow))return;
    publishStatus('approved');publishBusy(true);setError('');
    await enqueue(async()=>{
      if(!isCurrent(run,flow))return;
      try {
        const response=await fetch('/api/customer/telegram/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({flow}),cache:'no-store',signal:AbortSignal.timeout(15000)});
        const data=await response.json() as TelegramResult;
        if(!isCurrent(run,flow))return;
        if(response.ok && typeof data.customer?.id==='string'){success(data.customer,run);return;}
        if(!data.error||data.error==='unavailable'){
          publishStatus('waiting');publishBusy(false);setError('connection');schedulePoll(run,flow,3000);return;
        }
        setError(data.error);publishStatus(data.error==='expired'?'expired':'error');publishBusy(false);
      } catch {
        if(!isCurrent(run,flow))return;
        // A lost response may already have created the session; only this flow's receipt can recover it.
        publishStatus('waiting');publishBusy(false);setError('connection');schedulePoll(run,flow,3000);
      }
    });
  }
  async function poll(run:number,flow:string) {
    if(!isCurrent(run,flow)||document.hidden||currentStatus.current!=='waiting')return;
    const controller=new AbortController();pollController.current=controller;
    try {
      const response=await fetch('/api/customer/telegram/pending?flow='+encodeURIComponent(flow),{cache:'no-store',signal:controller.signal});
      const data=await response.json() as TelegramResult;
      if(controller.signal.aborted||!isCurrent(run,flow)||currentStatus.current!=='waiting')return;
      if(!response.ok){setError(data.error||'unavailable');publishStatus('error');return;}
      failures.current=0;setError('');
      if(data.status==='success'&&typeof data.customer?.id==='string'){success(data.customer,run);return;}
      if(data.status==='approved'){void complete(run,flow);return;}
      if(data.status==='rejected'||data.status==='expired'){publishStatus(data.status);return;}
      if(data.status!=='waiting'){setError('cancelled');publishStatus('error');return;}
      schedulePoll(run,flow);
    } catch {
      if(controller.signal.aborted||!isCurrent(run,flow))return;
      failures.current++;setError('connection');schedulePoll(run,flow,Math.min(8000,2000+failures.current*2000));
    } finally {if(pollController.current===controller)pollController.current=null;}
  }

  useEffect(()=>{
    mounted.current=true;
    const run=generation.current;
    const controller=new AbortController();initialController.current=controller;
    const capabilityController=new AbortController();
    void fetch('/api/customer/telegram',{cache:'no-store',signal:capabilityController.signal})
      .then(async response=>response.ok?response.json() as Promise<{enabled?:boolean}>:null)
      .then(data=>{if(mounted.current)setEnabled(data?.enabled===true);})
      .catch(()=>{if(!capabilityController.signal.aborted&&mounted.current)setEnabled(false);});
    // A reopened form must not resume a challenge while its prior instance is still revoking it.
    if(initialPending.current)void telegramMutations.catch(()=>{}).then(()=>controller.signal.aborted?null
      :fetch('/api/customer/telegram/pending',{cache:'no-store',signal:controller.signal}))
      .then(async response=>response?.ok?response.json() as Promise<TelegramResult>:null)
      .then(data=>{
        if(!isCurrent(run)||!data)return;
        if(data.status==='success'&&typeof data.customer?.id==='string'){success(data.customer,run);return;}
        const resumed=challengeFrom(data);
        if(!resumed || !['waiting','approved','rejected','expired'].includes(data.status||''))return;
        currentChallenge.current=resumed;isActive.current=true;setChallenge(resumed);setActive(true);setClock(Date.now());
        publishStatus(data.status==='rejected'?'rejected':data.status==='expired'?'expired':'waiting');
        if(data.status==='approved')void complete(run,resumed.flow);else schedulePoll(run,resumed.flow,0);
      }).catch(()=>{/* Email and Google remain available. */})
      .finally(()=>{initialPending.current=false;});
    function visibility() {
      if(document.hidden){stopPolling();return;}
      setClock(Date.now());
      const current=currentChallenge.current;
      if(current)schedulePoll(generation.current,current.flow,0);
    }
    document.addEventListener('visibilitychange',visibility);
    return ()=>{
      mounted.current=false;
      // Request-generation counters deliberately invalidate every async callback on unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      controller.abort();capabilityController.abort();stopPolling();document.removeEventListener('visibilitychange',visibility);
      const flow=currentChallenge.current?.flow;
      if(isActive.current)void enqueue(()=>discard(flow));
      if(networkBusy.current)handlers.current.onBusyChange?.(false);
    };
    // The mount subscription only reads ref-backed handlers/current flow; resubscribing would cancel a live sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    if(!active||!challenge||status!=='waiting')return;
    const expires=Date.parse(challenge.expiresAt);
    function tick(){if(!mounted.current||document.hidden)return;const now=Date.now();setClock(now);if(now>=expires){stopPolling();publishStatus('expired');}}
    const timer=setInterval(tick,1000);
    return ()=>clearInterval(timer);
  },[active,challenge,status]);

  async function start() {
    if(!mounted.current||!enabled||networkBusy.current)return;
    const run=++generation.current;
    const oldFlow=currentChallenge.current?.flow;
    initialController.current?.abort();initialPending.current=false;stopPolling();
    currentChallenge.current=null;isActive.current=true;setChallenge(null);setActive(true);setError('');publishStatus('starting');publishBusy(true);
    await enqueue(async()=>{
      if(oldFlow)await discard(oldFlow);
      if(!isCurrent(run))return;
      try {
        const response=await fetch('/api/customer/telegram/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnTo}),cache:'no-store',signal:AbortSignal.timeout(15000)});
        const data=await response.json() as TelegramResult;
        const created=challengeFrom(data);
        if(!isCurrent(run)){if(created)await discard(created.flow);return;}
        if(!response.ok||!created)throw new Error(data.error||'unavailable');
        currentChallenge.current=created;setChallenge(created);setClock(Date.now());failures.current=0;publishStatus('waiting');publishBusy(false);schedulePoll(run,created.flow,0);
      }catch(failure){if(isCurrent(run)){setError(failure instanceof Error && ['invalid','origin','rate_limited','expired','cancelled','unavailable'].includes(failure.message)?failure.message:'unavailable');publishStatus('error');publishBusy(false);}}
    });
  }
  function cancel() {
    const flow=currentChallenge.current?.flow;
    const needsDiscard=isActive.current||initialPending.current||Boolean(flow);
    generation.current++;initialController.current?.abort();initialPending.current=false;stopPolling();
    currentChallenge.current=null;isActive.current=false;
    if(mounted.current){setChallenge(null);setActive(false);setError('');}
    publishStatus('idle');publishBusy(false);
    if(needsDiscard)void enqueue(()=>discard(flow));
  }
  const secondsLeft=challenge?Math.max(0,Math.min(300,Math.ceil((Date.parse(challenge.expiresAt)-clock)/1000))):300;
  return {enabled,active,busy,status,challenge,error,secondsLeft,start,refresh:start,cancel,clearError:()=>setError('')};
}

export type TelegramLoginController=ReturnType<typeof useTelegramLogin>;
