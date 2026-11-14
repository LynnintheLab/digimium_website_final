> ပထမ UX review ၏ အသေးစိတ်မှတ်တမ်းဖြစ်သည်။ နောက်ဆုံးရွေးချယ်ထားသော floating menu၊ ဝယ်ယူမည် စာသားနှင့် revised wireframe အတွက် [အတိုချုပ် report](REPORT.md) ကို ကြည့်ပါ။ အောက်ပါ A/B နှင့် ပုံဖော်ပုံတချို့သည် မူလ proposal ကို မှတ်တမ်းတင်ထားခြင်း ဖြစ်သည်။

# Digimium UX စမ်းသပ်မှုနှင့် ပြင်ဆင်ရန် wireframe

**စစ်ဆေးသည့်နေ့ — 15 November 2026**
**အဓိကအကြံပြုချက် — ဖုန်းမှာ စာသားပါတဲ့ အောက်ခြေ menu ကို စမ်းသုံးပြီး၊ ပေးချေနိုင်သည့် နည်းလမ်းတွေကို header အောက်နဲ့ အော်ဒါပြန်စစ်သည့်နေရာမှာ ပြပါ။**

ဒီတစ်ကြိမ်မှာ website ကို မပြင်ထားပါ။ Expert cognitive walkthrough၊ browser interaction၊ အရွယ်အစား/အရောင်တိုင်းတာမှုနဲ့ source review ကို လုပ်ထားပါတယ်။ **လူကြီးပိုင်း participant မပါဝင်သေးပါ။** ဒါကြောင့် “လူကြီးတွေ ဘယ်နှရာခိုင်နှုန်း သုံးနိုင်ပြီ” ဆိုတဲ့ ရလဒ်မဟုတ်သလို WCAG အားလုံးကို ပြည့်မီကြောင်း certification လည်း မဟုတ်ပါ။

## ရလဒ်နှင့် ဦးစားပေး

အဓိကတွေ့ရှိချက် **၉ ခု — P1 အရေးကြီး ၂ ခု၊ P2 ပြင်ဆင်သင့် ၇ ခု**။ စမ်းသပ်ထားသည့် အပိုင်းတွင် P0 အဆင့် ပိတ်ဆို့မှုကို အတည်မပြုတွေ့ရှိပါ။ အော်ဒါတင်သည့် နောက်ဆုံးအဆင့်ကို live မှာ မလုပ်ထားသောကြောင့် ဝယ်ယူမှုတစ်ခုလုံး အောင်မြင်ပြီးကြောင်း မဆိုလိုပါ။

ပထမဦးစားပေး ပြင်သင့်တာတွေက ဝယ်ယူနည်းနှစ်မျိုးကို မှတ်တမ်းရရှိမှုအပေါ် အခြေခံပြီး ရှင်းပြခြင်း၊ password မေ့သွားလျှင် အကူအညီရယူနိုင်မည့် လမ်းကြောင်းပေးခြင်း၊ အဓိကလုပ်ဆောင်ချက်တွေကို မြန်မာလို ပြခြင်းနဲ့ ဖုန်းမှာ စာသားပါတဲ့ navigation ပေးခြင်းတို့ ဖြစ်ပါတယ်။

**P1** = အဓိကဝယ်ယူမှု/အကောင့်ပြန်ဝင်မှုမှာ အခက်အခဲကြီးစေနိုင်သော အချက်။
**P2** = လုပ်ဆောင်နိုင်သေးပေမယ့် ဖတ်ရှုခြင်း၊ ရွေးချယ်ခြင်း၊ နားလည်ခြင်းကို ခက်ခဲစေသော အချက်။

## ဘာတွေ စမ်းသပ်ထားလဲ

