'use client';

import Image from 'next/image';
import {ArrowUpRight,CheckCircle2,CircleAlert,Clock3,QrCode,RefreshCw,Send} from 'lucide-react';
import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import type {TelegramLoginController} from './use-telegram-login';
import './telegram-login.css';

type Translate=(en:string,my:string)=>string;

export function TelegramLogin({login,t}:{login:TelegramLoginController;t:Translate}) {
  const {challenge,status,error,busy,secondsLeft}=login;
  const linking=login.purpose==='link';
  const waiting=status==='waiting';
  const terminal=status==='expired'||status==='rejected'||status==='error';
  const [qr,setQr]=useState<{flow:string;state:'loading'|'ready'|'error';src?:string}|null>(null);
  const qrRequest=useRef(0);
  const root=useRef<HTMLDivElement>(null);
  const qrId=useId();
  const qrShown=waiting&&Boolean(challenge)&&qr?.flow===challenge?.flow;
  useLayoutEffect(()=>{
    const scroll=root.current?.closest<HTMLElement>('.order-scroll');
    if(scroll)scroll.scrollTop=0;
  },[challenge?.flow]);
  useEffect(()=>()=>{
    // This counter invalidates late QR generation after refresh, expiry, approval or unmount.
    qrRequest.current++;
  },[challenge?.flow,waiting]);
  async function toggleQr() {
    const run=++qrRequest.current;
    if(qrShown){setQr(null);return;}
    if(!challenge||!waiting)return;
    const flow=challenge.flow;
    setQr({flow,state:'loading'});
    try {
      const QRCode=await import('qrcode');
      const src=await QRCode.toDataURL(challenge.url,{width:192,margin:2,errorCorrectionLevel:'M',color:{dark:'#051650',light:'#ffffff'}});
      if(qrRequest.current===run)setQr({flow,state:'ready',src});
    }catch{if(qrRequest.current===run)setQr({flow,state:'error'});}
  }
  const errors:Record<string,string>={
    connection:t('Reconnecting… Keep this page open.','ပြန်ချိတ်ဆက်နေပါတယ်… ဒီစာမျက်နှာကို ဖွင့်ထားပေးပါ။'),
    rate_limited:t('Too many attempts. Please try again in a few minutes.','အကြိမ်ရေ များသွားပါတယ်။ မိနစ်အနည်းငယ်ကြာမှ ပြန်ကြိုးစားပါ။'),
    expired:t('This code has expired. Get a new code to continue.','ဒီ code ရဲ့ အချိန်ကုန်သွားပါပြီ။ Code အသစ်ယူပြီး ဆက်လုပ်ပါ။'),
    cancelled:t('This sign-in is no longer active. Get a new code to continue.','ဒီအကောင့်ဝင်ခြင်းကို ပယ်ဖျက်ထားပါတယ်။ Code အသစ်ယူပြီး ဆက်လုပ်ပါ။'),
    signed_out:t('Sign in to your website account before connecting Telegram.','Telegram မချိတ်ခင် website အကောင့်ကို အရင်ဝင်ပါ။'),
    session_changed:t('Your website session changed. Start again from Account settings.','Website အကောင့်ဝင်ထားမှု ပြောင်းသွားပါတယ်။ Account ဆက်တင်များကနေ ပြန်စပါ။'),
    telegram_in_use:t('This Telegram is connected to another website account. Use that account or a different Telegram.','ဒီ Telegram ကို အခြား website အကောင့်နဲ့ ချိတ်ထားပြီးပါပြီ။ အဲ့ဒီအကောင့် သို့မဟုတ် အခြား Telegram ကို သုံးပါ။'),
    telegram_already_linked:t('This account already has a Telegram connection. Refresh Account settings.','ဒီအကောင့်မှာ Telegram ချိတ်ထားပြီးပါပြီ။ Account ဆက်တင်များကို ပြန်ဖွင့်ပါ။'),
  };
  const label=status==='starting'?t('Preparing your code…','Code ပြင်ဆင်နေပါတယ်…'):status==='approved'?(linking?t('Confirmed. Connecting Telegram…','အတည်ပြုပြီးပါပြီ။ Telegram ချိတ်ဆက်နေပါတယ်…'):t('Confirmed. Signing you in…','အတည်ပြုပြီးပါပြီ။ အကောင့်ဝင်နေပါတယ်…')):status==='expired'?t('Code expired','Code အချိန်ကုန်သွားပါပြီ'):status==='rejected'?t('Request rejected','တောင်းဆိုမှုကို ငြင်းပယ်လိုက်ပါတယ်'):status==='error'?t('Couldn’t continue','ဆက်လုပ်၍ မရသေးပါ'):t('Waiting for Telegram','Telegram မှ အတည်ပြုမှု စောင့်နေပါတယ်');
  const StatusIcon=status==='approved'?CheckCircle2:status==='rejected'||status==='error'?CircleAlert:Clock3;
  return <div ref={root} className="customer-telegram-login" data-state={status} aria-busy={busy}>
    <p className="customer-telegram-login-status" role="status"><StatusIcon size={17} aria-hidden/><span>{label}</span></p>
    {!terminal&&<p className="customer-telegram-login-instruction">{status==='approved'?t('Keep this page open while we finish.','အကောင့်ဝင်ပြီးသည်အထိ ဒီစာမျက်နှာကို ဖွင့်ထားပေးပါ။'):t('Open Telegram and choose this code in the bot.','Telegram ဖွင့်ပြီး bot မှာ ဒီ code နဲ့ တူတာကို ရွေးပေးပါ။')}</p>}
    {challenge&&<>
      <div className="customer-telegram-code" role="group" aria-label={t('Choose code '+challenge.code+' in Telegram.','Telegram မှာ code '+challenge.code+' ကို ရွေးပါ။')}>
        {challenge.code.split('').map((digit,index)=><span key={index} aria-hidden="true">{digit}</span>)}
      </div>
      {waiting&&<a className="customer-primary customer-telegram-open" href={challenge.url} target="_blank" rel="noopener noreferrer"><Send size={17} aria-hidden/>{t('Open Telegram','Telegram ဖွင့်မယ်')}<ArrowUpRight size={17} aria-hidden/></a>}
      {waiting&&<>
        <button className="customer-telegram-qr-toggle" type="button" onClick={()=>{void toggleQr();}} aria-expanded={qrShown} aria-controls={qrId}><QrCode size={16} aria-hidden/>{qrShown?t('Hide QR code','QR ပိတ်မယ်'):t('Use Telegram on another phone? Show QR','အခြားဖုန်းက Telegram နဲ့ ဝင်မယ်။ QR ပြမယ်')}</button>
        {qrShown&&<div className="customer-telegram-qr" id={qrId}>
          {qr?.state==='ready'&&qr.src?<><Image src={qr.src} width={192} height={192} alt={t('Scan to open the Telegram login bot','Telegram login bot ဖွင့်ရန် scan ဖတ်ပါ')} unoptimized/><p>{t('Scan with your phone to open the bot. Choose the same code shown above.','ဖုန်းနဲ့ QR ကို scan ဖတ်ပြီး bot ဖွင့်ပါ။ အပေါ်က code နဲ့ တူတာကို ရွေးပေးပါ။')}</p></>:<p role="status">{qr?.state==='error'?t('Couldn’t create the QR. Use Open Telegram or try again.','QR ပြ၍ မရသေးပါ။ Telegram ဖွင့်မယ် ကို နှိပ်ပါ သို့မဟုတ် ပြန်ကြိုးစားပါ။'):t('Preparing QR…','QR ပြင်ဆင်နေပါတယ်…')}</p>}
        </div>}
      </>}
      {waiting&&<div className="customer-telegram-time">
        <progress value={secondsLeft} max={300} aria-label={t('Code time remaining','Code သက်တမ်း လက်ကျန်')}/>
        <p><Clock3 size={14} aria-hidden/><span>{Math.floor(secondsLeft/60)}:{String(secondsLeft%60).padStart(2,'0')}</span><span>{t('remaining','ကျန်ပါသေးတယ်')}</span></p>
      </div>}
    </>}
    {status==='starting'&&<div className="customer-telegram-code customer-telegram-code-placeholder" aria-hidden="true"><span>·</span><span>·</span><span>·</span><span>·</span></div>}
    {status==='expired'&&!error&&<p className="customer-telegram-login-note">{t('Get a new code, then open the bot again.','Code အသစ်ယူပြီး bot ကို ပြန်ဖွင့်ပါ။')}</p>}
    {status==='rejected'&&<p className="customer-telegram-login-note">{t('You can try again with a new code.','Code အသစ်နဲ့ ပြန်ကြိုးစားနိုင်ပါတယ်။')}</p>}
    {error&&<p className={'customer-telegram-login-note'+(error==='connection'?'':' customer-error')} role={error==='connection'?'status':'alert'}>{errors[error]||t('Telegram sign-in is unavailable. Try again or choose another method.','Telegram ဖြင့် ခေတ္တအကောင့်ဝင်မရပါ။ ပြန်ကြိုးစားပါ သို့မဟုတ် အခြားနည်းလမ်းရွေးပါ။')}</p>}
    <div className="customer-telegram-login-actions">
      <button type="button" disabled={busy} onClick={()=>{void login.refresh();}}><RefreshCw size={15} aria-hidden/>{terminal?t('Get a new code','Code အသစ်ယူမယ်'):<span lang="en">Refresh code</span>}</button>
      <button type="button" disabled={status==='approved'} onClick={login.cancel}>{t('Cancel','ပယ်ဖျက်မယ်')}</button>
    </div>
  </div>;
}
