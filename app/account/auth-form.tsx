'use client';

import Image from 'next/image';
import { ArrowLeft, ArrowRight, ArrowUpRight, Eye, EyeOff, Phone } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { CommerceCustomer } from '../../lib/commerce-types';
import { useGoogleLogin } from './use-google-login';
import { useTelegramLogin } from './use-telegram-login';
import { TelegramLogin } from './telegram-login';
import type { ShopLanguage } from '../../lib/shop-language';
import './auth-form.css';

type Translate = (en: string, my: string) => string;
type AuthFormProps = {
  checkout: boolean;
  embedded: boolean;
  history: boolean;
  resumeGoogle?: boolean;
  t: Translate;
  onSuccess: (customer: CommerceCustomer) => void;
  onGuest?: () => void;
  onBusyChange?: (busy: boolean) => void;
};
type Step = 'email' | 'password' | 'new-password' | 'name' | 'google-link' | 'google-name';

function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285f4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.6-4.1 6v5h6.6c3.9-3.6 6.1-8.6 6.1-14.7Z"/>
    <path fill="#34a853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20.4 20.4 0 0 0 24 44Z"/>
    <path fill="#fbbc05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.2H5.8a20 20 0 0 0 0 17.6l6.8-5.2Z"/>
    <path fill="#ea4335" d="M24 12c3 0 5.6 1 7.7 3l5.8-5.8A19.7 19.7 0 0 0 24 4 20.4 20.4 0 0 0 5.8 15.2l6.8 5.2A12 12 0 0 1 24 12Z"/>
  </svg>;
}

export function CheckoutAuth({ lang, ...props }: Omit<AuthFormProps, 't' | 'checkout' | 'embedded' | 'history'> & {lang: ShopLanguage}) {
  return <AuthForm {...props} checkout embedded history={false} t={(en, my) => lang === 'my' ? my : en} />;
}