- Staging storefront: `https://test.buywith-digimium.store/`၊ inline Account၊ `/order-history`။ လက်ရှိ signed-in session ကို ဆက်ထိန်းထားသည်။
- Local standalone account form: provider secret နဲ့ database credential မပါသော သီးခြား runtime။ Email field၊ input boundary နဲ့ invalid email ကိုသာ စစ်သည်။ Google/Telegram အားလုံး disabled ဖြစ်ခြင်းက **local configuration ကြောင့်** ဖြစ်ပြီး production provider မရခြင်းဟု မသတ်မှတ်ပါ။
- Chrome: ပုံမှန် 900 × 987 CSS px၊ phone viewport 390 × 844၊ narrow viewport 320 × 780။ Desktop browser ပေါ်က responsive simulation ဖြစ်ပြီး တကယ့် ဖုန်း hardware စမ်းသပ်မှု မဟုတ်ပါ။
- တကယ့် Chrome **200% zoom**: 900px viewport က 450 × 493 CSS px ဖြစ်သွားချိန် ဈေးခြင်းနဲ့ အဓိကခလုတ်များကို စစ်သည်။
- လက်ရှိ app source: `ce9ab51` release နဲ့တူသော application files; စစ်ဆေးမှုစတင်ချိန် working branch `testing` / `35b0775` က documentation-only continuation ဖြစ်သည်။
- လူကြီးပိုင်းအတွက် မြင်သာမှု၊ ရှင်းလင်းသော မြန်မာစာ၊ လက်တစ်ဖက်နဲ့ navigation၊ အမှားပြင်ဆင်မှု၊ နောက်တစ်ဆင့်ကို ခန့်မှန်းနိုင်မှုကို အဓိကထားသည်။ အသက်အရွယ်တစ်ခုတည်းက လူတိုင်း၏ စွမ်းရည်ကို မသတ်မှတ်ပါ။

| စမ်းသပ်သည့်အလုပ် | တွေ့ရှိချက် / အကျုံးဝင်မှု |
|---|---|
| ပစ္စည်းစာရင်းသို့ သွားပြီး Spotify ရှာခြင်း | ရှာနိုင်ပြီး plan ကို ဖွင့်နိုင်သည်။ Mobile search input 16px ဖြစ်သည်။ |
| မရှိသောစာလုံးဖြင့် ရှာခြင်း | No-result message နဲ့ ပြန်ရှာနိုင်မည့် controls ပေါ်သည်။ Search စာသားကို ရှင်းပြီး list ပြန်ရောက်ခြင်း စစ်ထားသည်။ |
| Plan ရွေးပြီး နောက်တစ်ဆင့်ကို ခန့်မှန်းခြင်း | Full-row radio ရှိသည်။ အဓိက action နှစ်ခုမှာ English ဖြစ်နေသည်။ |
| Quantity ပြောင်းခြင်း | ရှိပြီးသား cart ကို 71,000 → 87,000 → 71,000 ကျပ် ပြောင်းစစ်ပြီး မူလ quantity ကို ပြန်ထားသည်။ |
| Account / Telegram-only ရွေးချယ်ခြင်း | ရွေးချယ်စာသားက destination ကွာသလို ထင်ရနိုင်သည်။ Guest warning ကို နောက်အဆင့်မှာ ရှင်းပြထားသည်။ နောက်ဆုံး submit မနှိပ်ထားပါ။ |
| Keyboard ဖြင့် dialog သုံးခြင်း | Focus ကို plan dialog ထဲ ရွှေ့ပေးသည်၊ radio သို့ Tab သွားနိုင်သည်၊ Escape ပိတ်လျှင် မူလ card သို့ focus ပြန်ရောက်သည်။ Keyboard navigation အားလုံးကို audit လုပ်ထားခြင်း မဟုတ်ပါ။ |
| Account မှ full history သို့ သွားခြင်း | Inline panel နဲ့ full history link အလုပ်လုပ်သည်။ စမ်းသပ်သည့် account တွင် approved/pending orders မရှိသဖြင့် empty states ကိုသာ live ကြည့်နိုင်သည်။ |
| Email form | 16px input၊ visible label၊ invalid email အတွက် native validity `typeMismatch` ကို အတည်ပြုသည်။ Password/recovery gap ကို source မှ စစ်သည်; real password မထည့်ပါ။ |
| 320px / 390px နှင့် 200% zoom | စစ်ထားသော page များတွင် document horizontal overflow မတွေ့။ 200% cart footer ခလုတ်နှစ်ခုလုံး viewport ထဲတွင် ရှိနေသည်။ မြန်မာစာ line wrap အားလုံးအတွက် complete conformance test မဟုတ်ပါ။ |

### စမ်းသပ်မှု ကန့်သတ်ချက်များ

