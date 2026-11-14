"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, LogOut, RefreshCw } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { telegramDraft } from "@/lib/cart-order";
import { orderTelegramMessages } from "@/lib/order-telegram";
import type { CommerceOrder } from "@/lib/commerce-types";
import type { ShopLanguage } from "@/lib/shop-language";
import { durationText } from "@/lib/shop-language";
import { SubscriptionTerm } from "./subscription-term";

type Customer = { id: string; name: string; email: string; createdAt: string };
type AccountProps = { lang: ShopLanguage; checkout?: boolean; embedded?: boolean; history?: boolean; onClose?: () => void };
type Translate = (en: string, my: string) => string;

const sessionPath = "/api/customer/session";

function AuthForm({ checkout, embedded, history, t, onSuccess }: { checkout: boolean; embedded: boolean; history: boolean; t: Translate; onSuccess: (customer: Customer) => void }) {
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const Title = embedded || history ? "h2" : "h1";
  const title = registering ? t("Create account", "အကောင့်ဖွင့်ရန်") : t("Sign in", "အကောင့်ဝင်ရန်");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const res = await fetch(sessionPath, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ action: registering ? "register" : "login", name: fields.get("name"), email: fields.get("email"), password: fields.get("password") }),
      });
      const data = await res.json() as { customer?: Customer; error?: string };
      if (res.ok && data.customer) { onSuccess(data.customer); return; }
      const errors: Record<string, string> = {
        credentials: t("The email or password is incorrect.", "အီးမေးလ် သို့မဟုတ် စကားဝှက် မှားနေပါတယ်။"),
        invalid: t("Check your entries and try again.", "ဖြည့်ထားတဲ့ အချက်အလက်တွေ စစ်ဆေးပြီး ပြန်ကြိုးစားပါ။"),
        registration: t("Unable to create an account with these details. If you already have an account, sign in.", "ဒီအချက်အလက်တွေနဲ့ အကောင့်ဖွင့်လို့ မရပါ။ အကောင့်ရှိပြီးသားဆိုရင် အကောင့်ဝင်ပါ။"),
        rate_limited: t("Too many attempts. Try again in 15 minutes.", "အကြိမ်ရေ များသွားပါတယ်။ ၁၅ မိနစ်နောက် ပြန်ကြိုးစားပါ။"),
      };
      setError(errors[data.error ?? ""] ?? t("Accounts are temporarily unavailable. Try again.", "အကောင့်စနစ် ခေတ္တ မရနိုင်သေးပါ။ ပြန်ကြိုးစားပါ။"));
    } catch {
      setError(t("Couldn’t connect. Check your connection and try again.", "ချိတ်ဆက်၍ မရပါ။ အင်တာနက် စစ်ဆေးပြီး ပြန်ကြိုးစားပါ။"));
    } finally { setBusy(false); }
  }

  return <section className="customer-auth" aria-labelledby="account-title">
    <Title id="account-title">{title}</Title>
    {checkout && <p className="customer-auth-context">{t("Sign in to keep your orders and subscription dates in your account. You can also order without an account.", "အော်ဒါနဲ့ သက်တမ်းကို အကောင့်ထဲမှာ ပြန်ကြည့်ချင်ရင် အကောင့်ဝင်ပါ။ အကောင့်မရှိဘဲလည်း မှာယူနိုင်ပါတယ်။")}</p>}
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Restore the cart in a fresh storefront document. */}
    {checkout && <a className="customer-guest-link" href="/?checkout=1">{t("Continue without an account", "အကောင့်မရှိဘဲ ဆက်ဝယ်မယ်")}<ArrowRight size={16} aria-hidden /></a>}
    <form key={String(registering)} onSubmit={submit}>
      {registering && <label>{t("Name", "အမည်")}<input name="name" autoComplete="name" maxLength={100} required /></label>}
      <label>{t("Email", "အီးမေးလ်")}<input name="email" type="email" autoCapitalize="none" autoComplete="username" maxLength={254} required /></label>
      <label>{t("Password", "စကားဝှက်")}<input name="password" type="password"
        autoComplete={registering ? "new-password" : "current-password"} minLength={registering ? 10 : undefined}
        maxLength={256} required aria-describedby={registering ? "password-hint" : undefined} /></label>
      {registering && <small id="password-hint">{t("Use at least 10 characters.", "အနည်းဆုံး စာလုံး ၁၀ လုံး သုံးပါ။")}</small>}
      {error && <p role="alert" className="customer-error">{error}</p>}
      <button type="submit" className="customer-primary" disabled={busy}>{busy ? t("Please wait…", "ခဏစောင့်ပါ…") : title}<ArrowRight size={17} aria-hidden /></button>
    </form>
    <p className="customer-switch">
      {registering ? t("Already have an account?", "အကောင့်ရှိပြီးသားလား။") : t("New to Digimium?", "အကောင့် မရှိသေးဘူးလား။")}
      <button type="button" disabled={busy} onClick={() => { setRegistering(!registering); setError(""); }}>
        {registering ? t("Sign in", "အကောင့်ဝင်ရန်") : t("Create account", "အကောင့်ဖွင့်ရန်")}
      </button>
    </p>
  </section>;
}

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
    <p>{t("Send your order to Digimium in Telegram. We’ll confirm payment and send your service account details there.",
      "Telegram မှာ Digimium ဆီ အော်ဒါစာ ပို့ပေးပါ။ ငွေပေးချေမှု အတည်ပြုတာနဲ့ ဝယ်ထားတဲ့အကောင့် အသေးစိတ် ပေးတာတွေကို အဲဒီ chat မှာပဲ ဆက်လုပ်ပေးပါမယ်။")}</p>
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
  return <article className="customer-order">
    <div className="customer-order-meta">
      <h3>{t("Order", "အော်ဒါ")} <bdi>#{order.id.slice(0, 8).toUpperCase()}</bdi></h3>
      <time dateTime={order.createdAt}>{formatDate(order.createdAt, lang)}</time>
    </div>
    <ul className="customer-lines">{order.lines.map(line => <li key={line.id}>
      <div className="customer-item-title">
        <strong>{line.productName}</strong><span>{t("Qty", "အရေအတွက်")} {line.quantity}</span>
      </div>
      <p className="customer-item-plan">{[line.planName, durationText(line.duration, lang), line.price].filter(Boolean).join(" · ")}</p>
      {approved && <>
        <SubscriptionTerm startDate={line.startDate} endDate={line.endDate} lang={lang} />
        {!embedded && line.accountInfo && <details className="customer-delivery"><summary>{t("Previously saved account details", "ယခင်သိမ်းထားသော အကောင့်အချက်အလက်")}<ChevronDown size={16} aria-hidden /></summary>
          <p dir="auto">{line.accountInfo}</p>
        </details>}
      </>}
    </li>)}</ul>
    {order.totalMmk !== null && <div className="customer-total"><span>{t("Order total", "စုစုပေါင်း")}</span><strong>{order.totalMmk.toLocaleString("en-US")} MMK</strong></div>}
    {!approved && <PendingTelegram order={order} customer={customer} telegram={telegram} lang={lang} t={t} embedded={embedded} onClose={onClose} />}
  </article>;
}

