# Product catalog sources

`import-catalog.json` contains 51 services and 104 plan rows from the November 2026 full price export. Its publication flags expose all 51 services and 50 representative plans. The remaining 54 plans are available for editing in admin. Of the representative plans, 29 have a quoted MMK price and 21 support enquiries.

## Local sources

Paths in this table are relative to the project root.

| Source | Contents | Use |
| --- | --- | --- |
| `../../Claude/digimium Store Bot/docs/digimium_full_prices.json` | 7 categories, 51 products, 104 plans. Modified November 9, 2026. | Source of imported products, terms and prices. |
| `../../Claude/digimium Store Bot/docs/digimium_kb.json` | 8 products, 26 plans. Modified November 9, 2026. | Comparison for overlapping offers. |
| `../../digimium-shop_1 2/products.json` | 13 offerings, 23 variants. Modified May 24, 2026. | Older website reference. |
| `../../digimium-shop_1 2/logos/products/` | 8 original PNG files. | Artwork for Apple Music, ChatGPT, Claude, ExpressVPN, Gemini, Hiddify, Spotify and YouTube. |
| `../Digimium/digimium-tower/src/catalog.json` | 22 services with artwork references. | Existing storefront catalog reference. |

The dates above record when the local files were modified. The bot's own project documentation places its live knowledge in a separate database. The import uses the local full price export.

## Product and plan matching

The import uses the existing product ID and logo mark for each of 19 recognized products. Four name aliases bring `Gemini (Google AI)`, `CapCut Pro`, `Canva Pro` and `Duoling` into line with Gemini, CapCut, Canva and Duolingo in the storefront. The other 32 products use stable IDs beginning with `import-`. Meitu, Steam games and the generic VPN service exist separately in the storefront. A fresh combined catalog has 54 services.

Plan IDs combine the product import key with the source row number. This keeps distinct entries when plan labels repeat. Each row retains its quoted MMK amount or an empty price for enquiry. Source account, duration, region and device terms appear in plan labels. The source's customer service prompts have been converted into short product or enquiry labels.

The representative selection generally uses the ordinary entry tier or monthly offer. ChatGPT uses Plus for one month, Spotify uses Individual for one month, Netflix uses the phone/laptop plan, and Canva uses Pro for one month. Telegram uses the priced three-month plan. Gemini uses the Google AI Pro three-month offer with one extra month and an enquiry price.

## Prices requiring review

| Offer | Full export | Other entry |
| --- | --- | --- |
| ChatGPT Go on the customer's account | 55,000 MMK | Bot knowledge file lists 49,000 MMK. |
| Canva Pro for 12 months | 125,000 MMK | Bot knowledge file lists 135,000 MMK. |
| Netflix TV in Myanmar | 19,997 MMK | Bot knowledge file lists 20,000 MMK. |
| Quillbot Premium for 3 months and 1 device | 40,000 MMK | Full export repeats the same terms at 60,000 MMK. |

The imported versions of all four offers are hidden for review. Quillbot has only the two conflicting offers, so the product accepts enquiries without a listed plan price. The unpriced Gemini offers in the full export include bonus months. Its companion file quotes different terms, so the import keeps the exported prices empty.