အော်ဒါအသစ်၊ ငွေပေးချေမှု၊ Google/Telegram login အသစ်၊ password ပြောင်းခြင်းနဲ့ admin approval ကို ဒီ UX round မှာ မလုပ်ထားပါ။ လက်ရှိဝယ်ယူမှု/အကောင့် data မပြောင်းထားပါ။ လက်ရှိ Google↔Telegram account linking feature ကိုလည်း တောင်းဆိုထားသလို **နောက်မှလုပ်ရန် ဆက်ရွှေ့ထားသည်**။

Chrome profile ရဲ့ automatic translation က နောက်ပိုင်း inspection တချို့တွင် စာသားကို ပြောင်းခဲ့သည်။ Mixed/translated headings ကို product copy defect အဖြစ် မတွက်ထားပါ။ အဓိက copy findings အတွက် မူရင်းမြန်မာ UI screenshot 03–05 နဲ့ source ကို သုံးထားသည်။ 320px/200% screenshots တချို့မှာ ဒီ environment effect ပါနိုင်သည်။ VoiceOver/TalkBack၊ actual phone keyboard၊ network interruption၊ offline guest recovery နဲ့ real older-user preference ကို မစမ်းရသေးပါ။

## အသေးစိတ် တွေ့ရှိချက်

### F01 · P1 — ဝယ်ယူနည်းနှစ်မျိုးကို Telegram သွား/မသွား ကွာသလို ပြထားခြင်း

**နေရာ:** Cart → “အကောင့်ဖြင့် ဝယ်ယူမယ်” / “Telegram တွင် ဝယ်ယူမယ်”။ **Evidence: browser + source။**

နှစ်မျိုးလုံး Telegram မှာ ငွေပေးချေပြီး service access ရယူရသည်။ ဒုတိယခလုတ်၏ တကယ့်ကွာခြားချက်က account မသုံးသည့် guest order ဖြစ်ပြီး website history/expiry မရခြင်းပါ။ ဒါကို ရွေးမည့်အချိန်တင် နှစ်ခုယှဉ်ပြီး မပြထားပါ။ Signed-in customer လည်း guest route ကို ရွေးနိုင်သည်။

**ပြန်စမ်းရန်:** Product/cart ဖွင့် → ခလုတ်နှစ်ခုဖတ် → Telegram route နှိပ် → နောက် screen မှာသာ history မရခြင်းကို တွေ့ရမည်။

**အကြံပြု:** နှစ်ခုလုံး Telegram ဆက်သွားမည်ဟု အပေါ်မှာ ပြောပါ။ “အကောင့်နဲ့ ဆက်ဝယ်မယ် — မှတ်တမ်း/သက်တမ်း ပြန်ကြည့်နိုင်မယ်” နဲ့ “အကောင့်မသုံးဘဲ ဆက်ဝယ်မယ် — Telegram က အော်ဒါစာကို သိမ်းထားရမယ်” ဟု ရွေးချယ်မှုမတိုင်မီ တွဲပြပါ။ Guest ကို အလွယ်တကူ ကျော်ရွေးနိုင်သေးရမည်။

[Source](../../../app/shop-order.tsx) · [မူရင်း screenshot](evidence/04-mobile-checkout-choices.jpg) · [Guest warning](evidence/05-mobile-guest-warning.jpg)

### F02 · P1 — Password မေ့သွားလျှင် ပြန်ဝင်ရန် လမ်းကြောင်း မရှိခြင်း

**နေရာ:** Email/password sign-in၊ existing password account ကို Google နှင့်ချိတ်သည့် password confirmation။ **Evidence: source-confirmed gap; live password failure မစမ်းထားပါ။**

မှားလျှင် “ပြန်ကြိုးစားပါ” ပဲ ပြသည်။ Forgot/reset/support recovery action မရှိသလို password ကို ပြ/ဖျောက်ရန်လည်း မရှိပါ။ Password မမှတ်မိသူအတွက် ဝင်နိုင်မည့် နောက်လမ်း မပေါ်ပါ။

