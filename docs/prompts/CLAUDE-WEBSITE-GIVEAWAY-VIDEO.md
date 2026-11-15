# Claude prompt — Digimium website + giveaway promo

Copy the prompt below into Claude in the Digimium website repository. It requests a video; this document itself does not render or publish one. Campaign dates and launch status must be verified when the video is made.

---

You are a motion designer and video developer. Create a polished **approximately 60-second Digimium website + giveaway promotional video** for **Instagram Reels, TikTok and YouTube Shorts**. Deliver a finished vertical video and editable source, not only a storyboard or an implementation plan.

## Input and truth source

- Public website: **https://buywith-digimium.store**.
- Use the current repository, its `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, and the current working website as the truth source. Inspect the current UI before planning the shots.
- Use the official `public/assets/logo.png`, `public/assets/symbol-blue.png` and `public/assets/symbol-white.png`. Service marks are in `public/assets/marks/`; fonts are in `public/assets/fonts/`. Resolve the actual current filenames from the repository. Do not use duplicate files with names ending in ` 2` or ` 3`.
- Preserve the Digimium portal symbol, exact lowercase **digimium.** wordmark, logo proportions and original service-logo colors. Do not redraw or AI-regenerate the logo or invent service icons.
- The video promotes the actual store: browsing digital services, choosing a plan, optional customer accounts, account purchase tracking, and the giveaway. Payment and service delivery continue with the store on Telegram; the website records orders and admin approval determines their history/status. Do not portray the website as an automatic payment processor or promise instant account delivery.
- Use real current website captures for product browsing, Account, Order history, the segmented remaining-days display, and the giveaway UI. Use read-only public browsing or an isolated local/staging demo with disposable data. Never display a real customer's name, email, Telegram ID, order credentials, passwords, tokens, private admin data or browser notifications.
- Do not submit a real order, enter the giveaway, change campaign settings, message anyone, or launch the Telegram app during filming. For any Telegram-link step, use an approved existing screenshot or an isolated labelled demonstration. Do not sign into a personal Telegram account.
- Never fabricate buttons, published features, successful linking, completed payments, participant counts, live countdowns, reviews, winners or prices. If a feature is unavailable, omit its interaction shot and use truthful typography until it can be captured.

## Giveaway facts — use these exactly

There are **6 prize slots in total**, with the following allocation:

| Prize | Term | Recipients |
| --- | --- | --- |
| Gemini Pro | 3 months | 2 people |
| Canva EDU Pro | 12 months | 3 people |
| ChatGPT Go · Own Mail | 1 month | 1 person |

Burmese prize labels:

- **Gemini Pro · ၃ လ · ၂ ဦး**
- **Canva EDU Pro · ၁၂ လ · ၃ ဦး**
- **ChatGPT Go · Own Mail · ၁ လ · ၁ ဦး**

Keep **Own Mail** visible for the ChatGPT prize. Do not substitute ChatGPT Plus, Gemini AI Ultra, a different Canva plan, different durations, monetary values or a different number of recipients.

Joining requires a **website account with Telegram linked to that account**. Logging in with Google alone is not proof of Telegram linking. Show or claim a linked state only after the real implementation has verified it; otherwise say that linking is a required step. Do not imply that every participant wins. The date window and published campaign state come from the admin-controlled campaign, not from this prompt.

Before making a release version, create `campaign-facts.json` with:

```json
{
  "website": "https://buywith-digimium.store",
  "campaignStatus": "VERIFY_DRAFT_SCHEDULED_OPEN_OR_ENDED",
  "startsAt": "VERIFY_FROM_CAMPAIGN",
  "endsAt": "VERIFY_FROM_CAMPAIGN",
  "displayTimezone": "Asia/Yangon",
  "sourceCommit": "VERIFY_CURRENT_SOURCE"
}
```

Replace those markers only with verified values. Show campaign dates in **Myanmar Time (MMT, UTC+06:30)**, matching the store. If dates or launch state cannot be verified, make a clearly named **DRAFT preview**, use **“မကြာမီ” / “Coming soon”**, and do not show invented dates or an active countdown. A draft must not say “Join now”. If the campaign has ended, use an ended state and do not invite new entries. Never publish the video automatically.

## Deliverables and format

- Main video: `digimium-website-giveaway-vertical.mp4`, **1080 × 1920, 9:16, 30 fps, approximately 60 seconds**, H.264 with AAC audio and a fast-start MP4. Name it with `-DRAFT` when campaign facts are not release-ready.
- Editable composition/source, all frozen local media, dependency lockfile, a short relative-path README with render commands, and an asset-source/licence manifest.
- A readable 9:16 poster image, `captions-my.srt`, a plain-text Burmese voiceover script, and the verified `campaign-facts.json`.
- Keep all deliverables in a new relative directory such as `outputs/digimium-giveaway-video/`. Do not modify the production website while creating the video.
- Use the project's installed video workflow. If HyperFrames skills are available, read its entry skill and use the **product-launch-video** workflow, then its composition/animation/CLI contracts. Do not invent obsolete CLI commands. The promo should combine real interface captures and motion design, rather than being a long raw browser recording.

## Visual direction

Premium, minimalist, clear, confident. The Digimium brand palette is Persian blue **#1f45b8**, navy **#051650**, soft blue/lavender **#e2e7f6**, white and dark ink **#101113**. Preserve the current site's blue/lavender atmosphere and original service colors. Use the bundled **Manrope** for English and **Wa Lone** for Burmese; verify Burmese shaping and line breaking in the final render.

Make actual product UI the hero. Use clean phone/browser frames, deliberate detail crops, and restrained depth. Small service-logo tiles may drift independently around a composition, with calm perspective and soft shadows, without covering the logo, captions, prices or controls. No gift-box clutter, excessive confetti, spinning logos, bouncing type, neon rainbow, fake holographic dashboards, or a stock template aesthetic.

Motion should explain the sequence: a service tile leads into its real product card; the card leads into the real plan view; remaining-day segments resolve into the actual history UI; prize tiles arrive one at a time. Use smooth ease-out/ease-in-out transforms, controlled camera moves and short clean transitions. Do not animate Burmese letters individually, which can break combining marks. Move text by whole line or phrase. Keep the background active but quiet.

Use a restrained original/licensed electronic instrumental with soft tactile UI cues. No copyrighted commercial track. Burmese narration should be warm, natural and unhurried; duck music under speech. If a suitable voice or licensed TTS is unavailable, produce the caption-led cut and provide the final voiceover script separately; do not claim a voiced cut was delivered.

Caption hierarchy is crucial for older viewers: one short idea at a time, at most two lines, strong contrast, generous line spacing and no text behind moving UI. At 1080 × 1920, aim for Burmese captions around 48–60px and never smaller than 42px for essential instructions. Keep essential material inside roughly x=90…900 and y=150…1580 to avoid social overlays. Review captions at phone playback size. Keep the URL visible for at least the final 5 seconds.

## 60-second sequence and Burmese script

Treat the times as an editing guide. Adjust individual scene lengths slightly for natural Burmese narration while keeping the complete piece approximately one minute. Do not speed up narration to fit too many words.

| Time | Picture and motion | On-screen Burmese / narration |
| --- | --- | --- |
| **00:00–00:05** | Official Digimium mark resolves from the real blue/lavender brand field. A clean phone containing the real homepage enters. Two or three genuine service marks appear with restrained independent motion. | Caption: **“Digital ဝန်ဆောင်မှုတွေကို တစ်နေရာတည်းမှာ”**. VO: **“လိုချင်တဲ့ Digital ဝန်ဆောင်မှုတွေကို digimium. မှာ ရှာတွေ့နိုင်ပါပြီ။”** |
| **00:05–00:13** | Show the current mobile two-column catalog, then a precise crop of a real plan selection. Keep the real text legible. No fast scrolling. Use only currently published plans and do not add invented price tags. | Caption: **“ဝန်ဆောင်မှုရွေး • Plan ကြည့်”**. VO: **“ကိုယ်သုံးချင်တဲ့ ဝန်ဆောင်မှုကို ရွေးပြီး၊ သင့်တော်တဲ့ Plan ကို လွယ်လွယ်ကူကူ ကြည့်နိုင်ပါတယ်။”** |
| **00:13–00:21** | Show the real Account control, then full Order history using disposable demonstration data. Focus on the service logo and segmented remaining-days gauge. Put a small **“နမူနာအချက်အလက်”** label on any populated demo data. Do not expose account delivery credentials. | Caption: **“ဝယ်ယူမှုမှတ်တမ်းနဲ့ ရက်ကျန်ကို ပြန်ကြည့်နိုင်မယ်”**. VO: **“အကောင့်နဲ့ ဝယ်ယူထားရင်၊ ဆိုင်က အတည်ပြုပြီးတဲ့ ဝယ်ယူမှုနဲ့ Plan ရဲ့ ရက်ကျန်ကိုလည်း ပြန်စစ်နိုင်ပါတယ်။”** |
| **00:21–00:26** | Shift into the real giveaway page or its verified scheduled/draft state. Use a clean title and a deliberate brand-color transition. Do not imply the campaign is open unless verified. | If open, caption: **“digimium. Giveaway”**; VO: **“အခု giveaway မှာလည်း ပါဝင်နိုင်ပါတယ်။”** If draft/scheduled, caption: **“Giveaway မကြာမီ”**; VO: **“digimium. Giveaway လည်း မကြာမီ လာပါမယ်။”** If ended, replace the invitation with a truthful ended recap. |
| **00:26–00:39** | Reveal the three real service logos with their prize terms. Approximately 4 seconds per prize, then briefly show all three. Use a balanced composition and a clear numeral for recipients; do not make the 6 slots look like 6 prizes per person. | Captions, one prize at a time: **“Gemini Pro · ၃ လ · ၂ ဦး”**, **“Canva EDU Pro · ၁၂ လ · ၃ ဦး”**, **“ChatGPT Go · Own Mail · ၁ လ · ၁ ဦး”**. VO: **“Gemini Pro သုံးလစာ နှစ်ဦး၊ Canva EDU Pro တစ်နှစ်စာ သုံးဦး၊ ChatGPT Go ကိုယ်ပိုင်မေးလ် တစ်လစာ တစ်ဦးအတွက်ပါ။”** |
| **00:39–00:50** | Three clear steps with genuine UI crops: website account → verified Telegram linking → giveaway entry. Highlight one step at a time. If linking is not ready for capture, show the required step as instructional text rather than a fake linked success screen. Never perform a real entry to obtain footage. | Captions: **“၁။ Website အကောင့်ဝင်ပါ”**, **“၂။ Telegram ချိတ်ပါ”**, **“၃။ Giveaway မှာ ပါဝင်ပါ”**. VO: **“ပါဝင်ဖို့ Website အကောင့်ဝင်ပြီး၊ Telegram ကို အကောင့်နဲ့ ချိတ်ထားဖို့ လိုပါတယ်။ ပြီးရင် Giveaway စာမျက်နှာမှာ ပါဝင်နိုင်ပါတယ်။”** For draft/scheduled, change the last sentence to **“စတင်တဲ့အချိန်မှာ Giveaway စာမျက်နှာကနေ ပါဝင်နိုင်မှာပါ။”** |
| **00:50–01:00** | Hold the official wordmark, the website URL, verified campaign window and one honest CTA. Keep the URL readable for at least 5 seconds. Use the actual giveaway state. End on a composed still suitable for a poster, not a sudden flash or fade before the URL can be read. | Open caption: **“Giveaway မှာ ပါဝင်လိုက်ပါ”**. Draft/scheduled caption: **“မကြာမီ — Website မှာ ပြန်ကြည့်ပါ”**. Small readable rule: **“Website အကောင့် + ချိတ်ထားသော Telegram လိုအပ်သည်”**. URL: **buywith-digimium.store**. VO open: **“အသေးစိတ်နဲ့ ပါဝင်ရမယ့်ရက်ကို buywith-digimium.store မှာ ကြည့်လိုက်ပါ။”** Draft/scheduled VO: **“စတင်မယ့်ရက်နဲ့ အသေးစိတ်ကို buywith-digimium.store မှာ ပြန်ကြည့်နိုင်ပါတယ်။”** |

The script must stay faithful to the actual eligibility and campaign rules shown on the website. Do not add “no purchase necessary”, a winner-selection mechanism, age/country restrictions, announcement dates, guaranteed availability, endorsement by service brands, or other legal/promotional claims unless the owner has supplied and approved them. Reading the rules on the website is the CTA; a video cannot replace the full campaign rules.

## Build and verification

1. Inspect actual assets and UI, freeze the selected media locally, and record provenance. Capture only clean website content, without browser chrome, personal notifications or third-party translation overlays.
2. Produce a storyboard/contact sheet, then implement the full composition. Every frame must be deterministic and seekable; do not use per-frame random positions or depend on live network assets at render time.
3. Preview key frames at scene starts, at transition midpoints, and on the final CTA. Correct text clipping, logo distortion, tiny UI, awkward Burmese breaks, empty screen regions, and overlapping captions before rendering.
4. Render the complete video; watch it from start to finish with and without audio. Verify all three prize terms and recipient counts, actual campaign dates/status, the conditional linking language, the remaining-days UI, voice/caption sync and the final URL hold. Confirm the video contains no personal data or secrets.
5. Return the MP4, poster, captions and source paths, plus a short verification note. Distinguish an exported draft from a release-ready file. Do not post to social media or change the live website.

Proceed with the work using the verified information available. If campaign dates remain unset, complete the DRAFT preview with truthful “Coming soon” wording and list exactly which facts must be filled before release.
