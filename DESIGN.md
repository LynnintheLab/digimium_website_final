---
name: Digimium
description: A calm, bilingual digital collection.
colors:
  blue: "#1f45b8"
  blue-hover: "#123499"
  navy: "#051650"
  ink: "#101113"
  muted: "#4d587e"
  line: "#d4d7e1"
  soft: "#e2e7f6"
  white: "#fff"
typography:
  display:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "clamp(48px, 5.2vw, 76px)"
    fontWeight: 600
    lineHeight: 1.09
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "23px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
  myanmar:
    fontFamily: "Walone, sans-serif"
    lineHeight: 2.1
    letterSpacing: "0"
rounded:
  surface: "14px"
  surface-mobile: "12px"
  button: "6px"
  filter: "5px"
  segmented-track: "7px"
  segmented-option: "4px"
spacing:
  compact: "8px"
  label: "12px"
  grid: "16px"
  action: "22px"
  card: "25px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.white}"
    rounded: "{rounded.button}"
    padding: "14px 21px"
  button-primary-hover:
    backgroundColor: "{colors.blue-hover}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "14px 21px"
  button-secondary-hover:
    backgroundColor: "{colors.soft}"
  filter-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.filter}"
    padding: "9px 11px"
  product-card:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "25px"
  search:
    textColor: "{colors.ink}"
    padding: "8px 0"
    width: "175px"
---

# Design System: Digimium

## Overview

**Creative North Star: "A calm, bilingual digital collection"**

A calm, bilingual digital collection. Generous spacing, softly tinted blue gradients, deep blue display surfaces, the supplied Digimium portal mark, and restrained Persian Blue accents create a clear, modern identity. Simple modern sans-serif typography unifies English headings and reading text while supporting browsing and enquiry.

**Key Characteristics:**
- Blue/lavender canvas and navy panels with Persian Blue actions.
- Simple Manrope headings and English body copy, with spacious Myanmar text.
- Flat surfaces, fine dividers, and gently rounded controls.

## Colors