**အကြံပြု:** Verified recovery flow ကို သီးခြားရေးပါ။ အဲဒီအချိန်မတိုင်မီ ရှင်းလင်းသော “စကားဝှက်အတွက် အကူအညီတောင်းရန်” ပေးနိုင်သည်။ အကောင့်ပိုင်ဆိုင်မှု အတည်ပြုချက်ကို မကျော်ရ။ Show/hide control ကို ထည့်ပါ။ Wireframe မှာ assistance သည် demo ဖြစ်ပြီး backend recovery ရှိပြီးဟု မပြထားပါ။

[Source](../../../app/account/auth-form.tsx)

### F03 · P2 — မြန်မာ UI ထဲက အဓိက action များ English ဖြစ်နေခြင်း

**Evidence: browser + source။** Plan dialog မှာ `Add to Cart` နဲ့ `Check Out` ကို မြန်မာ mode မှာလည်း သုံးထားသည်။ English shopping vocabulary မကျွမ်းကျင်သူက ဘာဖြစ်မလဲ သေချာမသိနိုင်ပါ။

**အကြံပြု:** “ဈေးခြင်းထဲ ထည့်မယ်” နဲ့ “အော်ဒါ ပြန်စစ်မယ်”။ ဒုတိယစာသားက လက်ရှိနောက် screen သည် review ဖြစ်ကြောင်း မှန်ကန်စွာ ပြသည်။ လမ်းညွှန်စာထဲက ခလုတ်အမည်ကိုလည်း ကိုက်ညီအောင် ပြောင်းပါ။

[Source](../../../app/shop-order.tsx) · [မူရင်း screenshot](evidence/03-mobile-plan.jpg)

### F04 · P2 — ဖုန်းမှာ Account နဲ့ Cart ကို icon ပဲ ပြခြင်း

**Evidence: browser + source။** 800px အောက်မှာ visible label ပျောက်သည်။ Accessible name ရှိပေမယ့် screen reader မသုံးသောသူကို icon အဓိပ္ပာယ် မရှင်းပြနိုင်ပါ။

**အကြံပြု:** “ပစ္စည်းများ / ဈေးခြင်း / မှတ်တမ်း / အကောင့်” ဆိုတဲ့ စာသားပါ ၄ ခုကို အောက်ခြေ menu ထဲထားသည့် **A ပုံစံ** ကို အရင်စမ်းပါ။ B ပုံစံက အပေါ်မှာ စာသားပါ navigation ဖြစ်သည်။ ကြီးမားသော Telegram ခလုတ်ကို အလယ်မှာ ထည့်လျှင် မရည်ရွယ်ဘဲ အခြား app သို့ သွားမိနိုင်သဖြင့် Telegram action ကို ဝယ်ယူမှု/အကူအညီ context နားမှာထားပါ။

[Source](../../../app/storefront-order.css) · [Mobile search screenshot](evidence/02-mobile-search.jpg)

### F05 · P2 — Narrow mobile catalog နဲ့ account metadata စာသေးခြင်း

**Evidence: browser measurement + source။** 320px မှာ catalog card တစ်ခု 140px ခန့်သာ ကျယ်သည်။ Plan text 13px၊ price 14px၊ category 11px ဖြစ်သည်။ Account/history source မှာ quantity/date/status တချို့ 11–12px၊ dates 14px ဖြစ်သည်။ Mobile plan preview ကို ၂ ကြောင်း clamp လုပ်ထားသည်။

**အကြံပြု:** Phone မှာ readable single-column list ကို စမ်းပါ။ Body 16–18px၊ secondary information 14–16px ကို design baseline အဖြစ် စတင်ပြီး တကယ့် participant နဲ့ စမ်းပါ။ Service၊ duration၊ price နဲ့ ရွေးရန်ခလုတ်ကို အစဉ်လိုက် ပြပါ။ ကျန်ရက်နဲ့ ကုန်ရက်ကို အလေးပေးပါ။ **ဒီ font size နံပါတ်တွေက WCAG minimum သတ်မှတ်ချက် မဟုတ်ပါ။**

[Catalog CSS](../../../app/storefront-order.css) · [Account CSS](../../../app/account/account.css) · [Term CSS](../../../app/account/subscription-term.css)

### F06 · P2 — Pending နဲ့ approved မှတ်တမ်းက နေရာကွဲနေခြင်း

