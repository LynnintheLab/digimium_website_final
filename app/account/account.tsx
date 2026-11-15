"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, LogOut, RefreshCw, Settings2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { telegramDraft } from "@/lib/cart-order";
import { orderTelegramMessages } from "@/lib/order-telegram";
import type { CommerceCustomer as Customer, CommerceOrder } from "@/lib/commerce-types";
import type { ShopLanguage } from "@/lib/shop-language";
import { durationText, priceText } from "@/lib/shop-language";
import { AuthForm } from "./auth-form";
export { CheckoutAuth } from "./auth-form";
import { SubscriptionTerm } from "./subscription-term";
import { MobileDock } from "../mobile-dock";

type AccountProps = { lang: ShopLanguage; checkout?: boolean; embedded?: boolean; history?: boolean; resumeGoogle?: boolean; googleReturnTo?: "checkout" | "account" | "history"; onClose?: () => void };
type Translate = (en: string, my: string) => string;

const sessionPath = "/api/customer/session";

function PasswordForm({ t, onUpdated, onSignedOut }: { t: Translate; onUpdated: (person: Customer) => void; onSignedOut: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaved(false);
    setError("");
    if (values.get("newPassword") !== values.get("confirmPassword")) {
      setError(t("The new passwords don’t match.", "စကားဝှက်အသစ် နှစ်ခု မတူပါ။"));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(sessionPath, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ currentPassword: values.get("currentPassword"), newPassword: values.get("newPassword") }),
      });
      const result = await response.json() as { customer?: Customer; error?: string };
      if (response.ok && result.customer) {
        onUpdated(result.customer);
        form.reset();
        setSaved(true);
        return;
      }
      if (response.status === 401) { onSignedOut(); return; }
      const messages: Record<string, string> = {
        current_password: t("The current password is incorrect.", "လက်ရှိ စကားဝှက် မှားနေပါတယ်။"),
        invalid: t("Use at least 10 characters for your new password.", "စကားဝှက်အသစ်အတွက် အနည်းဆုံး စာလုံး ၁၀ လုံး သုံးပါ။"),
        rate_limited: t("Too many attempts. Try again in 15 minutes.", "အကြိမ်ရေ များသွားပါတယ်။ ၁၅ မိနစ်နောက် ပြန်ကြိုးစားပါ။"),
      };
      setError(messages[result.error ?? ""] ?? t("Couldn’t update your password. Try again.", "စကားဝှက်ကို ပြောင်း၍ မရပါ။ ပြန်ကြိုးစားပါ။"));
    } catch { setError(t("Couldn’t connect. Check your connection and try again.", "ချိတ်ဆက်၍ မရပါ။ အင်တာနက် စစ်ဆေးပြီး ပြန်ကြိုးစားပါ။")); }
    finally { setBusy(false); }
  }

  return <details className="customer-password">
    <summary>{t("Change password", "စကားဝှက် ပြောင်းရန်")}<ChevronDown size={16} aria-hidden /></summary>
    <form onSubmit={updatePassword}>
      <fieldset disabled={busy}>
        <label>{t("Current password", "လက်ရှိ စကားဝှက်")}<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={256}/></label>
        <label>{t("New password", "စကားဝှက်အသစ်")}<input name="newPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={256}/></label>
        <small>{t("Use at least 10 characters.", "အနည်းဆုံး စာလုံး ၁၀ လုံး သုံးပါ။")}</small>
        <label>{t("Confirm new password", "စကားဝှက်အသစ် ထပ်ဖြည့်ပါ")}<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={256}/></label>
        {error && <p className="customer-error" role="alert">{error}</p>}
        {saved && <p role="status">{t("Password updated.", "စကားဝှက် ပြောင်းပြီးပါပြီ။")}</p>}
        <button className="customer-primary" type="submit">{busy ? t("Updating…", "ပြောင်းနေပါတယ်…") : t("Update password", "စကားဝှက် ပြောင်းမည်")}</button>
      </fieldset>
    </form>
  </details>;
}

function formatDate(value: string, lang: ShopLanguage, dateOnly = false) {
  return new Intl.DateTimeFormat(lang === "my" ? "my-MM" : "en-GB", {
    dateStyle: "medium", ...(dateOnly ? { timeZone: "UTC" } : {}),
  }).format(new Date(dateOnly ? value + "T00:00:00Z" : value));
}

