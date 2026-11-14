"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, ChevronDown, LogOut, RefreshCw } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { CommerceOrder } from "@/lib/commerce-types";
import type { ShopLanguage } from "@/lib/shop-language";
import { durationText } from "@/lib/shop-language";

type Customer = { id: string; name: string; email: string };
type AccountProps = { lang: ShopLanguage; checkout: boolean };
type Translate = (en: string, my: string) => string;

const sessionPath = "/api/customer/session";

function AuthForm({ checkout, t, onSuccess }: { checkout: boolean; t: Translate; onSuccess: (customer: Customer) => void }) {
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    <h1 id="account-title">{title}</h1>
    {checkout && <p className="customer-auth-context">{t("Your cart is saved. Sign in or create an account to continue checkout.", "ဈေးခြင်းကို သိမ်းထားပါတယ်။ အော်ဒါဆက်တင်ဖို့ အကောင့်ဝင်ပါ သို့မဟုတ် အကောင့်ဖွင့်ပါ။")}</p>}
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

function formatDate(value: string, lang: ShopLanguage, dateOnly = false) {
  return new Intl.DateTimeFormat(lang === "my" ? "my-MM" : "en-GB", {
    dateStyle: "medium", ...(dateOnly ? { timeZone: "UTC" } : {}),
  }).format(new Date(dateOnly ? value + "T00:00:00Z" : value));
}

function OrderCard({ order, lang, t }: { order: CommerceOrder; lang: ShopLanguage; t: Translate }) {
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
        <dl className="customer-dates">
          <div><dt>{t("Start date", "စတင်ရက်")}</dt><dd>{line.startDate && <time dateTime={line.startDate}>{formatDate(line.startDate, lang, true)}</time>}</dd></div>
          <div><dt>{t("End date", "သက်တမ်းကုန်ရက်")}</dt><dd>{line.endDate && <time dateTime={line.endDate}>{formatDate(line.endDate, lang, true)}</time>}</dd></div>
        </dl>
        {line.accountInfo && <details className="customer-delivery"><summary>{t("Account details", "ဝယ်ထားသော အကောင့်အချက်အလက်")}<ChevronDown size={16} aria-hidden /></summary>
          <p dir="auto">{line.accountInfo}</p>
        </details>}
      </>}
    </li>)}</ul>
    {order.totalMmk !== null && <div className="customer-total"><span>{t("Order total", "စုစုပေါင်း")}</span><strong>{order.totalMmk.toLocaleString("en-US")} MMK</strong></div>}
  </article>;
}

export default function Account({ lang, checkout }: AccountProps) {
  const t: Translate = (en, my) => lang === "my" ? my : en;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<CommerceOrder[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    document.documentElement.lang = lang;
    return () => { document.documentElement.lang = "en"; };
  }, [lang]);

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
        if (person && checkout) { window.location.replace("/?checkout=1"); return; }
        if (person) {
          const response = await fetch("/api/customer/orders", options);
          if (!active) return;
          if (response.status === 401) { setCustomer(null); }
          else {
            if (!response.ok) throw new Error("orders");
            const data = await response.json() as { orders: CommerceOrder[] };
            if (active) setOrders(data.orders);
          }
        }
        if (active) setFailed(false);
      } catch {
        if (active) setFailed(true);
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [reload, checkout]);

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
      window.location.replace("/account");
    } catch {
      setFailed(true);
      setLoggingOut(false);
    }
  }

  function signedIn(person: Customer) {
    if (checkout) { window.location.replace("/?checkout=1"); return; }
    setCustomer(person);
    refresh();
  }

  const pending = orders?.filter(order => order.status === "pending") ?? [];
  const approved = orders?.filter(order => order.status === "approved") ?? [];
  return <main className="customer-page" lang={lang}>
    <header className="customer-header">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- The storefront and account use separate documents. */}
      <a href="/" className="customer-brand" aria-label={t("Digimium store", "Digimium စတိုး")}><Image src="/assets/logo.png" alt="digimium." width={142} height={48} unoptimized /></a>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Storefront only loads its analytics in a fresh document. */}
      <a className="customer-back" href="/"><ArrowLeft size={15} aria-hidden />{t("Back to store", "ဆိုင်သို့ ပြန်သွားရန်")}</a>
    </header>
    <div className="customer-main">
      {failed && <div className="customer-alert" role="alert">{t("Couldn’t update your account. Try again.", "အကောင့်ကို ပြန်လည်ဖော်ပြ၍ မရပါ။ ပြန်ကြိုးစားပါ။")}
        <button type="button" onClick={refresh}>{t("Retry", "ပြန်ကြိုးစားရန်")}</button>
      </div>}
      {!customer && loading && <p role="status">{t("Loading your account…", "အကောင့်ကို ဖော်ပြနေပါတယ်…")}</p>}
      {!customer && !loading && !failed && <AuthForm t={t} checkout={checkout} onSuccess={signedIn} />}
      {customer && <div className="customer-dashboard">
        <div className="customer-summary">
          <div><h1>{t("My account", "ကျွန်ုပ်၏အကောင့်")}</h1><p><strong>{customer.name}</strong><span>{customer.email}</span></p></div>
          <button type="button" onClick={logout} disabled={loggingOut}><LogOut size={16} aria-hidden />{t("Sign out", "အကောင့်ထွက်ရန်")}</button>
        </div>
        {!orders && !failed && <p role="status">{t("Loading orders…", "အော်ဒါများကို ဖော်ပြနေပါတယ်…")}</p>}
        {orders && <>
          <section className="customer-section" aria-labelledby="pending-orders">
            <div className="customer-heading"><h2 id="pending-orders">{t("Pending orders", "အတည်ပြုရန် စောင့်ဆိုင်းနေသော အော်ဒါများ")}</h2>
              <button type="button" className="customer-refresh" onClick={refresh} disabled={loading}><RefreshCw size={15} aria-hidden />{t("Refresh", "ပြန်ကြည့်ရန်")}</button>
            </div>
            {pending.length ? pending.map(order => <OrderCard key={order.id} order={order} lang={lang} t={t} />)
              : <p className="customer-empty">{t("No orders are awaiting approval.", "အတည်ပြုရန် စောင့်ဆိုင်းနေသော အော်ဒါ မရှိပါ။")}</p>}
          </section>
          <section className="customer-section" aria-labelledby="order-history">
            <h2 id="order-history">{t("Order history", "အော်ဒါမှတ်တမ်း")}</h2>
            {approved.length ? approved.map(order => <OrderCard key={order.id} order={order} lang={lang} t={t} />)
              : <p className="customer-empty">{t("Approved orders and your subscription details will appear here.", "အော်ဒါကို အတည်ပြုပြီးတာနဲ့ ဝယ်ယူထားတဲ့ ဝန်ဆောင်မှု အသေးစိတ်ကို ဒီမှာ ကြည့်နိုင်ပါတယ်။")}</p>}
          </section>
        </>}
      </div>}
    </div>
  </main>;
}