**Evidence: source + live empty-state navigation။** `/order-history` က approved orders ကိုသာ ပြပြီး pending ကို Account မှာ ကြည့်ရသည်။ Full history မှာ pending သွားရန် link ရှိသဖြင့် data ပျောက်သည့် bug မဟုတ်ပါ။ သို့သော် အော်ဒါတင်ပြီး “မှတ်တမ်း” ကို တန်းဖွင့်သူက မပေါ်သေးတာကို မသိနိုင်ပါ။

**အကြံပြု:** Full history မှာ “စောင့်ဆိုင်းဆဲ” / “ဝယ်ယူပြီး” နှစ်မျိုး ရွေးနိုင်အောင် ထားပါ။ Account brief သုံးကြောင်းနဲ့ “အားလုံးကြည့်မယ်” ကို ဆက်ထိန်းပါ။

[Source](../../../app/account/account.tsx)

### F07 · P2 — Input ကို မနှိပ်ရသေးခင် ဘောင်က နူးညံ့လွန်းခြင်း

**Evidence: local computed colors + calculation။** Focus မရှိချိန် email input က white ပေါ်မှာ `color(srgb 0.61349 0.679059 0.87749)` ဘောင်ကို သုံးထားပြီး white နှင့် contrast **2.21:1** ခန့်သာရှိသည်။ Focus ဝင်ချိန် အပြာရောင်ဘောင်က သိသာသည်။

**အကြံပြု:** Resting boundary ကို ပိုသိသာအောင် အနည်းငယ်မည်းစေပါ။ Field ကို သတ်မှတ်ပေးရာတွင် အဲဒီ boundary ကိုပဲ အားကိုးလျှင် 1.4.11 အတွက် adjacent background နှင့် 3:1 လိုသည်။ Label ရှိ/မရှိ၊ အခြား visual cue များကိုပါ ကြည့်ပြီး conformance ဆုံးဖြတ်ရမည်။ ဘောင်တစ်ခုကို တိုင်းတာထားခြင်းနဲ့ website တစ်ခုလုံး fail ဟု မသတ်မှတ်ပါ။

[CSS](../../../app/account/account.css) · [Local diagnostic screenshot — browser translation ပါသည်](evidence/07-login-local-environment.jpg)

### F08 · P2 — မရသေးတဲ့ login နည်းလမ်းကို အရေးကြီးခလုတ်လို ပြခြင်း

**Evidence: source + local UI။** Phone option က အမြဲ disabled ဖြစ်ပေမယ့် provider rows နဲ့တူပြီး `Coming soon` ကို 10px English စာဖြင့် ပြသည်။ Production Google/Telegram ရနိုင်မှုကို ဒီအချက်နှင့် မရောထွေးရ။

**အကြံပြု:** လက်ရှိသုံးနိုင်တဲ့ နည်းလမ်းကို ဦးစားပေးပါ။ Phone ကို “ဖုန်းနံပါတ်ဖြင့် ဝင်ရန် — မရသေးပါ” ဟု အောက်နားမှာ အချက်အလက်အဖြစ် ခွဲပြပါ။

[Source](../../../app/account/auth-form.tsx) · [CSS](../../../app/account/account.css)

### F09 · P2 — လှုပ်ရှားမှု ရပ်ခလုတ်က footer မှာသာ ရှိခြင်း

**Evidence: browser page content + source။** Floating tiles နဲ့ rotating showcase ရှိပြီး explicit motion control က footer မှာရှိသည်။ Reduced motion၊ hover/focus pause နဲ့ hidden-tab pause ရှိပြီးသား ဖြစ်သည်။ “Pause မရှိ” ဟု မဆိုလိုပါ။

**အကြံပြု:** လိုအပ်သူက ရှာရလွယ်သော နေရာမှာ သေးငယ်ပြီး စာသားပါတဲ့ “လှုပ်ရှားမှု ရပ်မယ်” control ကို စမ်းပါ။ မူလတောင်းဆိုခဲ့တဲ့ floating animation နဲ့ stationary watermark ကို ဆက်ထိန်းနိုင်သည်။ Pause button ကြီး ပြန်ထည့်ရန် မလိုပါ။

[Showcase](../../../app/collection-showcase.tsx) · [Footer](../../../app/storefront.tsx)