function PendingTelegram({ order, customer, telegram, lang, t, embedded, onClose }: {
  order: CommerceOrder; customer: Customer; telegram: string; lang: ShopLanguage; t: Translate; embedded: boolean; onClose?: () => void;
}) {
  const messages = orderTelegramMessages(order, customer, lang);
  const fullText = messages.join("\n\n");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopyStatus("copied");
    } catch { setCopyStatus("manual"); }
  }

  return <div className="customer-telegram">
    <div className="customer-telegram-actions">
      {messages.map((message, index) => {
        const url = telegramDraft(telegram, message);
        if (!url) return null;
        const label = messages.length === 1 ? t("Open in Telegram", "Telegram မှာ ဖွင့်ရန်")
          : t(`Open part ${index + 1} of ${messages.length} in Telegram`, `အပိုင်း ${index + 1} / ${messages.length} ကို Telegram မှာ ဖွင့်ရန်`);
        return <a key={index} className="customer-telegram-link" href={url} target="_blank" rel="noopener noreferrer">{label}<ArrowUpRight size={16} aria-hidden /></a>;
      })}
      {!telegram && <a className="customer-telegram-link" href={embedded ? "#contact" : "/#contact"} onClick={onClose}>{t("Contact Digimium", "Digimium ကို ဆက်သွယ်ရန်")}</a>}
      <button type="button" onClick={copyMessage}>{t("Copy order message", "အော်ဒါစာ ကူးယူရန်")}</button>
    </div>
    {copyStatus === "copied" && <p role="status">{t("Order message copied.", "အော်ဒါစာကို ကူးယူပြီးပါပြီ။")}</p>}
    {copyStatus === "manual" && <label>{t("Select and copy your order message.", "အော်ဒါစာကို ရွေးပြီး ကူးယူပါ။")}<textarea readOnly rows={5} value={fullText} onFocus={event => event.currentTarget.select()}/></label>}
  </div>;
}

function OrderCard({ order, lang, t, customer, telegram, embedded, onClose }: {
  order: CommerceOrder; lang: ShopLanguage; t: Translate; customer: Customer; telegram: string; embedded: boolean; onClose?: () => void;
}) {
  const approved = order.status === "approved";
  return <article className="customer-order" data-status={order.status}>
    <div className="customer-order-meta">
      <div><h3>{t("Order", "အော်ဒါ")} <bdi>#{order.id.slice(0, 8).toUpperCase()}</bdi></h3>
        <time dateTime={order.createdAt}>{formatDate(order.createdAt, lang)}</time></div>
      <span className="customer-order-status">{approved ? t("Approved", "အတည်ပြုပြီး") : t("Pending", "စောင့်ဆိုင်းဆဲ")}</span>
    </div>
    <ul className="customer-lines">{order.lines.map(line => <li key={line.id}>
      <div className="customer-item-title">
        <strong>{line.productName}</strong><span>{t("Qty", "အရေအတွက်")} {line.quantity}</span>
      </div>
      {line.planName && <p className="customer-item-plan">{line.planName}</p>}
      <div className="customer-item-meta">{line.duration && <span>{durationText(line.duration, lang)}</span>}
        {line.price && <span className="customer-unit-price"><small>{t("Each", "တစ်ခုလျှင်")}</small><strong>{priceText(line.price, lang)}</strong></span>}</div>
      {approved && <>
        <SubscriptionTerm startDate={line.startDate} endDate={line.endDate} lang={lang} />
        {!embedded && line.accountInfo && <details className="customer-delivery"><summary>{t("Previously saved account details", "ယခင်သိမ်းထားသော အကောင့်အချက်အလက်")}<ChevronDown size={16} aria-hidden /></summary>
          <p dir="auto">{line.accountInfo}</p>
        </details>}
      </>}
    </li>)}</ul>
    {order.totalMmk !== null && <div className="customer-total"><span>{t("Order total", "စုစုပေါင်း")}</span><strong>{priceText(order.totalMmk.toLocaleString("en-US") + " MMK", lang)}</strong></div>}
    {!approved && <PendingTelegram order={order} customer={customer} telegram={telegram} lang={lang} t={t} embedded={embedded} onClose={onClose} />}
  </article>;
}

