'use client';

import { ArrowRight, Bell, Check, CheckCheck, Clock3, Mail, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { CustomerNotificationPage } from '../lib/notification-types';
import type { ShopLanguage } from '../lib/shop-language';
import './customer-notifications.css';

const endpoint = '/api/customer/notifications';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const empty = (): CustomerNotificationPage & { owner: string | null } => ({ owner: null, notifications: [], unreadCount: 0, nextCursor: null });

function isPage(value: unknown): value is CustomerNotificationPage {
  if (!value || typeof value !== 'object') return false;
  const page = value as CustomerNotificationPage;
  return Number.isSafeInteger(page.unreadCount) && page.unreadCount >= 0 &&
    (page.nextCursor === null || typeof page.nextCursor === 'string' && page.nextCursor.length <= 2000) &&
    Array.isArray(page.notifications) && page.notifications.length <= 20 && page.notifications.every(item =>
      item && typeof item.id === 'string' && uuid.test(item.id) && (item.type === 'message' || item.type === 'expiry') &&
      typeof item.title === 'string' && typeof item.body === 'string' &&
      (item.bodyMy === undefined || typeof item.bodyMy === 'string') &&
      typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) &&
      (item.readAt === null || typeof item.readAt === 'string' && Number.isFinite(Date.parse(item.readAt))) &&
      (item.orderId === undefined || typeof item.orderId === 'string' && uuid.test(item.orderId)));
}