## R01 · ထပ်စမ်းရန် — Guest Telegram handoff ပြန်ရယူခြင်း

Source မှာ order response ရပြီးနောက် cart ကို ရှင်းကာ draft/reference ကို React state ထဲထားပြီး Telegram သို့ သွားသည်။ Guest order ကို website history မှာ မပြသည့် လက်ရှိစည်းမျဉ်းရှိသည်။ Telegram ဖွင့်မရ/စာမပို့ရသေးမီ reload လုပ်လျှင် draft ပြန်ရနိုင်မနိုင်ကို **ဒီ round မှာ end-to-end မစမ်းထားပါ**။ ဒါကို confirmed live failure စာရင်းထဲ မတွက်ပါ။

အကောင့်မရှိဘဲ တင်ထားသော dummy order နှင့် သီးခြား disposable environment မှာ စမ်းရန်: handoff → Telegram မဖွင့်/မပို့ → reload → reference/draft ပြန်ရ/မရ → retry ကြောင့် duplicate record ဖြစ်/မဖြစ်။ Wireframe က persistent demo receipt၊ ပြန်ဖွင့်/ကူးယူ/အကူအညီကို အကြံပြထားသည်။ Website က Telegram Send နှိပ်ပြီး/မပြီး သိနိုင်ကြောင်း မပြောရ။

## Menu နဲ့ payment placement ဆုံးဖြတ်ချက်

### A — စာသားပါတဲ့ အောက်ခြေ menu ကို အရင်စမ်းရန် အကြံပြု

ပုံမှန် browsing မှာ လက်တစ်ဖက်နဲ့ ရောက်ရလွယ်မည့် ၄ ခုသာ ထားပါ: **ပစ္စည်းများ · ဈေးခြင်း · မှတ်တမ်း · အကောင့်**။ လက်ရှိ route တွေကို ပြန်သုံးပြီး Account က inline panel အဖြစ် ဆက်ဖွင့်နိုင်သည်။ စာသားနဲ့ selected state ကို အမြဲပြပါ။

အမှန်တကယ် implement လုပ်ချိန်မှာ phone safe area၊ content bottom padding နဲ့ software keyboard ကို စစ်ရမည်။ Plan/checkout dialog ဖွင့်ချိန်မှာ အောက်ခြေ menu နှင့် checkout footer မထပ်စေရ။ Account၊ cart icon တွေကို header မှာ ထပ်မထားရ။ ဒီပုံစံက older-user preference အနိုင်ရကြောင်း သက်သေမရှိသေးသဖြင့် B နဲ့ တကယ်နှိုင်းယှဉ်စမ်းပါ။

### B — အပေါ်မှာ စာသားပါ menu

အောက်ခြေ screen space ကို မယူချင်လျှင် brand အောက်မှာ label လေးခုကို ရှင်းရှင်းပြနိုင်သည်။ လက်တစ်ဖက်နဲ့ အပေါ်ရောက်ရမည့် အကွာအဝေး ပိုများပြီး 320px မှာ မြန်မာစာ wrap ဖြစ်နိုင်သည်။ Wireframe viewer ရဲ့ A/B ခလုတ်နဲ့ နှစ်မျိုးလုံး ကြည့်နိုင်သည်။

### Payment information

ဆိုင်ရှင် အတည်ပြုထားသည့် **KBZ၊ Wave၊ AYA၊ UABpay၊ Binance** ကို မူရင်း logo တွေနဲ့ ထည့်ထားသည်။ Reference နဲ့ကိုက်ညီရန် KBZ/AYA ကို **KBZPay / AYA Pay wallet** artwork ဖြင့် ပြထားသည်; တကယ်လက်ခံသည့် service က bank transfer ဖြစ်ပါက implementation မတိုင်မီ label/logo ကို ပြန်ညှိရမည်။

Brand header အောက်က info strip ကို content နှင့်အတူ scroll စေပြီး အမြဲကပ်ထားသည့် ကြီးမားသော banner မလုပ်ပါ။ အော်ဒါပြန်စစ်သည့် screen မှာ ထပ်ပြပါ။ “ငွေပေးချေမှုကို Telegram မှာ ဆက်လုပ်ပါ” ဟု ပေါင်းရေးထားသည်။ Payment logo ရှိခြင်းကြောင့် website ပေါ်မှာ ငွေဖြတ်ပေးနေသည်ဟု မထင်ရ။ Account number၊ QR၊ Binance network/currency၊ fees၊ refund policy တို့ကို မတီထွင်ထားပါ။