function RecentOrders({ orders, lang, t, brief = false, onClose }: { orders: CommerceOrder[]; lang: ShopLanguage; t: Translate; brief?: boolean; onClose?: () => void }) {
  const recent = orders.flatMap(order => order.lines.map(line => ({ orderId: order.id, line }))).slice(0, brief ? 2 : 3);
  return <section className="customer-section customer-recent" aria-labelledby="order-history">
    <div className="customer-heading"><h2 id="order-history">{brief ? t("Recent purchases", "လတ်တလော ဝယ်ယူမှုများ") : t("Order history", "အော်ဒါမှတ်တမ်း")}</h2>
      <Link className="customer-history-link" href="/order-history" onClick={onClose}>{t("View all orders", "အားလုံးကြည့်ရန်")}<ArrowRight size={15} aria-hidden /></Link>
    </div>
    {recent.length ? <ul className="customer-recent-list">{recent.map(({ orderId, line }) => <li key={`${orderId}-${line.id}`} className={brief ? "customer-recent-brief" : undefined}>
      <div className="customer-recent-copy"><div className="customer-item-title"><strong title={brief ? line.productName : undefined}>{line.productName}</strong>{line.quantity > 1 && <span>{t("Qty", "အရေအတွက်")} {line.quantity}</span>}</div>
        {line.planName && <p className="customer-item-plan" title={brief ? line.planName : undefined}>{line.planName}</p>}
        {!brief && line.duration && <p className="customer-item-duration">{durationText(line.duration, lang)}</p>}
      </div>
      <SubscriptionTerm startDate={line.startDate} endDate={line.endDate} lang={lang} compact />
    </li>)}</ul> : <p className="customer-empty">{t("Approved orders and subscription dates will appear here.", "အော်ဒါ အတည်ပြုပြီးရင် ဝယ်ယူမှုမှတ်တမ်းနဲ့ ဝန်ဆောင်မှုသက်တမ်းကို ဒီမှာ ကြည့်နိုင်ပါတယ်။")}</p>}
  </section>;
}

function AccountDetails({ customer, lang, t }: { customer: Customer; lang: ShopLanguage; t: Translate }) {
  return <dl className="customer-profile-details">
    <div><dt>{t("Email", "အီးမေးလ်")}</dt><dd>{customer.email ? <bdi>{customer.email}</bdi> : <span className="customer-profile-missing">{t("Not provided", "ထည့်ထားခြင်း မရှိပါ")}</span>}</dd></div>
    <div><dt>Telegram</dt><dd>{customer.telegram?.username ? <bdi>@{customer.telegram.username}</bdi> : <span className="customer-profile-missing">{customer.telegram ? t("No username", "Username မရှိပါ") : t("Not connected", "ချိတ်ထားခြင်း မရှိပါ")}</span>}</dd></div>
    {customer.telegram && <div><dt>Telegram ID</dt><dd><bdi>{customer.telegram.id}</bdi></dd></div>}
    <div><dt>{t("Joined", "ဖွင့်သည့်နေ့")}</dt><dd><time dateTime={customer.createdAt}>{formatDate(customer.createdAt, lang)}</time></dd></div>
  </dl>;
}

function PendingPreview({ orders, lang, t, onClose }: { orders: CommerceOrder[]; lang: ShopLanguage; t: Translate; onClose?: () => void }) {
  const number = (value: number) => new Intl.NumberFormat(lang === "my" ? "my-MM" : "en-GB").format(value);
  return <section className="customer-section customer-pending-preview" aria-labelledby="pending-orders">
    <div className="customer-heading"><h2 id="pending-orders">{t("Pending orders", "စောင့်ဆိုင်းဆဲ အော်ဒါများ")} <span className="customer-section-count">{number(orders.length)}</span></h2>
      <Link className="customer-history-link" href="/order-history" onClick={onClose}>{t("View all", "အားလုံးကြည့်ရန်")}<ArrowRight size={15} aria-hidden /></Link>
    </div>
    {orders.length ? <ul className="customer-pending-list">{orders.slice(0, 2).map(order => <li key={order.id}>
      <div className="customer-pending-item-heading"><strong><bdi>#{order.id.slice(0, 8).toUpperCase()}</bdi></strong><time dateTime={order.createdAt}>{formatDate(order.createdAt, lang)}</time></div>
      <div className="customer-pending-item-meta"><p>{order.lines.slice(0, 2).map(line => line.productName).join(" · ")}{order.lines.length > 2 && <span> +{number(order.lines.length - 2)}</span>}</p>{order.totalMmk !== null && <strong>{priceText(order.totalMmk.toLocaleString("en-US") + " MMK", lang)}</strong>}</div>
    </li>)}</ul> : <p className="customer-empty">{t("No orders are awaiting approval.", "အတည်ပြုရန် စောင့်ဆိုင်းနေသော အော်ဒါ မရှိပါ။")}</p>}
  </section>;
}

