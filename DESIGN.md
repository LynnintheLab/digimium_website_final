---
name: Digimium
description: A calm, bilingual digital collection.
colors:
  blue: "#1f45b8"
  blue-hover: "#163695"
  ink: "#101113"
  muted: "#66686e"
  line: "#e3e4e8"
  soft: "#f5f5f6"
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

A calm, bilingual digital collection. White space, near-black display surfaces, the supplied Digimium portal mark, and restrained Persian Blue accents create a clear, modern identity. Simple modern sans-serif typography unifies English headings and reading text while supporting browsing and enquiry.

**Key Characteristics:**
- White and near-black foundations with blue accents.
- Simple Manrope headings and English body copy, with spacious Myanmar text.
- Flat surfaces, fine dividers, and gently rounded controls.

## Colors

### Primary
Persian Blue (`blue`) identifies principal actions, headline emphasis, small step numbers, selection, and keyboard focus. The darker `blue-hover` is the primary button hover state.

### Neutral
`white` is the page canvas; `ink` carries headings, selected filters, and dark brand panels. `muted` supports descriptions; `line` separates navigation, search, and accordion rows; `soft` groups catalog cards and contact content.

**The Accent Rule.** Keep the page predominantly white and near-black; use brand blue for emphasis and action.

## Typography

Manrope is the self-hosted English typeface for headings, body copy, and controls, with weights 400, 500, 600, and 700 in `public/assets/fonts/`. Headings use weight 600; keep negative tracking no tighter than -0.04em. Wa Lone is registered as `Walone` from the regular and bold font files in `public/assets/fonts/` and applied through `lang="my"`.

Frontmatter describes the desktop hero, section heading, product title, body, and label roles. Supporting paragraphs commonly use 14px with 1.8–1.9 line-height. Product descriptions are limited to 34ch. Myanmar uses 2.1 line-height, increased to 2.3 in the dark brand section. The hero Myanmar line is 19px on wide screens and 17px below 1150px.

At 1150px the hero title becomes 60px; at 800px it is 47px; at 620px it uses `clamp(43px, 11.7vw, 65px)` with 1.12 line-height. The wide desktop hero is capped at 76px. Product titles become 21px at 800px and 20px at 620px; mobile product copy is 12px. Buttons use 14px text, falling to 13px at 800px.

## Layout

The shared container is `min(1280px, calc(100% - 112px))`, centered. Gutters become 32px per side at 1150px and 20px per side at 620px. The header is 108px tall, then 84px at 800px and 78px at 620px; mobile navigation opens as a full-width white panel below it.

The hero uses a 1.12:1 split with a 65px gap. Catalog cards use three equal columns with a 16px gap, reducing to two columns with an 11px gap at 620px. Hero, brand story, steps, FAQ, and contact layouts become single-column at 620px. Search takes full width on mobile. Major sections use roughly 75–92px desktop spacing, reducing to roughly 45–55px on mobile. Use the source stylesheet for section-specific measurements rather than treating these values as a universal scale.

## Elevation & Depth

The system is flat: no box shadows. Contrast between white, soft gray, and near-black establishes hierarchy. Fine borders divide content; product cards reveal a blue border on hover. The low-opacity supplied portal mark is the sole large graphic layer within the dark collection panel.

## Shapes

Main surfaces use the `surface` radius; mobile product cards use `surface-mobile`. Buttons, category filters, and segmented options use smaller radii. Navigation, FAQ rows, and search use straight fine dividers. Preserve supplied mark proportions; service marks are monochrome, with the Adobe mark retaining its source shape through a grayscale-only treatment.

## Components

- **Primary and secondary actions:** inline flex, 49px minimum height, 22px icon gap. Secondary actions have a fine neutral border. Hover lifts either button by 2px over 0.2s. On mobile, minimum height is 48px and padding is 13px 18px.
- **Catalog filters:** wrapping text controls with 36px minimum height. Active is near-black with white text; inactive hover uses the soft surface. Expose selected state with `aria-pressed`.
- **Search:** understated bottom border, transparent input, blue caret; allow it to expand to full width on mobile.
- **Product cards:** entire card is an enquiry button; left-aligned mark, display title, muted category and description, and an arrow action. Hover changes the surface to white and border to blue.
- **Collection selector:** near-black stage with a darker gray segmented track; active tab is white. Content enters with a 9px vertical shift and opacity change over 0.45s using `cubic-bezier(.16,1,.3,1)`.
- **FAQ:** native details/summary rows separated by fine borders; the chevron turns when open.

Interactive elements use a 3px blue focus outline with 5px offset. Honor `prefers-reduced-motion`: remove transitions and animation and use automatic scrolling. Inline icons use the existing simple stroke vocabulary. Component examples and motion/breakpoint metadata live in `.impeccable/design.json`; implementation remains in `app/globals.css` and `app/page.tsx`.

## Do's and Don'ts

### Do:
- Do preserve supplied logo proportions and use the existing monochrome treatments.
- Do use Wa Lone for Myanmar text and retain generous line-height.
- Do keep product actions clear and contact-led until checkout is implemented.

### Don't:
- Don't turn blue into the dominant page background.
- Don't substitute invented product marks or decorative dashboard imagery.
- Don't present unconfirmed prices, availability, or checkout controls.