export function AuthForm({ checkout, embedded, history, resumeGoogle = false, t, onSuccess, onGuest, onBusyChange }: AuthFormProps) {
  const [step, setStepValue] = useState<Step>('email');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordHelp, setPasswordHelp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailBusy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const hintId = useId();
  const passwordId = useId();
  const passwordHelpId = useId();
  function setStep(next: Step) { setPasswordVisible(false); setPasswordHelp(false); setStepValue(next); }
  function signedIn(customer: CommerceCustomer) { setPasswordVisible(false); setPasswordHelp(false); onSuccess(customer); }
  const google = useGoogleLogin(checkout ? 'checkout' : history ? 'history' : 'account', {
    onSuccess: signedIn,
    onBusyChange,
    onPending: (kind, address) => { setPassword(''); setError(''); if (address) setEmail(address); setStep(kind === 'link' ? 'google-link' : 'google-name'); },
  });
  const telegram = useTelegramLogin(checkout ? 'checkout' : history ? 'history' : 'account', {onSuccess: signedIn, onBusyChange}, {autoResume: !resumeGoogle});
  const busy = emailBusy || google.busy || telegram.busy;
  const googleErrors: Record<string,string> = {
    popup_blocked: t('Allow the Google sign-in window, then try again.', 'Google အကောင့်ဝင်တဲ့ window ဖွင့်ခွင့်ပေးပြီး ပြန်ကြိုးစားပါ။'),
    cancelled: t('Google sign-in was cancelled. You can try again.', 'Google အကောင့်ဝင်ခြင်းကို ပိတ်လိုက်ပါတယ်။ ပြန်ကြိုးစားနိုင်ပါတယ်။'),
    expired: t('Google sign-in expired. Please start again.', 'Google အကောင့်ဝင်ချိန် ကုန်သွားပါပြီ။ အစက ပြန်ဝင်ပါ။'),
    credentials: t('The existing account password is incorrect.', 'ရှိပြီးသားအကောင့်ရဲ့ စကားဝှက် မှားနေပါတယ်။'),
    account_conflict: t('This email is linked to another account. Use email sign-in.', 'ဒီ email ကို အခြားအကောင့်နဲ့ ချိတ်ထားပါတယ်။ Email ဖြင့် အကောင့်ဝင်ပါ။'),
    rate_limited: t('Too many attempts. Try again in 15 minutes.', 'အကြိမ်ရေ များသွားပါတယ်။ ၁၅ မိနစ်နောက် ပြန်ကြိုးစားပါ။'),
  };
  const googleError = google.error ? googleErrors[google.error] || t('Google sign-in is unavailable. Try again or use email.', 'Google ဖြင့် ခေတ္တအကောင့်ဝင်မရပါ။ ပြန်ကြိုးစားပါ သို့မဟုတ် Email ဖြင့် ဝင်ပါ။') : '';
  const Title = embedded || history ? 'h2' : 'h1';
  const title = telegram.active ? t('Continue with Telegram', 'Telegram ဖြင့် ဝင်မယ်') : step === 'google-link' ? t('Connect your existing account', 'ရှိပြီးသားအကောင့် ချိတ်ဆက်မယ်') : step === 'google-name' ? t('Your name', 'သင့်နာမည်') : step === 'email' ? t('Log in or sign up', 'အကောင့်ဝင် / ဖွင့်ရန်') : step === 'password' ? t('Enter your password', 'စကားဝှက် ထည့်ပါ') : step === 'new-password' ? t('Create your account', 'အကောင့်အသစ် ဖွင့်မယ်') : t('What should we call you?', 'နာမည် ထည့်ပါ');

  useEffect(() => {
    if (step !== 'email' || telegram.active) heading.current?.focus({preventScroll: true});
  }, [step, telegram.active]);

  function back() {
    if (inFlight.current || busy) return;
    google.cancel();
    telegram.cancel();
    setError('');
    setPassword('');
    setStep(step === 'name' ? 'new-password' : 'email');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || google.busy || telegram.busy) return;
    const values = new FormData(event.currentTarget);
    if (step === 'email') { google.cancel(); telegram.cancel(); }
    google.clearError();
    if (step === 'google-link' || step === 'google-name') {
      await google.complete(step === 'google-link' ? {password:String(values.get('password') || '')} : {name:String(values.get('name') || '')});
      return;
    }
    if (step === 'new-password') {
      setPassword(String(values.get('password') || ''));
      setError('');
      setStep('name');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    try {
      const lookup = step === 'email';
      const response = await fetch(lookup ? '/api/customer/email-step' : '/api/customer/session', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, cache: 'no-store',
        body: JSON.stringify(lookup ? {email} : {
          action: step === 'name' ? 'register' : 'login', email,
          password: step === 'name' ? password : values.get('password'), name: values.get('name'),
        }),
      });
      const data = await response.json() as {next?: 'password' | 'register' | 'google'; customer?: CommerceCustomer; error?: string};
      if (response.ok) {
        if (lookup && data.next === 'google') {
          setError(t('This account uses Google. Choose Continue with Google above.', 'ဒီအကောင့်က Google ဖြင့် ဝင်ရတဲ့အကောင့်ပါ။ အပေါ်က Google ဖြင့် ဝင်မယ် ကို ရွေးပါ။'));
          return;
        }
        if (lookup && (data.next === 'password' || data.next === 'register')) {
          setEmail(email.trim().toLowerCase());
          setStep(data.next === 'password' ? 'password' : 'new-password');
          return;
        }
        if (!lookup && data.customer) { setPassword(''); signedIn(data.customer); return; }
      }
      const messages: Record<string, string> = {
        credentials: t('The password is incorrect. Try again.', 'စကားဝှက် မှားနေပါတယ်။ ပြန်ကြိုးစားပါ။'),
        invalid: t('Check your details and try again.', 'ဖြည့်ထားတဲ့ အချက်အလက်တွေ စစ်ဆေးပြီး ပြန်ကြိုးစားပါ။'),
        registration: t('This email may already have an account. Go back and sign in.', 'ဒီ email နဲ့ အကောင့်ရှိပြီးသား ဖြစ်နိုင်ပါတယ်။ နောက်ပြန်သွားပြီး အကောင့်ဝင်ပါ။'),
        rate_limited: t('Too many attempts. Try again in 15 minutes.', 'အကြိမ်ရေ များသွားပါတယ်။ ၁၅ မိနစ်နောက် ပြန်ကြိုးစားပါ။'),
      };
      setError(messages[data.error || ''] || t('We couldn’t continue. Please try again.', 'ဆက်လုပ်၍ မရသေးပါ။ ပြန်ကြိုးစားပါ။'));
    } catch {
      setError(t('Couldn’t connect. Check your connection and try again.', 'ချိတ်ဆက်၍ မရပါ။ အင်တာနက် စစ်ဆေးပြီး ပြန်ကြိုးစားပါ။'));
    } finally { inFlight.current = false; setBusy(false); onBusyChange?.(false); }
  }

  return <section className={'customer-auth customer-auth-progressive' + (onGuest ? ' customer-checkout-auth' : '')} aria-labelledby={titleId}>
    <Title ref={heading} tabIndex={-1} id={titleId}>{title}</Title>
    {telegram.active ? <TelegramLogin login={telegram} t={t}/> : <>
    {step === 'email' ? <>
      <p className="customer-auth-intro">{t('Choose how you’d like to continue.', 'အကောင့်ဝင်ရန် နည်းလမ်းရွေးပါ။')}</p>
      <div className="customer-providers" aria-label={t('Sign-in methods', 'အကောင့်ဝင်ရန် နည်းလမ်းများ')}>
        <button type="button" className="customer-provider" data-ready={google.enabled || undefined} disabled={busy || !google.enabled} onClick={() => { telegram.cancel(); setError(''); void google.start(); }}><GoogleMark/><span>{t('Continue with Google', 'Google ဖြင့် ဝင်မယ်')}</span>{google.enabled === false && <small>Coming soon</small>}</button>
        <button type="button" className="customer-provider" data-ready={telegram.enabled || undefined} disabled={busy || !telegram.enabled} onClick={() => { google.cancel(); setError(''); setPassword(''); setStep('email'); void telegram.start(); }}><Image src="/assets/marks/telegram.svg" alt="" width={20} height={20} unoptimized /><span>{t('Continue with Telegram', 'Telegram ဖြင့် ဝင်မယ်')}</span>{telegram.enabled === false && <small>Coming soon</small>}</button>
        <button type="button" className="customer-provider" disabled><Phone size={20} aria-hidden/><span>{t('Continue with phone', 'ဖုန်းနံပါတ်ဖြင့် ဝင်မယ်')}</span><small>Coming soon</small></button>
      </div>
      <div className="customer-auth-divider"><span>{t('or use email', 'သို့မဟုတ် email ဖြင့်')}</span></div>
    </> : <div className="customer-auth-email"><span>{email}</span><button type="button" disabled={busy} onClick={back}><ArrowLeft size={14} aria-hidden/>{t('Back', 'ပြန်သွားရန်')}</button></div>}
    {step === 'google-link' && <p className="customer-auth-intro">{t('An account already uses this email. Confirm its password once to connect Google and keep your orders.', 'ဒီ email နဲ့ အကောင့်ရှိပြီးသားပါ။ Google နဲ့ ချိတ်ပြီး အော်ဒါမှတ်တမ်းတွေ ဆက်သုံးဖို့ ရှိပြီးသားစကားဝှက်ကို တစ်ကြိမ် အတည်ပြုပေးပါ။')}</p>}
    {step === 'google-name' && <p className="customer-auth-intro">{t('Google is verified. Add your name to finish creating your account.', 'Google အကောင့်ကို အတည်ပြုပြီးပါပြီ။ အကောင့်ဖွင့်ပြီးဖို့ သင့်နာမည် ထည့်ပေးပါ။')}</p>}
    {google.busy && step === 'email' && <div className="customer-google-wait" role="status"><p>{t('Finish signing in in the Google window.', 'Google window မှာ အကောင့်ဝင်ပြီး အတည်ပြုပေးပါ။')}</p><button type="button" onClick={google.cancel}>{t('Cancel Google sign-in', 'Google အကောင့်ဝင်ခြင်း ပယ်ဖျက်ရန်')}</button></div>}
    {googleError && <p role="alert" className="customer-error customer-google-error">{googleError}</p>}
    {step === 'new-password' && <p className="customer-auth-intro" role="status">{t('There’s no account with this email yet. Choose a password to create one.', 'ဒီ email နဲ့ အကောင့်မရှိသေးပါ။ အကောင့်ဖွင့်ဖို့ စကားဝှက်အသစ် သတ်မှတ်ပါ။')}</p>}
    <form key={step} onSubmit={submit} aria-busy={busy}>
      {step === 'email' && <label>{t('Email address', 'အီးမေးလ်')}<input name="email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" autoCapitalize="none" maxLength={254} required disabled={busy}/></label>}
      {(step === 'password' || step === 'new-password' || step === 'google-link') && <>
        <input type="hidden" name="email" autoComplete="username" value={email}/>
        <div className="customer-password-field"><label htmlFor={passwordId}>{step !== 'new-password' ? t('Password', 'စကားဝှက်') : t('Create a password', 'စကားဝှက်အသစ်')}</label><div className="customer-password-entry"><input id={passwordId} name="password" type={passwordVisible ? 'text' : 'password'} autoComplete={step === 'new-password' ? 'new-password' : 'current-password'} minLength={step === 'new-password' ? 10 : undefined} maxLength={256} required disabled={busy} aria-describedby={step === 'new-password' ? hintId : undefined}/><button type="button" disabled={busy} aria-controls={passwordId} aria-pressed={passwordVisible} aria-label={passwordVisible ? t('Hide password', 'စကားဝှက် ဖျောက်ရန်') : t('Show password', 'စကားဝှက် ပြရန်')} onClick={() => setPasswordVisible(!passwordVisible)}>{passwordVisible ? <EyeOff size={17} aria-hidden/> : <Eye size={17} aria-hidden/>}<span>{passwordVisible ? t('Hide', 'ဖျောက်မယ်') : t('Show', 'ပြမယ်')}</span></button></div></div>
        {step === 'new-password' && <small id={hintId}>{t('Use at least 10 characters.', 'အနည်းဆုံး စာလုံး ၁၀ လုံး သုံးပါ။')}</small>}
        {step !== 'new-password' && <div className="customer-password-assistance"><button type="button" className="customer-password-help-toggle" disabled={busy} aria-expanded={passwordHelp} aria-controls={passwordHelpId} onClick={() => setPasswordHelp(!passwordHelp)}>{t('Need help with your password?', 'စကားဝှက်အတွက် အကူအညီလိုပါသလား?')}</button>{passwordHelp && <div className="customer-password-help" id={passwordHelpId}><p>{t('If you don’t remember your password, contact Digimium for help verifying your account.', 'စကားဝှက် မမှတ်မိပါက သင့်အကောင့်ကို အတည်ပြုပြီး အကူအညီရယူရန် Digimium ကို ဆက်သွယ်ပါ။')}</p><a href="/#contact" target="_blank" rel="noopener noreferrer" aria-label={t('Contact Digimium for password help — opens a new tab', 'စကားဝှက်အကူအညီအတွက် Digimium ကို ဆက်သွယ်ရန် — tab အသစ်တွင် ဖွင့်မည်')}>{t('Contact Digimium', 'Digimium ကို ဆက်သွယ်မယ်')}<ArrowUpRight size={16} aria-hidden/></a></div>}</div>}
      </>}
      {(step === 'name' || step === 'google-name') && <label>{t('Your name', 'သင့်နာမည်')}<input name="name" autoComplete="name" maxLength={100} required disabled={busy}/></label>}
      {error && <p role="alert" className="customer-error">{error}</p>}
      <button type="submit" className="customer-primary" disabled={busy}>{busy ? t('Please wait…', 'ခဏစောင့်ပါ…') : (step === 'name' || step === 'google-name') ? t('Create account', 'အကောင့်ဖွင့်မယ်') : step === 'google-link' ? t('Connect Google', 'Google နဲ့ ချိတ်ဆက်မယ်') : step === 'password' ? t('Log in', 'အကောင့်ဝင်မယ်') : t('Continue', 'ဆက်လုပ်မယ်')}<ArrowRight size={17} aria-hidden/></button>
    </form>
    </>}
    {checkout && <div className="customer-auth-alternative">{onGuest ? <button type="button" className="customer-guest-link" disabled={busy} onClick={() => { google.cancel(); telegram.cancel(); onGuest(); }}>{t('Buy on Telegram', 'Telegram မှဝယ်ယူမည်')}<ArrowUpRight size={16} aria-hidden/></button>
      // eslint-disable-next-line @next/next/no-html-link-for-pages -- Restore the checkout in a fresh storefront document.
      : <a className="customer-guest-link" href="/?checkout=1">{t('Buy on Telegram', 'Telegram မှဝယ်ယူမည်')}<ArrowUpRight size={16} aria-hidden/></a>}</div>}
  </section>;
}