function RecentOrders({ orders, lang, t, onClose }: { orders: CommerceOrder[]; lang: ShopLanguage; t: Translate; onClose?: () => void }) {
  const recent = orders.flatMap(order => order.lines.map(line => ({ orderId: order.id, line }))).slice(0, 3);
  return <section className="customer-section customer-recent" aria-labelledby="order-history">
    <div className="customer-heading"><h2 id="order-history">{t("Order history", "အော်ဒါမှတ်တမ်း")}</h2>
      <Link className="customer-history-link" href="/order-history" onClick={onClose}>{t("View all orders", "အားလုံးကြည့်ရန်")}<ArrowRight size={15} aria-hidden /></Link>
    </div>
    {recent.length ? <ul className="customer-recent-list">{recent.map(({ orderId, line }) => <li key={`${orderId}-${line.id}`}>
      <div className="customer-item-title"><strong>{line.productName}</strong>{line.quantity > 1 && <span>{t("Qty", "အရေအတွက်")} {line.quantity}</span>}</div>
      <p className="customer-item-plan">{[line.planName, durationText(line.duration, lang)].filter(Boolean).join(" · ")}</p>
      <SubscriptionTerm startDate={line.startDate} endDate={line.endDate} lang={lang} compact />
    </li>)}</ul> : <p className="customer-empty">{t("Approved orders and subscription dates will appear here.", "အော်ဒါ အတည်ပြုပြီးရင် ဝယ်ယူမှုမှတ်တမ်းနဲ့ ဝန်ဆောင်မှုသက်တမ်းကို ဒီမှာ ကြည့်နိုင်ပါတယ်။")}</p>}
  </section>;
}

