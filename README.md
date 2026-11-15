# Jewellery Sahi Hai — directory, membership, digital catalogue, bio link

Runs entirely on Cloudflare: one Worker + one D1 database. No other services.

## What's inside
- **Directory** — search, city pages, category pages, listing pages, sitemaps.
- **Membership** — sign up, claim a listing (admin-approved), Free and Premium plans.
- **Digital catalogue** — products with photo, weight, purity; "Order on WhatsApp".
- **Bio link** — `/bio/<business>` with links, QR code, save-contact card, 5 colour themes.
- **Enquiries** — buyers send enquiries; owners see them in the dashboard.
- **Live rates** (`/rates`) — gold and silver from the rate partner's desk, 7-day charts, embeddable widget, daily rate email (double opt-in) and target-rate alerts.
- **Tools** (`/tools`) — nine calculators (price, old gold, 995/999, purity, weight, GST, silver, making, landed cost).
- **Trade board** (`/requirements`) — buy requirements, stock offers, job vacancies and work-wanted posts; contacts shown only to signed-in members.
- **Reviews and saved listings** — star reviews on claimed listings with owner replies; private shortlist at `/saved`.
- **Guides, news, events** — plain-language trade guides, a news feed and a trade-show calendar.
- **Members-only contacts** — directory phone numbers and emails are revealed one at a time to paid members, with daily limits and a log.
- **Ads and sponsors** — banner placements managed from admin; partner lines are labelled.
- **Admin** (`/admin`) — claims, memberships, reports, listing search (remove contact / owner / listing), reviews, trade board, events, banners, advertising enquiries.

## How it deploys
Every push to `main` is built and deployed by Cloudflare. The database is created
automatically on first deploy and its tables install themselves on first visit.

## Settings (Cloudflare → Worker → Settings → Variables and secrets)
| Name | Needed? | What it does |
|---|---|---|
| `SITE_URL` | when the domain is connected | e.g. `https://jewellerysahihai.com` |
| `CASHFREE_APP_ID`, `CASHFREE_SECRET` | optional (add as **Secret**) | turns on online payment; without them, upgrades are requests the admin activates |
| `CASHFREE_ENV` | optional | `sandbox` for test payments |

The first account to sign up becomes the admin.

## Local development
```
npm install
npx wrangler dev --port 8799
node test/smoke.mjs      # end-to-end test; needs a fresh local database seeded with the three test businesses named in the script
```
