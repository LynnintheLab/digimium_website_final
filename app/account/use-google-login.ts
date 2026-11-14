'use client';

import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {CommerceCustomer} from '../../lib/commerce-types';

type PendingKind = 'link' | 'name';
type Result = {type?: string; status?: string; customer?: CommerceCustomer; email?: string; error?: string};
type Callbacks = {
  onSuccess: (customer: CommerceCustomer) => void;
  onPending: (kind: PendingKind, email?: string) => void;
  onBusyChange?: (busy: boolean) => void;
};
// Shared across AuthForm mounts in this page: an old instance's response cannot overtake a new instance.
let googleMutations: Promise<unknown> = Promise.resolve();

export function useGoogleLogin(returnTo: 'account' | 'checkout' | 'history', callbacks: Callbacks) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const handlers = useRef(callbacks);
  useLayoutEffect(() => { handlers.current = callbacks; });
  const popup = useRef<Window | null>(null);
  const activeFlow = useRef<string | null>(null);
  const running = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const poll = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Browser cookie headers apply even when a stale response's body is ignored. Keep mutations ordered.
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = googleMutations.catch(() => {}).then(operation);
    googleMutations = result.catch(() => {});
    return result;
  }

  async function discard(flow?: string | null) {
    try {
      await fetch('/api/customer/google/pending' + (flow ? '?flow=' + encodeURIComponent(flow) : ''),
        {method:'DELETE', cache:'no-store', signal:AbortSignal.timeout(15000)});
    } catch { /* A revoked or expired challenge cannot issue a later session. */ }
  }

  function destinationFrom(value?: string) {
    if (!value) return null;
    try {
      const destination = new URL(value);
      const flow = destination.searchParams.get('state');
      return destination.origin === 'https://accounts.google.com' && flow && /^[A-Za-z0-9_-]{43}$/.test(flow)
        ? {destination, flow} : null;
    } catch { return null; }
  }

  function finish() {
    clearInterval(poll.current); clearTimeout(timeout.current);
    running.current = false;
    popup.current?.close(); popup.current = null;
    if (mounted.current) { setBusy(false); handlers.current.onBusyChange?.(false); }
  }

  useEffect(() => {
    mounted.current = true;
    const initialGeneration = generation.current;
    const controller = new AbortController();
    void fetch('/api/customer/google', {cache:'no-store', signal:controller.signal})
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<{enabled:boolean}>; })
      .then(data => { if (mounted.current) { setEnabled(data.enabled === true); if (generation.current === initialGeneration && new URL(window.location.href).searchParams.get('google') === 'error') setError('unavailable'); } })
      .catch(() => { if (!controller.signal.aborted) setEnabled(false); });
    // A reopened form must observe any queued revocation from its previous instance first.
    void googleMutations.catch(() => {}).then(() => controller.signal.aborted ? null
      : fetch('/api/customer/google/pending', {cache:'no-store', signal:controller.signal}))
      .then(async response => { if (!response?.ok) return null; return response.json() as Promise<Result>; })
      .then(data => {
        if (!mounted.current || generation.current !== initialGeneration || !data) return;
        if (data.status === 'success' && data.customer?.id) handlers.current.onSuccess(data.customer);
        else if (data.status === 'link' || data.status === 'name') handlers.current.onPending(data.status, data.email);
      }).catch(() => { /* Ordinary email login remains available. */ });
    function message(event: MessageEvent) {
      const data = event.data as Result | null;
      if (event.origin !== window.location.origin || !popup.current || event.source !== popup.current || data?.type !== 'digimium-google-auth') return;
      generation.current++;
      finish();
      if (data.status === 'success' && typeof data.customer?.id === 'string') handlers.current.onSuccess(data.customer);
      else if (data.status === 'link' || data.status === 'name') handlers.current.onPending(data.status, data.email);
      else setError(data.error || 'unavailable');
    }
    window.addEventListener('message', message);
    return () => {
      mounted.current = false;
      // This is a request-generation counter, not a DOM node ref. Invalidate pending callbacks on unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      controller.abort(); clearInterval(poll.current); clearTimeout(timeout.current);
      window.removeEventListener('message', message); popup.current?.close(); popup.current = null;
      const expected = activeFlow.current;
      activeFlow.current = null;
      if (running.current || expected) void enqueue(() => discard(expected));
      if (running.current) handlers.current.onBusyChange?.(false);
    };
    // The handlers ref always holds the current component callbacks.
  }, []);

  async function start() {
    if (!mounted.current || running.current || !enabled) return;
    const runId = ++generation.current;
    activeFlow.current = null;
    setError('');
    const windowRef = window.open('about:blank', '_blank', 'popup,width=520,height=680');
    if (!windowRef) { setError('popup_blocked'); return; }
    popup.current = windowRef; running.current = true; setBusy(true); handlers.current.onBusyChange?.(true);
    await enqueue(async () => {
      if (!mounted.current || generation.current !== runId || popup.current !== windowRef) return;
      try {
        const response = await fetch('/api/customer/google/start', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({returnTo}), signal:AbortSignal.timeout(15000)});
        const data = await response.json() as {url?:string;error?:string};
        const selected = destinationFrom(data.url);
        if (!mounted.current || generation.current !== runId || popup.current !== windowRef) {
          // Revoke this exact stale start before the next queued start can set its own browser cookie.
          if (selected) await discard(selected.flow);
          return;
        }
        if (!response.ok || !selected) throw new Error(data.error || 'unavailable');
        const {destination, flow:flowId} = selected;
        activeFlow.current = flowId;
        windowRef.location.href = destination.href;
        poll.current = setInterval(() => {
          if (!windowRef.closed || !running.current) return;
          finish();
          // A verified flow receipt, rather than any existing account session, proves this Google attempt completed.
          void fetch('/api/customer/google/pending?flow=' + encodeURIComponent(flowId), {cache:'no-store'}).then(response => response.json() as Promise<Result>)
            .then(data => {
              if (!mounted.current || generation.current !== runId) return;
              if (data.status === 'success' && data.customer?.id) handlers.current.onSuccess(data.customer);
              else if (data.status === 'link' || data.status === 'name') handlers.current.onPending(data.status, data.email);
              else setError('cancelled');
            })
            .catch(() => { if (mounted.current && generation.current === runId) setError('cancelled'); });
        }, 500);
        timeout.current = setTimeout(() => {
          if (!mounted.current || generation.current !== runId) return;
          finish(); setError('expired');
        }, 600000);
      } catch (failure) {
        if (generation.current !== runId) return;
        finish(); if (mounted.current) setError(failure instanceof Error ? failure.message : 'unavailable');
      }
    });
  }

  async function complete(values: {password:string} | {name:string}) {
    if (!mounted.current || running.current) return;
    const runId = ++generation.current;
    running.current = true; setBusy(true); handlers.current.onBusyChange?.(true); setError('');
    await enqueue(async () => {
      if (!mounted.current || generation.current !== runId) return;
      try {
        const response = await fetch('/api/customer/google/complete', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(values), signal:AbortSignal.timeout(15000)});
        const data = await response.json() as Result;
        if (!response.ok || !data.customer?.id) throw new Error(data.error || 'unavailable');
        if (mounted.current && generation.current === runId) handlers.current.onSuccess(data.customer);
      } catch (failure) { if (mounted.current && generation.current === runId) setError(failure instanceof Error ? failure.message : 'unavailable'); }
      finally { if (generation.current === runId) finish(); }
    });
  }

  function cancel() {
    const expected = activeFlow.current;
    activeFlow.current = null;
    generation.current++;
    finish(); if (mounted.current) setError('');
    void enqueue(() => discard(expected));
  }
  return {enabled,busy,error,start,complete,cancel,clearError:()=>setError('')};
}