### Primary
Digimium’s brand guideline v2.0, pages 11–12, defines Persian Blue (#1F45B8), Egyptian Blue (#123499) and Navy (#051650). Persian Blue identifies actions, headline emphasis, selection and keyboard focus. Egyptian Blue is the primary hover color. The collection and about panels use the signature left-to-right Persian Blue to Navy gradient. The Telegram and Viber contact links use the respective service colors.

### Neutral
Canvas, panel, border and text tints are mixed from the brand blues in `app/globals.css` and shared by the storefront, checkout and admin screens. The near-black `ink` color carries headings on pale backgrounds.

**The Accent Rule.** Keep backgrounds softly tinted; use deeper blues for contrast and primary actions.

## Typography

Manrope is the self-hosted English typeface for headings, body copy, and controls, with weights 400, 500, 600, and 700 in `public/assets/fonts/`. Headings use weight 600; keep negative tracking no tighter than -0.04em. Wa Lone is registered as `Walone` from the regular and bold font files in `public/assets/fonts/` and applied through `lang="my"`.

Frontmatter describes the desktop hero, section heading, product title, body, and label roles. Supporting paragraphs commonly use 14px with 1.8–1.9 line-height. Product descriptions are limited to 34ch. Myanmar uses 2.1 line-height, increased to 2.3 in the dark brand section. The hero Myanmar line is 19px on wide screens and 17px below 1150px.

The wide desktop hero is capped at 76px. At 700px and below it uses `clamp(36px, 10.7vw, 60px)`; Myanmar uses a smaller responsive scale with generous line height. At 620px and below, card titles scale from 17px to 20px, descriptions and plan labels use 13px, and prices use 14px. Search inputs and admin form fields use 16px to avoid automatic phone zoom.

## Layout

The shared desktop container is `min(1280px, calc(100% - 112px))`, centered. Gutters become 32px per side at 1150px. At 700px and below, use at least 16px gutters plus device safe areas. The full-width top menu stays pinned on scroll. Its translucent canvas background uses 18px backdrop blur. It is 88px tall on desktop, 80px up to 800px wide, and 76px plus the top safe area up to 700px wide. Section links leave 12px below the header. On phones, the menu opens underneath the language and cart controls.

The hero uses a 1.12:1 split with a 65px gap. Catalog cards use three equal columns above 800px and two columns at 800px and below. Narrow cards stack the logo above the service name, show the complete price, and offer two-line previews of descriptions and plan names. Opening the card reveals the full details. The hero becomes one column at 700px; brand story, steps, FAQ, and contact become one column at 620px. Search takes full width on mobile. Major sections use roughly 75–92px desktop spacing, reducing to roughly 45–55px on mobile. Use the source stylesheet for section-specific measurements rather than treating these values as a universal scale.

## Elevation & Depth

The storefront is flat. Admin surfaces use a small soft shadow to distinguish editing panels. Contrast between pale blue, soft lavender, and navy establishes hierarchy. Fine borders divide content; product cards reveal a blue border on hover. The low-opacity supplied portal mark is the sole large graphic layer within the dark collection panel.

## Shapes

Main surfaces use the `surface` radius; mobile product cards use `surface-mobile`. Buttons, category filters, and segmented options use smaller radii. Navigation, FAQ rows, and search use straight fine dividers. Preserve supplied mark proportions; service marks retain original colors, with accurate black marks retained where appropriate.

## Components

- **Primary and secondary actions:** inline flex, 49px minimum height, 22px icon gap. Secondary actions have a fine neutral border. Hover lifts either button by 2px over 0.2s. On mobile, minimum height is 48px and padding is 13px 18px.
- **Mobile dock:** a compact floating capsule, approximately 64px tall, with a 44px raised Account circle in the center. The 32px outer radius and 28px selected radius share a 3px inset plus 1px border, so nested curves align. Keep labels on one line and preserve touch targets. Position cart feedback above the dock. Account/History use the same component. The pale track and shared white selected pill match the language control; the pill follows active navigation and visible Products/Help position, with no movement for reduced motion.
- **Language selection:** a 132px pill with two equal EN/Myanmar segments, a 3px inset and a white selected thumb. Keep pressed-state semantics and keyboard focus; remove thumb transitions for reduced motion.
- **Header account action:** place Account after the cart at the end of the desktop tools. Use a compact brand-blue capsule with white text, a 44px minimum target and a darker blue hover/open state. Keep the existing inline account panel.
- **Hero spacing:** leave 24px after the payment strip before the hero content region. On desktop, align the heading and showcase surface at the same top edge, retaining 32px above the showcase for its floating logos. On phones, start the heading directly after that 24px gap.
- **Page scroll rail:** group 21 closely spaced ticks at the viewport's vertical center, within 180px on desktop, 160px on phones and 132px in short landscape. Every tick is exactly 2px thick; selection changes length only, with two tapering neighbors. Use exact black over light surfaces and white over dark surfaces, including independent tick colors across a section boundary. There is no blue, thickness or opacity highlight. New dark surfaces must join the existing surface-bound detection. Capture mouse/touch gestures on the rail surface; keep the native range for keyboard and accessible values without native pointer dragging. Hide the rail during dialogs, the account panel and the open menu. Respect reduced motion.
- **Telegram sign-in:** the chooser uses a self-contained 20px blue-circle/white-plane SVG so its mark appears with the initial render. Bot login stages each use one photo/caption/keyboard message: a blue/amber lock for choosing a code, an emerald/white checkmark only after the website session is issued. Ordinary bot `/start` keeps its separate welcome artwork. Use native bold first lines, restrained emoji and separated device/country/start-time lines. A code approval is distinct from a completed website session. Country is an approximate offline IP estimate, never a city or GPS claim. Photo failure or oversized captions fall back to text.
- **Account popover:** full read-only profile fields with a 44px round gear link to `/account`; show at most two recent purchased plans with service logos, segmented semicircle day gauges and separately stacked expiry text, plus two brief pending rows. Keep the pending count honest and label purchased items as recent rather than inventing an overall total. Full order history stays on its page. Sign out is a 44px red gradient button with white text and visible keyboard focus.
- **History filters:** selected stays navy with white text, including hover; inactive uses a subtle surface and border change. These controls never use text underlines. Keep visible keyboard focus and 48px targets.
- **Checkout choice copy:** signed-out review uses only Create account / အကောင့်ဖွင့်မည် and Buy on Telegram / Telegram မှဝယ်မည်. Keep explanatory guest guidance in its next step. Signed-in review keeps only Place order / Order တင်မည်.
- **Catalog filters:** wrapping text controls with 36px minimum height. Active is Persian Blue with white text; inactive hover uses the soft surface. Expose selected state with `aria-pressed`.
- **Search:** compact on desktop; full-width, lightly tinted and bordered on phones, placed above the filters. Clear control is 44px; Enter dismisses the keyboard.
- **Product cards:** entire card opens the plan picker; left-aligned mark, display title, muted category and description, and an arrow action. Hover changes the surface to a slightly deeper blue tint and border to blue.
- **Best Seller.** A bright gold badge with a filled star identifies marked products and plans in the catalog, showcase and plan dialog. Marked plan options have a pale gold gradient and amber border. The selected option has a clear blue outline and checked radio control.
- **Showcase motion.** Ten service tiles form an uneven frame around all four edges. Large and small tiles cluster along the top and right, with more open space on the left and below. Base tile size is 40px on desktop and 35px on phones, before individual scale and tilt. Each follows its own small looping path. The large interior watermark, offer text and prices stay still. The footer motion control and system reduced-motion preference apply to the showcase.
- **Giveaway preview.** Use the existing navy/blue showcase and gold badge palette. Keep six prize slots visible in the top banner on phones, label draft campaigns Demo/နမူနာ and Coming soon, and show the three exact plan names, durations and 2/3/1 allocations in the first carousel slide. Give this slide 14 seconds of reading time while preserving pause, hidden-tab and reduced-motion behavior. A details link never implies entries are open; admin dates/Launch determine eligibility.
- **Showcase navigation.** Short dashes above the action row show slide positions. The current dash is longer and brighter. Visitors can tap a dash, use either arrow, or swipe horizontally on a phone. Incoming content fades in with a short horizontal movement in the direction of travel. With reduced motion enabled, slides change immediately.
- **Collection selector.** When the showcase displays a category collection, its separate blue segmented control identifies the selected category with a pale blue tab.
- **FAQ:** native details/summary rows separated by fine borders; the chevron turns when open.

Interactive elements use a 3px blue focus outline with 5px offset. Honor `prefers-reduced-motion`: remove transitions and animation and use automatic scrolling. Inline icons use the existing simple stroke vocabulary. Component examples and motion/breakpoint metadata live in `.impeccable/design.json`; implementation is in `app/globals.css`, `app/storefront.tsx`, `app/storefront-order.css`, and the cart/admin stylesheets.

## Do's and Don'ts

### Do:
- Do preserve supplied logo proportions and original brand colors.
- Do use Wa Lone for Myanmar text and retain generous line-height.
- Do keep cart and Telegram checkout actions clear; the customer sends the final message and no payment is processed on the website.

### Don't:
- Don't return to a plain white page canvas; keep gradients subtle enough for readable content.
- Don't substitute invented product marks or decorative dashboard imagery.
- Don't present unconfirmed prices, availability, or checkout controls.

### Admin workspace
`/admin` is an Operate surface: persistent navigation, filterable service list, and detail editor. Use pale blue panels, labelled native fields, clear selected state, and an explicit Save changes action. Empty, loading, validation, authentication, save, and conflict states must remain visible. Unsaved changes warn before leaving; all changes publish together only after a successful server save.

## Cursor lighting
The storefront has one low-opacity blue cursor light on the canvas (13% at the center) and a separate violet light inside the hovered product card (17% at the center). Opaque card backgrounds keep the two colors separate; card overflow clips the inner light at the rounded boundary. Light layers never intercept interaction and remain below copy and logos. Pointer updates are batched once per animation frame, with no continuous loop. Opacity fades in 220–260ms. Disable the decorative lights for touch, reduced motion, lost window focus, and keyboard navigation. Admin keeps its functional layout without cursor effects.

## Responsive checkout and administration

The plan picker and cart use constrained-height dialogs with a scrollable middle and reachable action footer. On phones and short landscape screens they become bottom sheets. Native safe areas protect controls around notches and home indicators; content can resize when a phone keyboard opens. Touch controls are at least 44px, including on tablets.

At 950px and below, admin switches between the service list and editor, with a Back to services action that retains edits. Save/Revert stay in a bottom action bar. At phone widths service names wrap, fields use one column, and feedback wraps long text. The service-description visibility switch hides public text while preserving saved admin copy.

The exact Myanmar checkout guidance is red (`#a02535`), with the extra price-enquiry sentence whenever the selected plan has no quoted price.

- **Customer pages:** use 80vw content above 900px, with two history-order columns above 1200px. Full Account contains profile, connected methods and settings; history stays on its page. Credential details remain collapsed and passwords masked.
- **Giveaway:** slim navy top banner and first promotion-carousel slide lead to the six-slot prize/entry section. Use verified campaign dates in Myanmar time; a draft says Coming soon. Unlinked customers see a clear explanation and illustrated guide. The guide uses three static pictorial steps; no actual code or successful link is fabricated.
