"use client";

// Account and history use separate documents without storefront analytics.

import Image from "next/image";
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, Eye, EyeOff, LogOut, RefreshCw, Settings } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { telegramDraft } from "@/lib/cart-order";
import { orderTelegramIdentity, orderTelegramMessages } from "@/lib/order-telegram";
import type { CommerceCustomer as Customer, CommerceOrder, CommerceOrderLine } from "@/lib/commerce-types";
import type { Product } from "@/lib/catalog";
import type { ShopLanguage } from "@/lib/shop-language";
import { durationText, priceText } from "@/lib/shop-language";
import { AuthForm } from "./auth-form";
export { CheckoutAuth } from "./auth-form";
import { SubscriptionTerm } from "./subscription-term";
import { MobileDock } from "../mobile-dock";
import { Mark } from "../product-mark";
import { AccountConnections } from "./account-connections";
import { CustomerNotifications } from "../customer-notifications";
import type { RunningHubHistoryOrder, RunningHubHistoryPage, RunningHubHistoryStatus } from "@/lib/runninghub-history";
import { mergeHistory, RunningHubHistoryCard, RunningHubRecentPurchase, runningHubHistoryStatus } from "../order-history/runninghub-history";

type AccountProps = { lang: ShopLanguage; checkout?: boolean; embedded?: boolean; history?: boolean; resumeGoogle?: boolean; googleReturnTo?: "checkout" | "account" | "history"; onClose?: () => void };
type Translate = (en: string, my: string) => string;

const sessionPath = "/api/customer/session";
type RunningHubHistory = {
  customerId: string;
  counts: RunningHubHistoryPage["counts"];
  pages: Partial<Record<RunningHubHistoryStatus, Pick<RunningHubHistoryPage, "orders" | "nextCursor">>>;
};