[Logo မူရင်းနှင့် ရရှိရာစာရင်း](assets/payments/SOURCES.md)

## Wireframe ပါဝင်သည့် မျက်နှာပြင် ၆ ခု

1. Catalog — single column၊ payment logos၊ menu A/B။
2. Plan — မြန်မာ action၊ duration/price၊ ပြန်စစ်ခွင့်။
3. Review — quantity/total၊ payment methods၊ account/guest history ကွာခြားချက်။
4. Login — available methods၊ မရသေးသည့် phone၊ password ပြ/ဖျောက်၊ assistance demo။
5. Telegram handoff — အော်ဒါအမှတ်၊ Send လုပ်ရန် အဆင့်၊ ပြန်ဖွင့်/ကူးယူ/အကူအညီ၊ reload-persistent sample။
6. History — pending/approved နှစ်မျိုး၊ ကျန်ရက်ကြီး၊ start/end dates နဲ့ labelled bar။

[နှိပ်စမ်းနိုင်သော wireframe](wireframes.html) · [အောက်ခြေ menu ပုံ](wireframe-bottom-menu.jpg) · [အပေါ် menu ပုံ](wireframe-top-menu.jpg)

**Sample data သာ ဖြစ်သည်။** Real provider login၊ အော်ဒါတင်ခြင်း၊ Telegram စာပို့ခြင်း၊ payment နဲ့ password reset မလုပ်ပါ။ Receipt persistence သည် demo တစ်ခုတည်းတွင် ဖြစ်ပြီး လက်ရှိ website feature အဖြစ် မသတ်မှတ်ရ။

Wireframe ကို browser မှာ A/B menu၊ quantity/total၊ demo login ပြီး review သို့ ပြန်ရောက်ခြင်း၊ password ပြ/ဖျောက်၊ assistance၊ guest receipt reload နဲ့ history tabs များ နှိပ်စမ်းပြီးဖြစ်သည်။ Payment logo ဆယ်နေရာနှင့် service image များ load ဖြစ်သည်။ မျက်နှာပြင် ၆ ခုလုံးကို 320px မှာ စစ်ရာ document horizontal overflow မတွေ့ပါ။ ဒီရလဒ်က prototype အတွက်ဖြစ်ပြီး live website fix တစ်ခုအတွက် regression result မဟုတ်ပါ။ [Journey overview](wireframe-journey-overview.jpg)

## ဆက်ထိန်းသင့်သော အချက်များ

- မြန်မာ default၊ Wa Lone နှင့် Manrope၊ brand blue/lavender ကို ဆက်သုံးပါ။ Font အသစ်တစ်မျိုး ထပ်ပေါင်းခြင်းထက် size/weight/spacing နဲ့ hierarchy ကို အရင်ပြင်ပါ။
- Plan radio တစ်ကြောင်းလုံး နှိပ်ရွေးနိုင်မှု၊ 48px mobile primary actions၊ 44px close/quantity controls ကို ဆက်ထိန်းပါ။
- Login ကို checkout ထဲမှာ ပြပြီး cart review သို့ ပြန်ရောက်စေသော flow ကို ထိန်းပါ။
- Guest မှာ name/email မတောင်းခြင်းနဲ့ history မရကြောင်း warning ကို ထိန်းပြီး ရွေးချယ်မှုမတိုင်မီလည်း ရှင်းပြပါ။
- သက်တမ်း status စာသား၊ ကျန်ရက်၊ bar နဲ့ Myanmar business dates ကို တွဲပြခြင်း၊ reduced-motion support ကို ထိန်းပါ။

## အမှန်တကယ် လူကြီးပိုင်းနှင့် နောက်တစ်ကြိမ် စမ်းသပ်ရန်