/** A confirmed account ID avoids another session lookup on full customer pages. */
export function CustomerNotifications({ lang, customerId, onOpen, onOpenChange }: {
  lang: ShopLanguage; customerId?: string | null; onOpen?: () => void; onOpenChange?: (open: boolean) => void;
}) {
  const t = (en: string, my: string) => lang === 'my' ? my : en;
  const titleId = useId();
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const loadAbort = useRef<AbortController | null>(null);
  const writeAbort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mutation = useRef(false);
  const openRef = useRef(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [authRevision, setAuthRevision] = useState(0);
  const [expiredOwner, setExpiredOwner] = useState<string | null>(null);
  const [data, setData] = useState(empty);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const owner = customerId === undefined ? viewer : customerId;
  const eligible = !!owner && owner !== expiredOwner;
  const open = eligible && openedFor === owner;
  const current = data.owner === owner ? data : empty();
  const waiting = loading || data.owner !== owner && !failed;

  const close = useCallback((restore = true) => {
    openRef.current = false;
    setOpenedFor(null);
    if (restore) trigger.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    function accountChanged() {
      generation.current++;
      loadAbort.current?.abort();
      writeAbort.current?.abort();
      mutation.current = false;
      openRef.current = false;
      setViewer(null);
      setData(empty());
      setExpiredOwner(null);
      setOpenedFor(null);
      setMarking(null);
      setAuthRevision(value => value + 1);
    }
    window.addEventListener('digimium-account-changed', accountChanged);
    const leave = () => { generation.current++; loadAbort.current?.abort(); writeAbort.current?.abort(); setViewer(null); setData(empty()); setOpenedFor(null); };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) accountChanged(); };
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('digimium-account-changed', accountChanged);
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('pageshow', restore);
    };
  }, []);

  useEffect(() => {
    if (customerId !== undefined) return;
    let controller: AbortController | undefined;
    async function confirmAccount() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      const timeout = window.setTimeout(() => request.abort(), 12000);
      try {
        const response = await fetch('/api/customer/session', { cache: 'no-store', signal: request.signal });
        if (!response.ok) return;
        const result = await response.json() as { customer?: { id?: unknown } | null };
        if (request.signal.aborted) return;
        if (typeof result.customer?.id === 'string' && uuid.test(result.customer.id)) setViewer(result.customer.id);
        else if (result.customer === null) setViewer(null);
      } catch { /* An unconfirmed or signed-out visitor makes no notification request. */ }
      finally { window.clearTimeout(timeout); }
    }
    void confirmAccount();
    const visible = () => { if (!document.hidden) void confirmAccount(); };
    const timer = window.setInterval(visible, 60000);
    document.addEventListener('visibilitychange', visible);
    return () => { controller?.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [customerId, authRevision]);

  const load = useCallback(async (cursor?: string) => {
    if (!owner || owner === expiredOwner || mutation.current) return;
    loadAbort.current?.abort();
    const controller = new AbortController();
    loadAbort.current = controller;
    const request = ++generation.current;
    const timeout = window.setTimeout(() => {
      if (request !== generation.current) return;
      setFailed(true); setLoading(false); controller.abort();
    }, 12000);
    try {
      const response = await fetch(endpoint + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), { cache: 'no-store', signal: controller.signal });
      if (controller.signal.aborted || request !== generation.current) return;
      if (response.status === 401) { setData(empty()); setExpiredOwner(owner); close(false); return; }
      if (!response.ok) throw new Error('notifications');
      const result: unknown = await response.json();
      if (!isPage(result)) throw new Error('notifications');
      if (controller.signal.aborted || request !== generation.current) return;
      setFailed(false);
      setData(previous => {
        const existing = cursor && previous.owner === owner ? previous.notifications : [];
        const notifications = Array.from(new Map([...existing, ...result.notifications].map(item => [item.id, item])).values());
        return { owner, notifications, unreadCount: result.unreadCount, nextCursor: result.nextCursor };
      });
    } catch {
      if (!controller.signal.aborted && request === generation.current) setFailed(true);
    } finally {
      window.clearTimeout(timeout);
      if (!controller.signal.aborted && request === generation.current) setLoading(false);
    }
  }, [owner, expiredOwner, close]);

  useEffect(() => {
    if (!eligible) return;
    const startup = window.requestAnimationFrame(() => { void load(); });
    // Refresh the badge in visible tabs; an open reading list never moves under the reader.
    const refresh = () => { if (!document.hidden && !openRef.current) void load(); };
    const timer = window.setInterval(refresh, 60000);
    const visible = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', visible);
    const currentGeneration = generation;
    return () => {
      currentGeneration.current++;
      window.cancelAnimationFrame(startup);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      loadAbort.current?.abort();
      writeAbort.current?.abort();
      mutation.current = false;
    };
  }, [eligible, load, authRevision]);

  useEffect(() => {
    openRef.current = open;
    onOpenChange?.(open);
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    function outside(event: PointerEvent | FocusEvent) {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) close(false);
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open, close, onOpenChange]);

  async function markRead(id?: string) {
    if (!owner || mutation.current) return;
    mutation.current = true;
    loadAbort.current?.abort();
    const request = ++generation.current;
    const controller = new AbortController();
    writeAbort.current = controller;
    const activeAction = document.activeElement;
    const timeout = window.setTimeout(() => {
      if (request !== generation.current) return;
      setFailed(true); controller.abort();
    }, 12000);
    setLoading(false);
    setMarking(id ?? 'all');
    setFailed(false);
    try {
      const response = await fetch(endpoint, { method: 'PATCH', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? { ids: [id] } : { all: true }) });
      if (controller.signal.aborted || request !== generation.current) return;
      if (response.status === 401) { setData(empty()); setExpiredOwner(owner); close(false); return; }
      if (!response.ok) throw new Error('read');
      const result = await response.json() as { unreadCount?: unknown };
      if (!Number.isSafeInteger(result.unreadCount) || (result.unreadCount as number) < 0) throw new Error('read');
      if (controller.signal.aborted || request !== generation.current) return;
      // Update only after the owner-scoped server mutation succeeds; never invent a badge count.
      const readAt = new Date().toISOString();
      setData(previous => previous.owner === owner ? { ...previous, unreadCount: result.unreadCount as number,
        notifications: previous.notifications.map(item => !id || item.id === id ? { ...item, readAt: item.readAt ?? readAt } : item) } : previous);
      if (openRef.current && document.activeElement === activeAction) window.requestAnimationFrame(() => {
        if (openRef.current && (document.activeElement === activeAction || document.activeElement === document.body)) panel.current?.focus({ preventScroll: true });
      });
    } catch {
      if (!controller.signal.aborted && request === generation.current) setFailed(true);
    } finally {
      window.clearTimeout(timeout);
      if (request === generation.current) { mutation.current = false; setMarking(null); }
    }
  }

  function toggle() {
    if (open) { close(); return; }
    onOpen?.();
    openRef.current = true;
    setOpenedFor(owner ?? null);
    if (!mutation.current) { setLoading(true); setFailed(false); void load(); }
  }

  function requestPage(cursor?: string) { setLoading(true); setFailed(false); void load(cursor); }

  if (!eligible) return null;
  const unreadLabel = t(`${current.unreadCount} unread`, `မဖတ်ရသေးသော စာ ${current.unreadCount} ခု`);
  return <div className="customer-notifications" ref={wrapper}>
    <button ref={trigger} className="customer-notifications-trigger" type="button"
      aria-label={t('Notifications', 'အသိပေးချက်များ') + (current.unreadCount ? ' · ' + unreadLabel : '')}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
      <Bell size={20} aria-hidden="true"/>
      {current.unreadCount > 0 && <span className="customer-notifications-badge" aria-hidden="true">{current.unreadCount > 99 ? '99+' : current.unreadCount}</span>}
    </button>
    {open && <div id={panelId} ref={panel} className="customer-notifications-panel" role="dialog" aria-labelledby={titleId} tabIndex={-1}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
      <div className="customer-notifications-heading"><h2 id={titleId}>{t('Notifications', 'အသိပေးချက်များ')}</h2>
        <button className="customer-notifications-close" type="button" onClick={() => close()} aria-label={t('Close notifications', 'အသိပေးချက် ပိတ်ရန်')}><X size={20} aria-hidden="true"/></button>
      </div>
      <div className="customer-notifications-toolbar">
        <span aria-live="polite">{data.owner !== owner ? failed ? t('Couldn’t check notifications', 'အသိပေးချက်များကို စစ်ဆေး၍ မရပါ') : t('Checking notifications…', 'အသိပေးချက်များကို စစ်ဆေးနေပါတယ်…') : current.unreadCount ? unreadLabel : t('All caught up', 'အားလုံး ဖတ်ပြီးပါပြီ')}</span>
        {current.unreadCount > 0 && <button type="button" disabled={!!marking} onClick={() => void markRead()}><CheckCheck size={17} aria-hidden="true"/>{marking === 'all' ? t('Saving…', 'မှတ်သားနေပါတယ်…') : t('Mark all read', 'အားလုံး ဖတ်ပြီးအဖြစ် မှတ်မည်')}</button>}
      </div>
      <div className="customer-notifications-scroll" aria-busy={waiting}>
        {failed && <div className="customer-notifications-error" role="alert"><p>{t('Couldn’t update notifications. Please try again.', 'အသိပေးချက်များကို ပြန်လည်ဖော်ပြ၍ မရပါ။ ပြန်ကြိုးစားပါ။')}</p><button type="button" disabled={waiting || !!marking} onClick={() => requestPage()}><RefreshCw size={16} aria-hidden="true"/>{t('Retry', 'ပြန်ကြိုးစားရန်')}</button></div>}
        {!current.notifications.length && !failed && <p className="customer-notifications-empty" role="status">{waiting ? t('Loading notifications…', 'အသိပေးချက်များကို ဖော်ပြနေပါတယ်…') : t('No notifications yet. Messages from Digimium and plan-expiry reminders will appear here.', 'အသိပေးချက် မရှိသေးပါ။ ဆိုင်မှ စာများနဲ့ Plan သက်တမ်းသတိပေးချက်များကို ဒီမှာ ကြည့်နိုင်ပါတယ်။')}</p>}
        {!!current.notifications.length && <ul className="customer-notifications-list">{current.notifications.map(item => <li key={item.id} data-unread={item.readAt === null || undefined}>
          <span className="customer-notification-icon" aria-hidden="true">{item.type === 'expiry' ? <Clock3 size={20}/> : <Mail size={20}/>}</span>
          <div className="customer-notification-copy"><h3>{item.type === 'expiry' ? t('Subscription ending soon', 'Plan သက်တမ်း ကုန်ဆုံးတော့မည်') : t('Message from Digimium', 'Digimium မှ စာ')}</h3>
            <p dir="auto">{lang === 'my' && item.bodyMy ? item.bodyMy : item.body}</p>
            <time dateTime={item.createdAt}>{new Intl.DateTimeFormat(lang === 'my' ? 'my-MM' : 'en-GB', { numberingSystem: 'latn', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Yangon' }).format(new Date(item.createdAt))}</time>
            {item.readAt === null && <span className="customer-notification-unread">{t('Unread', 'မဖတ်ရသေး')}</span>}
            <div className="customer-notification-actions">
              {item.orderId && <a href="/order-history">{t('View order history', 'အော်ဒါမှတ်တမ်း ကြည့်ရန်')}<ArrowRight size={15} aria-hidden="true"/></a>}
              {item.readAt === null ? <button type="button" disabled={!!marking} onClick={() => void markRead(item.id)}><Check size={16} aria-hidden="true"/>{marking === item.id ? t('Saving…', 'မှတ်သားနေပါတယ်…') : t('Mark read', 'ဖတ်ပြီးအဖြစ် မှတ်မည်')}</button> : <span className="customer-notification-read"><Check size={15} aria-hidden="true"/>{t('Read', 'ဖတ်ပြီး')}</span>}
            </div>
          </div>
        </li>)}</ul>}
        {current.nextCursor && <button className="customer-notifications-more" type="button" disabled={waiting || !!marking} onClick={() => requestPage(current.nextCursor ?? undefined)}>{waiting ? t('Loading…', 'ဖော်ပြနေပါတယ်…') : t('Load more', 'ထပ်ကြည့်ရန်')}</button>}
      </div>
      <a className="customer-notifications-history" href="/order-history">{t('Order history', 'ဝယ်ယူမှု မှတ်တမ်း')}<ArrowRight size={17} aria-hidden="true"/></a>
    </div>}
  </div>;
}