export function AccountContent({ lang, checkout = false, embedded = false, history = false, resumeGoogle = false, googleReturnTo = "account", onClose }: AccountProps) {
  const Container = embedded ? "section" : "main";
  const Title = embedded ? "h2" : "h1";
  const t: Translate = (en, my) => lang === "my" ? my : en;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [telegram, setTelegram] = useState("");
  const [orders, setOrders] = useState<CommerceOrder[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [historyFilter, setHistoryFilter] = useState<"approved" | "pending" | null>(null);

  useEffect(() => {
    if (embedded) return;
    document.documentElement.lang = lang;
    return () => { document.documentElement.lang = "en"; };
  }, [lang, embedded]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const options = { cache: "no-store", signal: controller.signal } as const;
    async function load() {
      try {
        const session = await fetch(sessionPath, options);
        if (!session.ok) throw new Error("session");
        const { customer: person } = await session.json() as { customer: Customer | null };
        if (!active) return;
        if (resumeGoogle) { setCustomer(null); setOrders(null); setFailed(false); setLoading(false); return; }
        setCustomer(person);
        setOrders(null);
        if (person && checkout && !embedded) { window.location.replace("/?checkout=1"); return; }
        if (person) {
          const response = await fetch(`/api/customer/orders?view=${history ? "history" : "overview"}`, options);
          if (!active) return;
          if (response.status === 401) { setCustomer(null); }
          else {
            if (!response.ok) throw new Error("orders");
            const data = await response.json() as { orders: CommerceOrder[]; telegram: string; customer: Customer };
            if (active) { setCustomer(data.customer); setTelegram(data.telegram); setOrders(data.orders); }
          }
        }
        if (active) setFailed(false);
      } catch {
        if (active) setFailed(true);
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [reload, checkout, embedded, history, resumeGoogle]);

  useEffect(() => {
    function clearOnLeave() { setCustomer(null); setOrders(null); setLoading(true); }
    function restore(event: PageTransitionEvent) { if (event.persisted) setReload(value => value + 1); }
    function checkOnReturn() { if (!document.hidden) setReload(value => value + 1); }
    window.addEventListener("pagehide", clearOnLeave);
    window.addEventListener("pageshow", restore);
    document.addEventListener("visibilitychange", checkOnReturn);
    return () => {
      window.removeEventListener("pagehide", clearOnLeave);
      window.removeEventListener("pageshow", restore);
      document.removeEventListener("visibilitychange", checkOnReturn);
    };
  }, []);

  function refresh() {
    setLoading(true);
    setFailed(false);
    setReload(value => value + 1);
  }

  async function logout() {
    setLoggingOut(true);
    try {
      const result = await fetch(sessionPath, { method: "DELETE", cache: "no-store" });
      if (!result.ok) throw new Error("logout");
      if (!embedded) { window.location.replace(history ? "/order-history" : "/account"); return; }
      setCustomer(null);
      setOrders(null);
      setFailed(false);
      setLoggingOut(false);
      refresh();
    } catch {
      setFailed(true);
      setLoggingOut(false);
    }
  }

  function signedIn(person: Customer) {
    if (resumeGoogle) { window.location.replace(googleReturnTo === "checkout" ? "/?checkout=1" : googleReturnTo === "history" ? "/order-history" : "/account"); return; }
    if (checkout && !embedded) { window.location.replace("/?checkout=1"); return; }
    setCustomer(person);
    refresh();
  }

  const pending = orders?.filter(order => order.status === "pending") ?? [];
  const approved = orders?.filter(order => order.status === "approved") ?? [];
  const selectedHistory = historyFilter ?? (approved.length > 0 || pending.length === 0 ? "approved" : "pending");
  const historyOrders = selectedHistory === "approved" ? approved : pending;
  const count = (value: number) => new Intl.NumberFormat(lang === "my" ? "my-MM" : "en-GB").format(value);
  return <Container className={"customer-page" + (embedded ? " customer-embedded" : "") + (history ? " customer-history-page" : "")} lang={lang}>
    {!embedded && <header className="customer-header">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- The storefront and account use separate documents. */}
      <a href="/" className="customer-brand" aria-label={t("Digimium store", "Digimium စတိုး")}><Image src="/assets/logo.png" alt="digimium." width={142} height={48} unoptimized /></a>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Storefront only loads its analytics in a fresh document. */}
      <a className="customer-back" href="/"><ArrowLeft size={15} aria-hidden />{t("Back to store", "ဆိုင်သို့ ပြန်သွားရန်")}</a>
    </header>}
    <div className="customer-main">
      {history && <div className="customer-history-heading"><h1>{t("Order history", "အော်ဒါမှတ်တမ်း")}</h1>
        <p>{t("Your purchases, subscription dates and orders awaiting approval.", "ဝယ်ထားတာ၊ သက်တမ်းနဲ့ စောင့်ဆိုင်းဆဲ အော်ဒါကို ဒီမှာ ကြည့်ပါ။")}</p>
      </div>}
      {failed && <div className="customer-alert" role="alert">{t("Couldn’t update your account. Try again.", "အကောင့်ကို ပြန်လည်ဖော်ပြ၍ မရပါ။ ပြန်ကြိုးစားပါ။")}
        <button type="button" onClick={refresh}>{t("Retry", "ပြန်ကြိုးစားရန်")}</button>
      </div>}
      {!customer && loading && <p role="status">{t("Loading your account…", "အကောင့်ကို ဖော်ပြနေပါတယ်…")}</p>}
      {!customer && !loading && !failed && <>
        {history && <p className="customer-history-signin">{t("Sign in to see orders placed with your account. If you ordered without an account, check your Telegram conversation with Digimium.", "အကောင့်နဲ့ ဝယ်ထားတဲ့ အော်ဒါတွေကို ကြည့်ဖို့ အကောင့်ဝင်ပါ။ အကောင့်မရှိဘဲ ဝယ်ထားရင် Digimium နဲ့ ပြောထားတဲ့ Telegram chat မှာ ပြန်ကြည့်နိုင်ပါတယ်။")}</p>}
        <AuthForm t={t} checkout={checkout} embedded={embedded} history={history} resumeGoogle={resumeGoogle} onSuccess={signedIn} />
      </>}
      {customer && <div className="customer-dashboard">
        <div className="customer-summary">
          <div>{!embedded && !history && <Title>{t("My account", "ကျွန်ုပ်၏အကောင့်")}</Title>}<p><strong className="customer-profile-name">{customer.name}</strong>{history && <span className="customer-profile-email">{customer.email || (customer.telegram?.username ? '@' + customer.telegram.username : 'Telegram')}</span>}</p></div>
          <button className="customer-signout" type="button" onClick={logout} disabled={loggingOut}><LogOut size={16} aria-hidden />{loggingOut ? t("Signing out…", "ထွက်နေပါတယ်…") : t("Sign out", "အကောင့်ထွက်ရန်")}</button>
        </div>
        {!history && <AccountDetails customer={customer} lang={lang} t={t} />}
        {embedded && !history && <Link className="customer-account-settings" href="/account" onClick={onClose}><Settings2 size={17} aria-hidden />{t("Account settings", "အကောင့် ဆက်တင်များ")}<ArrowRight size={16} aria-hidden /></Link>}
        {!embedded && !history && customer.passwordAvailable !== false && <PasswordForm t={t} onUpdated={setCustomer} onSignedOut={() => { setCustomer(null); setOrders(null); refresh(); }} />}
        {!embedded && !history && customer.passwordAvailable === false && <p className="customer-google-connected">{customer.telegram ? t("Telegram account", "Telegram အကောင့်") : t("Google account", "Google အကောင့်")}</p>}
        {!orders && !failed && <p role="status">{t("Loading orders…", "အော်ဒါများကို ဖော်ပြနေပါတယ်…")}</p>}
        {orders && <>
          {!history && <RecentOrders orders={approved} lang={lang} t={t} brief={embedded} onClose={onClose} />}
          {embedded && !history && <PendingPreview orders={pending} lang={lang} t={t} onClose={onClose} />}
          {!embedded && !history && <section className="customer-section" aria-labelledby="pending-orders">
            <div className="customer-heading"><h2 id="pending-orders">{t("Pending orders", "စောင့်ဆိုင်းဆဲ အော်ဒါများ")} <span className="customer-section-count" data-pending>{pending.length}</span></h2>
              <button type="button" className="customer-refresh" onClick={refresh} disabled={loading}><RefreshCw size={15} aria-hidden />{t("Refresh", "ပြန်ကြည့်ရန်")}</button>
            </div>
            {pending.length > 0 && <p className="customer-section-help">{t("Send your order in Telegram and wait for shop approval.", "အော်ဒါစာကို Telegram မှာ ပို့ပြီး ဆိုင်အတည်ပြုချက်ကို စောင့်ပါ။")}</p>}
            {pending.length ? pending.map(order => <OrderCard key={order.id} order={order} customer={customer} telegram={telegram} lang={lang} t={t} embedded={embedded} onClose={onClose} />)
              : <p className="customer-empty">{t("No orders are awaiting approval.", "အတည်ပြုရန် စောင့်ဆိုင်းနေသော အော်ဒါ မရှိပါ။")}</p>}
          </section>}
          {history && <section className="customer-section customer-history-orders" aria-labelledby="customer-history-list-title">
            <div className="customer-history-toolbar">
              <div className="customer-history-filters" role="group" aria-label={t("Order status", "အော်ဒါ အခြေအနေ ရွေးရန်")}>
                <button type="button" aria-pressed={selectedHistory === "approved"} aria-controls="customer-history-list" onClick={() => setHistoryFilter("approved")}>{t("Purchased", "ဝယ်ယူပြီး")} <span>{count(approved.length)}</span></button>
                <button type="button" aria-pressed={selectedHistory === "pending"} aria-controls="customer-history-list" onClick={() => setHistoryFilter("pending")}>{t("Pending", "စောင့်ဆိုင်းဆဲ")} <span>{count(pending.length)}</span></button>
              </div>
              <button type="button" className="customer-refresh" onClick={refresh} disabled={loading}><RefreshCw size={15} aria-hidden />{t("Refresh", "ပြန်ကြည့်ရန်")}</button>
            </div>
            <div id="customer-history-list" aria-live="polite" aria-busy={loading}>
              <h2 id="customer-history-list-title" className="customer-history-list-title">{selectedHistory === "approved" ? t("Purchased plans", "ဝယ်ယူထားသော အစီအစဉ်များ") : t("Awaiting shop approval", "ဆိုင်အတည်ပြုရန် စောင့်ဆိုင်းဆဲ")}</h2>
              {selectedHistory === "pending" && pending.length > 0 && <p className="customer-section-help">{t("Send your order in Telegram and wait for shop approval.", "အော်ဒါစာကို Telegram မှာ ပို့ပြီး ဆိုင်အတည်ပြုချက်ကို စောင့်ပါ။")}</p>}
              {historyOrders.length ? historyOrders.map(order => <OrderCard key={order.id} order={order} customer={customer} telegram={telegram} lang={lang} t={t} embedded={embedded} onClose={onClose} />)
                : <p className="customer-empty">{selectedHistory === "pending" ? t("No orders are awaiting approval.", "အတည်ပြုရန် စောင့်ဆိုင်းနေသော အော်ဒါ မရှိပါ။") : t("Approved orders and subscription dates will appear here.", "အော်ဒါ အတည်ပြုပြီးရင် ဝယ်ယူမှုမှတ်တမ်းနဲ့ ဝန်ဆောင်မှုသက်တမ်းကို ဒီမှာ ကြည့်နိုင်ပါတယ်။")}</p>}
            </div>
            <Link href="/account" className="customer-history-account">{t("Account settings", "အကောင့်အချက်အလက် ကြည့်ရန်")}<ArrowRight size={16} aria-hidden /></Link>
          </section>}
        </>}
      </div>}
    </div>
    {!embedded && <MobileDock lang={lang} active={history ? "history" : "account"} />}
  </Container>;
}

export default function Account(props: AccountProps) {
  return <AccountContent {...props} />;
}