async function fetchRunningHubHistory(status: RunningHubHistoryStatus, limit: number, signal: AbortSignal, cursor?: string) {
  const query = new URLSearchParams({ status, limit: String(limit), ...(cursor ? { cursor } : {}) });
  const response = await fetch(`/api/customer/runninghub/history?${query}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(response.status === 401 ? "identity" : "runninghub");
  return response.json() as Promise<RunningHubHistoryPage>;
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
  const messages = orderTelegramMessages(order, orderTelegramIdentity(customer), lang);
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

function PurchasedLogo({ line, products }: { line: CommerceOrderLine; products: Product[] }) {
  const product = products.find(product => product.id === line.productId);
  return <span className="customer-product-logo" aria-hidden="true">{product ? <Mark product={product} /> : <span>{line.productName.slice(0, 1)}</span>}</span>;
}

function DeliveredAccount({ line, t }: { line: CommerceOrderLine; t: Translate }) {
  const [showPassword, setShowPassword] = useState(false);
  const details = line.accountDetails;
  if (!details && !line.accountInfo) return null;
  return <details className="customer-delivery" onToggle={event => { if (!event.currentTarget.open) setShowPassword(false); }}>
    <summary>{t("Purchased account details", "ဝယ်ယူထားသော အကောင့်အချက်အလက်")}<ChevronDown size={16} aria-hidden /></summary>
    {details && <dl className="customer-delivery-fields">
      {details.account && <div><dt>{t("Account", "အကောင့်")}</dt><dd dir="auto">{details.account}</dd></div>}
      {details.username && <div><dt>Username</dt><dd dir="auto">{details.username}</dd></div>}
      {details.password && <div><dt>{t("Password", "စကားဝှက်")}</dt><dd className="customer-delivery-password"><span dir="auto">{showPassword ? details.password : "••••••••"}</span><button type="button" aria-pressed={showPassword} aria-label={showPassword ? t("Hide purchased account password", "ဝယ်ထားသောအကောင့် စကားဝှက် ဖျောက်ရန်") : t("Show purchased account password", "ဝယ်ထားသောအကောင့် စကားဝှက် ပြရန်")} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}</button></dd></div>}
      {details.manager && <div><dt>Manager</dt><dd dir="auto">{details.manager}</dd></div>}
    </dl>}
    {line.accountInfo && <p dir="auto">{line.accountInfo}</p>}
  </details>;
}

function OrderCard({ order, lang, t, customer, telegram, embedded, products, onClose }: {
  order: CommerceOrder; lang: ShopLanguage; t: Translate; customer: Customer; telegram: string; embedded: boolean; products: Product[]; onClose?: () => void;
}) {
  const approved = order.status === "approved";
  const rejected = order.status === "rejected";
  return <article className="customer-order" data-status={order.status}>
    <div className="customer-order-meta">
      <div><h3>{t("Order", "အော်ဒါ")} <bdi>#{order.id.slice(0, 8).toUpperCase()}</bdi></h3>
        <time dateTime={order.createdAt}>{formatDate(order.createdAt, lang)}</time></div>
      <span className="customer-order-status">{rejected ? t("Rejected", "ငြင်းပယ်ထားသည်") : approved ? t("Approved", "အတည်ပြုပြီး") : t("Pending", "စောင့်ဆိုင်းဆဲ")}</span>
    </div>
    {rejected && <p className="customer-order-decision">{t("This order was not approved.", "ဒီအော်ဒါကို ဆိုင်က ငြင်းပယ်ထားပါတယ်။")}</p>}
    <ul className="customer-lines">{order.lines.map(line => <li key={line.id}>
      <div className="customer-product-heading"><PurchasedLogo line={line} products={products} /><div className="customer-product-copy"><div className="customer-item-title">
        <strong>{line.productName}</strong><span>{t("Qty", "အရေအတွက်")} {line.quantity}</span>
      </div>
      {line.planName && <p className="customer-item-plan">{line.planName}</p>}</div></div>
      <div className="customer-item-meta">{line.duration && <span>{durationText(line.duration, lang)}</span>}
        {line.price && <span className="customer-unit-price"><small>{t("Each", "တစ်ခုလျှင်")}</small><strong>{priceText(line.price, lang)}</strong></span>}</div>
      {approved && <>
        <SubscriptionTerm startDate={line.startDate} endDate={line.endDate} lang={lang} />
        {!embedded && <DeliveredAccount line={line} t={t} />}
      </>}
    </li>)}</ul>
    {order.totalMmk !== null && <div className="customer-total"><span>{t("Order total", "စုစုပေါင်း")}</span><strong>{priceText(order.totalMmk.toLocaleString("en-US") + " MMK", lang)}</strong></div>}
    {order.customerNote && <section className="customer-order-note" aria-label={t("Note from Digimium", "Digimium မှ မှတ်ချက်")}>
      <h4>{t("Note from Digimium", "Digimium မှ မှတ်ချက်")}</h4><p dir="auto">{order.customerNote}</p>
    </section>}
    {order.status === "pending" && <PendingTelegram order={order} customer={customer} telegram={telegram} lang={lang} t={t} embedded={embedded} onClose={onClose} />}
  </article>;
}

type RecentEntry = { kind: "runninghub"; order: RunningHubHistoryOrder; orderId: string; line: null }
  | { kind: "commerce"; order: null; orderId: string; line: CommerceOrderLine };

function RecentOrders({ orders, runningHub, lang, t, products, brief = false, onClose }: { orders: CommerceOrder[]; runningHub: RunningHubHistoryOrder[]; lang: ShopLanguage; t: Translate; products: Product[]; brief?: boolean; onClose?: () => void }) {
  const recent = mergeHistory(orders, runningHub).flatMap<RecentEntry>(entry => entry.kind === "runninghub"
    ? [{ kind: "runninghub" as const, order: entry.order, orderId: entry.order.id, line: null }]
    : entry.order.lines.map(line => ({ kind: "commerce" as const, order: null, orderId: entry.order.id, line }))).slice(0, brief ? 2 : 3);
  return <section className="customer-section customer-recent" aria-labelledby="order-history">
    <div className="customer-heading"><h2 id="order-history">{brief ? t("Recent purchases", "လတ်တလော ဝယ်ယူမှုများ") : t("Order history", "အော်ဒါမှတ်တမ်း")}</h2>
      <a className="customer-history-link" href="/order-history" onClick={onClose}>{t("View all orders", "အားလုံးကြည့်ရန်")}<ArrowRight size={15} aria-hidden /></a>
    </div>
    {recent.length ? <ul className="customer-recent-list">{recent.map(entry => { if (entry.kind === "runninghub") return <RunningHubRecentPurchase key={`runninghub-${entry.orderId}`} order={entry.order} t={t} onClose={onClose}/>; const { orderId, line } = entry; return <li key={`${orderId}-${line.id}`} className={brief ? "customer-recent-brief" : undefined}>
      <div className="customer-product-heading"><PurchasedLogo line={line} products={products} /><div className="customer-recent-copy"><div className="customer-item-title"><strong title={brief ? line.productName : undefined}>{line.productName}</strong>{line.quantity > 1 && <span>{t("Qty", "အရေအတွက်")} {line.quantity}</span>}</div>
        {line.planName && <p className="customer-item-plan" title={brief ? line.planName : undefined}>{line.planName}</p>}
        {!brief && line.duration && <p className="customer-item-duration">{durationText(line.duration, lang)}</p>}
      </div></div>
      <SubscriptionTerm startDate={line.startDate} endDate={line.endDate} lang={lang} compact />
    </li>; })}</ul> : <p className="customer-empty">{t("Approved orders and subscription dates will appear here.", "အော်ဒါ အတည်ပြုပြီးရင် ဝယ်ယူမှုမှတ်တမ်းနဲ့ ဝန်ဆောင်မှုသက်တမ်းကို ဒီမှာ ကြည့်နိုင်ပါတယ်။")}</p>}
  </section>;
}

function AccountDetails({ customer, lang, t }: { customer: Customer; lang: ShopLanguage; t: Translate }) {
  return <dl className="customer-profile-details">
    <div><dt>{t("Email", "အီးမေးလ်")}</dt><dd>{customer.email ? <bdi>{customer.email}</bdi> : <span className="customer-profile-missing">{t("Not provided", "ထည့်ထားခြင်း မရှိပါ")}</span>}</dd></div>
    <div><dt>Telegram</dt><dd>{customer.telegram?.username ? <bdi>@{customer.telegram.username}</bdi> : <span className="customer-profile-missing">{customer.telegram ? t("No username", "Username မရှိပါ") : t("Not connected", "ချိတ်ထားခြင်း မရှိပါ")}</span>}</dd></div>
    <div><dt>{t("Joined", "ဖွင့်သည့်နေ့")}</dt><dd><time dateTime={customer.createdAt}>{formatDate(customer.createdAt, lang)}</time></dd></div>
  </dl>;
}

function PendingPreview({ orders, runningHub, total, lang, t, onClose }: { orders: CommerceOrder[]; runningHub: RunningHubHistoryOrder[]; total: number | null; lang: ShopLanguage; t: Translate; onClose?: () => void }) {
  const number = (value: number) => new Intl.NumberFormat(lang === "my" ? "my-MM" : "en-GB").format(value);
  const recent = mergeHistory(orders, runningHub).slice(0, 2);
  return <section className="customer-section customer-pending-preview" aria-labelledby="pending-orders">
    <div className="customer-heading"><h2 id="pending-orders">{t("Pending orders", "စောင့်ဆိုင်းဆဲ အော်ဒါများ")} <span className="customer-section-count">{total === null ? "…" : number(total)}</span></h2>
      <a className="customer-history-link" href="/order-history" onClick={onClose}>{t("View all", "အားလုံးကြည့်ရန်")}<ArrowRight size={15} aria-hidden /></a>
    </div>
    {recent.length ? <ul className="customer-pending-list">{recent.map(entry => { const order = entry.order; if (entry.kind === "runninghub") return <li key={`runninghub-${order.id}`}><a className="customer-runninghub-pending" href={`/runninghub?order=${order.id}`} onClick={onClose}>
      <div className="customer-pending-item-heading"><strong><bdi>#{order.id.slice(0, 8).toUpperCase()}</bdi></strong><time dateTime={order.createdAt}>{new Intl.DateTimeFormat(lang === "my" ? "my-MM" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Yangon" }).format(new Date(order.createdAt))}</time></div>
      <div className="customer-pending-item-meta"><p>Running HUB API Key</p><strong>{priceText(entry.order.priceMmk.toLocaleString("en-US") + " MMK", lang)}</strong></div><small>{runningHubHistoryStatus(entry.order, t)} <ArrowRight size={13} aria-hidden /></small>
    </a></li>; return <li key={order.id}>
      <div className="customer-pending-item-heading"><strong><bdi>#{order.id.slice(0, 8).toUpperCase()}</bdi></strong><time dateTime={order.createdAt}>{formatDate(order.createdAt, lang)}</time></div>
      <div className="customer-pending-item-meta"><p>{entry.order.lines.slice(0, 2).map(line => line.productName).join(" · ")}{entry.order.lines.length > 2 && <span> +{number(entry.order.lines.length - 2)}</span>}</p>{entry.order.totalMmk !== null && <strong>{priceText(entry.order.totalMmk.toLocaleString("en-US") + " MMK", lang)}</strong>}</div>
    </li>; })}</ul> : <p className="customer-empty">{total === null ? t("Refresh to load all pending orders.", "စောင့်ဆိုင်းဆဲ အော်ဒါအားလုံးကို ဖော်ပြရန် ပြန်ကြည့်ပါ။") : t("No pending orders.", "စောင့်ဆိုင်းဆဲ အော်ဒါ မရှိပါ။")}</p>}
  </section>;
}

export function AccountContent({ lang, checkout = false, embedded = false, history = false, resumeGoogle = false, googleReturnTo = "account", onClose }: AccountProps) {
  const Container = embedded ? "section" : "main";
  const Title = embedded ? "h2" : "h1";
  const t: Translate = (en, my) => lang === "my" ? my : en;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [telegram, setTelegram] = useState("");
  const [orders, setOrders] = useState<CommerceOrder[] | null>(null);
  const [runningHub, setRunningHub] = useState<RunningHubHistory | null>(null);
  const [runningHubFailed, setRunningHubFailed] = useState(false);
  const [moreStatus, setMoreStatus] = useState<RunningHubHistoryStatus | null>(null);
  const [moreFailed, setMoreFailed] = useState<RunningHubHistoryStatus | null>(null);
  const customerOwner = useRef<string | null>(null);
  const generation = useRef(0);
  const moreRequest = useRef<AbortController | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [historyFilter, setHistoryFilter] = useState<CommerceOrder["status"] | null>(null);
  const customerId = customer?.id;

  useEffect(() => {
    if (embedded) return;
    document.documentElement.lang = lang;
    return () => { document.documentElement.lang = "en"; };
  }, [lang, embedded]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const loadGeneration = ++generation.current;
    moreRequest.current?.abort(); moreRequest.current = null;
    const current = () => active && !controller.signal.aborted && loadGeneration === generation.current;
    const options = { cache: "no-store", signal: controller.signal } as const;
    async function load() {
      try {
        const session = await fetch(sessionPath, options);
        if (!session.ok) throw new Error("session");
        const { customer: person } = await session.json() as { customer: Customer | null };
        if (!current()) return;
        if (resumeGoogle) { customerOwner.current = null; setCustomer(null); setOrders(null); setRunningHub(null); setFailed(false); setLoading(false); return; }
        customerOwner.current = person?.id ?? null;
        setCustomer(person);
        setOrders(null);
        setRunningHub(null); setRunningHubFailed(false); setMoreStatus(null); setMoreFailed(null);
        if (person && checkout && !embedded) { window.location.replace("/?checkout=1"); return; }
        if (person && (embedded || history)) {
          const response = await fetch(`/api/customer/orders?view=${history ? "history" : "overview"}`, options);
          if (!current()) return;
          if (response.status === 401) { customerOwner.current = null; setCustomer(null); }
          else {
            if (!response.ok) throw new Error("orders");
            const data = await response.json() as { orders: CommerceOrder[]; telegram: string; customer: Customer };
            if (!current()) return;
            customerOwner.current = data.customer.id;
            setCustomer(data.customer); setTelegram(data.telegram); setOrders(data.orders);
            try {
              const statuses: RunningHubHistoryStatus[] = history ? ["purchased", "pending", "rejected"] : ["purchased", "pending"];
              const pages = await Promise.all(statuses.map(status => fetchRunningHubHistory(status, history ? 25 : 2, controller.signal)));
              if (!current()) return;
              if (pages.some(page => page.customerId !== data.customer.id)) throw new Error("identity");
              setRunningHub({ customerId: data.customer.id, counts: pages[0].counts,
                pages: Object.fromEntries(statuses.map((status, index) => [status, { orders: pages[index].orders, nextCursor: pages[index].nextCursor }])) });
            } catch (error) {
              if (!current()) return;
              if (error instanceof Error && error.message === "identity") {
                customerOwner.current = null; setCustomer(null); setOrders(null); setRunningHub(null); setReload(value => value + 1); return;
              }
              setRunningHubFailed(true);
            }
          }
        }
        if (current()) setFailed(false);
      } catch {
        if (current()) setFailed(true);
      } finally { if (current()) setLoading(false); }
    }
    void load();
    return () => { active = false; controller.abort(); moreRequest.current?.abort(); };
  }, [reload, checkout, embedded, history, resumeGoogle]);

  useEffect(() => {
    if (!customerId || (!embedded && !history)) return;
    const controller = new AbortController();
    // Product marks are public catalog data. A failed logo lookup must not hide orders.
    void fetch("/api/catalog", { signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const data = await response.json() as { products: Product[] };
      if (!controller.signal.aborted && Array.isArray(data.products)) setProducts(data.products);
    }).catch(() => {});
    return () => controller.abort();
  }, [customerId, embedded, history]);

  useEffect(() => {
    function clearOnLeave() { generation.current += 1; moreRequest.current?.abort(); customerOwner.current = null; setCustomer(null); setOrders(null); setRunningHub(null); setLoading(true); }
    function restore(event: PageTransitionEvent) { if (event.persisted) setReload(value => value + 1); }
    function checkOnReturn() { if (!document.hidden) setReload(value => value + 1); }
    window.addEventListener("pagehide", clearOnLeave);
    window.addEventListener("pageshow", restore);
    document.addEventListener("visibilitychange", checkOnReturn);
    window.addEventListener("focus", checkOnReturn);
    return () => {
      window.removeEventListener("pagehide", clearOnLeave);
      window.removeEventListener("pageshow", restore);
      document.removeEventListener("visibilitychange", checkOnReturn);
      window.removeEventListener("focus", checkOnReturn);
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
      customerOwner.current = null; generation.current += 1; moreRequest.current?.abort(); setRunningHub(null);
      setFailed(false);
      setLoggingOut(false);
      window.dispatchEvent(new Event("digimium-account-changed"));
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
    window.dispatchEvent(new Event("digimium-account-changed"));
    refresh();
  }

  const pending = orders?.filter(order => order.status === "pending") ?? [];
  const approved = orders?.filter(order => order.status === "approved") ?? [];
  const rejected = orders?.filter(order => order.status === "rejected") ?? [];
  const totalApproved = approved.length + (runningHub?.counts.purchased ?? 0);
  const totalPending = pending.length + (runningHub?.counts.pending ?? 0);
  const totalRejected = rejected.length + (runningHub?.counts.rejected ?? 0);
  const selectedHistory = historyFilter ?? (totalApproved > 0 ? "approved" : totalPending > 0 ? "pending" : totalRejected > 0 ? "rejected" : "approved");
  const historyOrders = selectedHistory === "approved" ? approved : selectedHistory === "pending" ? pending : rejected;
  const runningHubStatus: RunningHubHistoryStatus = selectedHistory === "approved" ? "purchased" : selectedHistory;
  const runningHubPage = runningHub?.pages[runningHubStatus];
  const historyEntries = mergeHistory(historyOrders, runningHubPage?.orders ?? []);
  const count = (value: number) => new Intl.NumberFormat(lang === "my" ? "my-MM" : "en-GB").format(value);

  async function loadOlderRunningHub() {
    if (!runningHubPage?.nextCursor || !customer || moreRequest.current || loading) return;
    const controller = new AbortController(); moreRequest.current = controller;
    const requestedGeneration = generation.current, ownerId = customer.id, status = runningHubStatus;
    const current = () => !controller.signal.aborted && requestedGeneration === generation.current && customerOwner.current === ownerId;
    setMoreStatus(status); setMoreFailed(null);
    try {
      const page = await fetchRunningHubHistory(status, 25, controller.signal, runningHubPage.nextCursor);
      if (!current()) return;
      if (page.customerId !== ownerId) throw new Error("identity");
      setRunningHub(previous => {
        if (!previous || previous.customerId !== ownerId) return previous;
        const rows = previous.pages[status]?.orders ?? [];
        return { ...previous, counts: page.counts, pages: { ...previous.pages, [status]: {
          orders: [...rows, ...page.orders.filter(order => !rows.some(existing => existing.id === order.id))], nextCursor: page.nextCursor,
        } } };
      });
    } catch (error) {
      if (!current()) return;
      if (error instanceof Error && error.message === "identity") { customerOwner.current = null; setCustomer(null); setOrders(null); setRunningHub(null); refresh(); }
      else setMoreFailed(status);
    } finally {
      if (moreRequest.current === controller) moreRequest.current = null;
      if (current()) setMoreStatus(null);
    }
  }
  return <Container className={"customer-page" + (embedded ? " customer-embedded" : "") + (history ? " customer-history-page" : !embedded ? " customer-profile-page" : "")} lang={lang}>
    {!embedded && <header className="customer-header">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- The storefront and account use separate documents. */}
      <a href="/" className="customer-brand" aria-label={t("Digimium store", "Digimium စတိုး")}><Image src="/assets/logo.png" alt="digimium." width={142} height={48} unoptimized /></a>
      <div className="customer-header-actions"><CustomerNotifications lang={lang} customerId={customer?.id ?? null}/>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Storefront only loads its analytics in a fresh document. */}
        <a className="customer-back" href="/"><ArrowLeft size={15} aria-hidden />{t("Back to store", "ဆိုင်သို့ ပြန်သွားရန်")}</a>
      </div>
    </header>}
    <div className="customer-main">
      {history && <div className="customer-history-heading"><h1>{t("Order history", "အော်ဒါမှတ်တမ်း")}</h1>
        <p>{t("Your purchases, subscription dates and order decisions.", "ဝယ်ထားတာ၊ သက်တမ်းနဲ့ အော်ဒါ အတည်ပြုမှု အခြေအနေကို ဒီမှာ ကြည့်ပါ။")}</p>
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
          <div className="customer-profile-actions">{embedded && !history && <a className="customer-account-settings" href="/account" onClick={onClose} aria-label={t("Account settings", "အကောင့် ဆက်တင်များ")} title={t("Account settings", "အကောင့် ဆက်တင်များ")}><Settings size={20} aria-hidden /></a>}
            <button className="customer-signout" type="button" onClick={logout} disabled={loggingOut}><LogOut size={16} aria-hidden />{loggingOut ? t("Signing out…", "ထွက်နေပါတယ်…") : t("Sign out", "အကောင့်ထွက်ရန်")}</button></div>
        </div>
        {!history && <AccountDetails customer={customer} lang={lang} t={t} />}
        {!embedded && !history && <AccountConnections customer={customer} t={t} onUpdated={setCustomer} />}
        {!embedded && !history && customer.passwordAvailable !== false && <PasswordForm t={t} onUpdated={setCustomer} onSignedOut={() => { setCustomer(null); setOrders(null); refresh(); }} />}
        {!embedded && !history && customer.passwordAvailable === false && <p className="customer-google-connected">{customer.telegram ? t("Telegram account", "Telegram အကောင့်") : t("Google account", "Google အကောင့်")}</p>}
        {(embedded || history) && !orders && !failed && <p role="status">{t("Loading orders…", "အော်ဒါများကို ဖော်ပြနေပါတယ်…")}</p>}
        {orders && <>
          {!runningHub && loading && <p role="status">{t("Loading Running HUB orders…", "Running HUB အော်ဒါများ ဖော်ပြနေသည်…")}</p>}
          {runningHubFailed && <div className="customer-alert" role="alert">{t("Running HUB orders could not be loaded.", "Running HUB အော်ဒါများ ဖော်ပြ၍ မရသေးပါ။")}<button type="button" onClick={refresh} disabled={loading}>{t("Retry", "ပြန်ကြိုးစားရန်")}</button></div>}
          {embedded && !history && <RecentOrders orders={approved} runningHub={runningHub?.pages.purchased?.orders ?? []} lang={lang} t={t} products={products} brief onClose={onClose} />}
          {embedded && !history && <PendingPreview orders={pending} runningHub={runningHub?.pages.pending?.orders ?? []} total={runningHub ? totalPending : null} lang={lang} t={t} onClose={onClose} />}
          {history && <section className="customer-section customer-history-orders" aria-labelledby="customer-history-list-title">
            <div className="customer-history-toolbar">
              <div className="customer-history-filters" role="group" aria-label={t("Order status", "အော်ဒါ အခြေအနေ ရွေးရန်")}>
                <button type="button" aria-pressed={selectedHistory === "approved"} aria-controls="customer-history-list" onClick={() => setHistoryFilter("approved")}>{t("Purchased", "ဝယ်ယူပြီး")} <span>{runningHub ? count(totalApproved) : "…"}</span></button>
                <button type="button" aria-pressed={selectedHistory === "pending"} aria-controls="customer-history-list" onClick={() => setHistoryFilter("pending")}>{t("Pending", "စောင့်ဆိုင်းဆဲ")} <span>{runningHub ? count(totalPending) : "…"}</span></button>
                <button type="button" aria-pressed={selectedHistory === "rejected"} aria-controls="customer-history-list" onClick={() => setHistoryFilter("rejected")}>{t("Rejected", "ငြင်းပယ်ထားသည်")} <span>{runningHub ? count(totalRejected) : "…"}</span></button>
              </div>
              <button type="button" className="customer-refresh" lang="en" onClick={refresh} disabled={loading}><RefreshCw size={15} aria-hidden />Refresh</button>
            </div>
            <div id="customer-history-list" aria-live="polite" aria-busy={loading}>
              <h2 id="customer-history-list-title" className="customer-history-list-title">{selectedHistory === "rejected" ? t("Rejected or expired orders", "ငြင်းပယ်ထားသော သို့မဟုတ် အချိန်ကုန်သွားသော အော်ဒါများ") : selectedHistory === "approved" ? t("Purchased plans", "ဝယ်ယူထားသော အစီအစဉ်များ") : t("Pending orders", "စောင့်ဆိုင်းဆဲ အော်ဒါများ")}</h2>
              {selectedHistory === "pending" && pending.length > 0 && <p className="customer-section-help">{t("For Telegram orders, send your order message and wait for shop approval.", "Telegram မှ မှာယူသော အော်ဒါများအတွက် အော်ဒါစာပို့ပြီး ဆိုင်အတည်ပြုချက်ကို စောင့်ပါ။")}</p>}
              {historyEntries.length ? <div className="customer-order-grid">{historyEntries.map(entry => entry.kind === "runninghub"
                ? <RunningHubHistoryCard key={`runninghub-${entry.order.id}`} order={entry.order} lang={lang} t={t}/>
                : <OrderCard key={entry.order.id} order={entry.order} customer={customer} telegram={telegram} lang={lang} t={t} embedded={embedded} products={products} onClose={onClose} />)}</div>
                : runningHub && <p className="customer-empty">{selectedHistory === "rejected" ? t("No rejected or expired orders.", "ငြင်းပယ်ထားသော သို့မဟုတ် အချိန်ကုန်သွားသော အော်ဒါ မရှိပါ။") : selectedHistory === "pending" ? t("No pending orders.", "စောင့်ဆိုင်းဆဲ အော်ဒါ မရှိပါ။") : t("Approved orders and subscription dates will appear here.", "အော်ဒါ အတည်ပြုပြီးရင် ဝယ်ယူမှုမှတ်တမ်းနဲ့ ဝန်ဆောင်မှုသက်တမ်းကို ဒီမှာ ကြည့်နိုင်ပါတယ်။")}</p>}
              {runningHubPage?.nextCursor && <div className="customer-runninghub-more"><button type="button" onClick={() => void loadOlderRunningHub()} disabled={loading || !!moreStatus}>{moreStatus === runningHubStatus ? t("Loading…", "ဖော်ပြနေသည်…") : t("Load older Running HUB orders", "Running HUB အော်ဒါအဟောင်းများ ဆက်ကြည့်ရန်")}</button>
                <p>{t(`${runningHubPage.orders.length} of ${runningHub?.counts[runningHubStatus]} Running HUB orders shown`, `Running HUB အော်ဒါ ${count(runningHub?.counts[runningHubStatus] ?? 0)} ခုအနက် ${count(runningHubPage.orders.length)} ခု ပြထားသည်`)}</p>
              </div>}
              {moreFailed === runningHubStatus && <p className="customer-error" role="alert">{t("Older Running HUB orders could not be loaded. Try the button again.", "Running HUB အော်ဒါအဟောင်းများ ဖော်ပြ၍ မရပါ။ ခလုတ်ကို ပြန်နှိပ်ပြီး ကြိုးစားပါ။")}</p>}
            </div>
            <a href="/account" className="customer-history-account">{t("Account settings", "အကောင့်အချက်အလက် ကြည့်ရန်")}<ArrowRight size={16} aria-hidden /></a>
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