export function AccountContent({ lang, checkout = false, embedded = false, history = false, onClose }: AccountProps) {
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
  }, [reload, checkout, embedded, history]);

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
    if (checkout && !embedded) { window.location.replace("/?checkout=1"); return; }
    setCustomer(person);
    refresh();
  }

  const pending = orders?.filter(order => order.status === "pending") ?? [];
  const approved = orders?.filter(order => order.status === "approved") ?? [];
  return <Container className={"customer-page" + (embedded ? " customer-embedded" : "") + (history ? " customer-history-page" : "")} lang={lang}>
    {!embedded && <header className="customer-header">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- The storefront and account use separate documents. */}
      <a href="/" className="customer-brand" aria-label={t("Digimium store", "Digimium စတိုး")}><Image src="/assets/logo.png" alt="digimium." width={142} height={48} unoptimized /></a>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Storefront only loads its analytics in a fresh document. */}
      <a className="customer-back" href="/"><ArrowLeft size={15} aria-hidden />{t("Back to store", "ဆိုင်သို့ ပြန်သွားရန်")}</a>
    </header>}
    <div className="customer-main">
      {history && <div className="customer-history-heading"><h1>{t("Order history", "အော်ဒါမှတ်တမ်း")}</h1>
        <p>{t("Your approved orders and subscription dates, in one place.", "အတည်ပြုပြီးသော အော်ဒါတွေနဲ့ ဝန်ဆောင်မှုသက်တမ်းတွေကို ဒီမှာ ကြည့်နိုင်ပါတယ်။")}</p>
      </div>}
      {failed && <div className="customer-alert" role="alert">{t("Couldn’t update your account. Try again.", "အကောင့်ကို ပြန်လည်ဖော်ပြ၍ မရပါ။ ပြန်ကြိုးစားပါ။")}
        <button type="button" onClick={refresh}>{t("Retry", "ပြန်ကြိုးစားရန်")}</button>
      </div>}
      {!customer && loading && <p role="status">{t("Loading your account…", "အကောင့်ကို ဖော်ပြနေပါတယ်…")}</p>}
      {!customer && !loading && !failed && <>
        {history && <p className="customer-history-signin">{t("Sign in to see orders placed with your account. If you ordered without an account, check your Telegram conversation with Digimium.", "အကောင့်နဲ့ ဝယ်ထားတဲ့ အော်ဒါတွေကို ကြည့်ဖို့ အကောင့်ဝင်ပါ။ အကောင့်မရှိဘဲ ဝယ်ထားရင် Digimium နဲ့ ပြောထားတဲ့ Telegram chat မှာ ပြန်ကြည့်နိုင်ပါတယ်။")}</p>}
        <AuthForm t={t} checkout={checkout} embedded={embedded} history={history} onSuccess={signedIn} />
      </>}
      {customer && <div className="customer-dashboard">
        <div className="customer-summary">
          <div>{!embedded && !history && <Title>{t("My account", "ကျွန်ုပ်၏အကောင့်")}</Title>}<p><strong>{customer.name}</strong><span>{customer.email}</span></p>{!history && <small className="customer-member-since">{t("Joined", "အကောင့်ဖွင့်သည့်နေ့")} <time dateTime={customer.createdAt}>{formatDate(customer.createdAt, lang)}</time></small>}</div>
          <button type="button" onClick={logout} disabled={loggingOut}><LogOut size={16} aria-hidden />{t("Sign out", "အကောင့်ထွက်ရန်")}</button>
        </div>
        {!history && <PasswordForm t={t} onUpdated={setCustomer} onSignedOut={() => { setCustomer(null); setOrders(null); refresh(); }} />}
        {!orders && !failed && <p role="status">{t("Loading orders…", "အော်ဒါများကို ဖော်ပြနေပါတယ်…")}</p>}
        {orders && <>
          {!history && <RecentOrders orders={approved} lang={lang} t={t} onClose={onClose} />}
          {!history && <section className="customer-section" aria-labelledby="pending-orders">
            <div className="customer-heading"><h2 id="pending-orders">{t("Pending orders", "အတည်ပြုရန် စောင့်ဆိုင်းနေသော အော်ဒါများ")}</h2>
              <button type="button" className="customer-refresh" onClick={refresh} disabled={loading}><RefreshCw size={15} aria-hidden />{t("Refresh", "ပြန်ကြည့်ရန်")}</button>
            </div>
            {pending.length ? pending.map(order => <OrderCard key={order.id} order={order} customer={customer} telegram={telegram} lang={lang} t={t} embedded={embedded} onClose={onClose} />)
              : <p className="customer-empty">{t("No orders are awaiting approval.", "အတည်ပြုရန် စောင့်ဆိုင်းနေသော အော်ဒါ မရှိပါ။")}</p>}
          </section>}
          {history && <section className="customer-section" aria-labelledby="approved-orders">
            <div className="customer-heading"><h2 id="approved-orders">{t("Approved orders", "အတည်ပြုပြီးသော အော်ဒါများ")}</h2>
              <button type="button" className="customer-refresh" onClick={refresh} disabled={loading}><RefreshCw size={15} aria-hidden />{t("Refresh", "ပြန်ကြည့်ရန်")}</button>
            </div>
            {approved.length ? approved.map(order => <OrderCard key={order.id} order={order} customer={customer} telegram={telegram} lang={lang} t={t} embedded={embedded} onClose={onClose} />)
              : <p className="customer-empty">{t("Approved orders and subscription dates will appear here.", "အော်ဒါ အတည်ပြုပြီးရင် ဝယ်ယူမှုမှတ်တမ်းနဲ့ ဝန်ဆောင်မှုသက်တမ်းကို ဒီမှာ ကြည့်နိုင်ပါတယ်။")}</p>}
            <Link href="/account" className="customer-history-account">{t("View pending orders and account settings", "စောင့်ဆိုင်းဆဲ အော်ဒါများနှင့် အကောင့်အချက်အလက် ကြည့်ရန်")}<ArrowRight size={16} aria-hidden /></Link>
          </section>}
        </>}
      </div>}
    </div>
  </Container>;
}

export default function Account(props: AccountProps) {
  return <AccountContent {...props} />;
}