Myanmar-speaking adults **၅–၇ ဦး** ခန့်ကို smartphone ကျွမ်းကျင်မှု ကွဲပြားအောင် ရွေးပြီး ကိုယ်သုံးနေကျ Android/iPhone ပေါ်မှာ တစ်ဦးလျှင် ၃၅–၄၅ မိနစ် စမ်းပါ။ ဒါက qualitative round ဖြစ်ပြီး လူဦးရေတစ်ခုလုံးကို ကိုယ်စားမပြုပါ။ လိုလားလျှင် ၅၅ နှစ်နှင့်အထက်ကို ဖိတ်နိုင်သော်လည်း အသက်ကြောင့် စွမ်းရည်တူမည်ဟု မယူဆရ။

Task များ: လိုချင်သော service ရှာ → plan/price ရှင်းပြ → quantity အမှားပြင် → guest/history ကွာခြားချက် ပြန်ပြော → login နည်းရွေး → Telegram ဖွင့်ပြီးနောက် ဘာဆက်လုပ်မလဲ ပြန်ရှင်းပြ → pending/active/expired နှင့် ကျန်ရက်ကို ကြည့် → အကူအညီရှာ။

“နောက်ဘာလုပ်မလဲ?” လို neutral prompt ကို သုံးပါ။ ကိုယ်တိုင်ပြီး/အကူအညီနဲ့ပြီး၊ မှားနှိပ်မှု၊ ပြန်လှည့်မှု၊ နားမလည်သောစကားလုံးနဲ့ task time ကို မှတ်ပါ။ A/B menu ကို အစဉ်အပြောင်းအလဲဖြင့် စမ်းပြီး payment methods ကို ဘယ်လိုရှာတွေ့သလဲ ကြည့်ပါ။ တကယ့် payment မလုပ်ရ။ Recording လိုလျှင် သီးခြားခွင့်တောင်းပြီး credentials/OTP ကို မမှတ်တမ်းတင်ရ။ **ဒီ user study ကို မလုပ်ရသေးပါ။**

## သုံးထားသော primary guidance

- [WAI — Developing Websites for Older People](https://www.w3.org/WAI/older-users/developing/) နှင့် [Involving Users in Evaluation](https://www.w3.org/WAI/test-evaluate/involving-users/): standards check နဲ့ actual user test ကို တွဲလုပ်ရန်။
- [WCAG 1.4.4 Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html): 200% ကြီးစေပြီး content/function မပျောက်ရန်။ [1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html): 320 CSS px equivalent အတွက် reflow။
- [2.5.8 Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): AA က 24 × 24px သို့မဟုတ် သက်ဆိုင်သည့် exception။ [2.5.5 Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html): 44 × 44px က AAA ဖြစ်သည်။ ဒီ project မှာ older-user design target အဖြစ် 44–48px ကို အကြံပြုခြင်းဖြစ်ပြီး 44px အောက်တိုင်း AA fail မဟုတ်ပါ။
- [1.4.3 Text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): ordinary text 4.5:1၊ large text 3:1။ [1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html): meaningful component/state cues အတွက် adjacent colors ကို စစ်ရန်။
- [WAI-ARIA Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) နှင့် [2.2.2 Pause Stop Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html): focus၊ keyboard၊ pause behavior စစ်ရန်။

## နောက်လုပ်ရန် အစီအစဉ်

1. ဒီ wireframe ရဲ့ menu A/B၊ payment info နဲ့ history အခြေခံ account/guest wording ကို ပြန်သုံးသပ်ပါ။
2. ရွေးချယ်ထားသော design ကို implementation လုပ်မည့်အခါ အဓိက မြန်မာ actions၊ readable text၊ labelled navigation နဲ့ password assistance ကို ဦးစားပေးပါ။
3. Disposable checkout ဖြင့် guest recovery ကို စမ်းပြီး အမှန်တကယ် လိုအပ်သည့် persistence ကို သတ်မှတ်ပါ။
4. Real phone + enlarged text + VoiceOver/TalkBack + keyboard/error flows ကို ထပ်စမ်းပါ။
5. လူကြီးပိုင်း participants နဲ့ task-based study လုပ်ပြီးမှ ပြင်ဆင်မှုအကျိုးရလဒ်ကို အမှန်တကယ် တိုင်းတာပါ။

Google↔Telegram linking ကို ဒီအဆင့်များနှင့် မရောဘဲ owner ပြန်တောင်းဆိုချိန်မှ သီးခြား ဆက်လုပ်ရမည်။
