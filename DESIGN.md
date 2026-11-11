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

The hero uses a 1.12:1 split with a 65px gap. Catalog cards use three equal columns above 700px and two columns on phones. Narrow cards stack the logo above the service name, show the complete price, and offer two-line previews of descriptions and plan names. Opening the card reveals the full details. The hero becomes one column at 700px; brand story, steps, FAQ, and contact become one column at 620px. Search takes full width on mobile. Major sections use roughly 75–92px desktop spacing, reducing to roughly 45–55px on mobile. Use the source stylesheet for section-specific measurements rather than treating these values as a universal scale.

## Elevation & Depth

The storefront is flat. Admin surfaces use a small soft shadow to distinguish editing panels. Contrast between pale blue, soft lavender, and navy establishes hierarchy. Fine borders divide content; product cards reveal a blue border on hover. The low-opacity supplied portal mark is the sole large graphic layer within the dark collection panel.

## Shapes

Main surfaces use the `surface` radius; mobile product cards use `surface-mobile`. Buttons, category filters, and segmented options use smaller radii. Navigation, FAQ rows, and search use straight fine dividers. Preserve supplied mark proportions; service marks retain original colors, with accurate black marks retained where appropriate.

## Components

- **Primary and secondary actions:** inline flex, 49px minimum height, 22px icon gap. Secondary actions have a fine neutral border. Hover lifts either button by 2px over 0.2s. On mobile, minimum height is 48px and padding is 13px 18px.
- **Catalog filters:** wrapping text controls with 36px minimum height. Active is Persian Blue with white text; inactive hover uses the soft surface. Expose selected state with `aria-pressed`.
- **Search:** compact on desktop; full-width, lightly tinted and bordered on phones, placed above the filters. Clear control is 44px; Enter dismisses the keyboard.
- **Product cards:** entire card opens the plan picker; left-aligned mark, display title, muted category and description, and an arrow action. Hover changes the surface to a slightly deeper blue tint and border to blue.
- **Collection selector:** navy gradient stage with a blue segmented track; the active tab is pale blue. Content enters with a 9px vertical shift and opacity change over 0.45s using `cubic-bezier(.16,1,.3,1)`.
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
