# Jewellery Sahi Hai — directory, membership, digital catalogue, bio link

Runs entirely on Cloudflare: one Worker + one D1 database. No other services.

## What's inside
- **Directory** — search, city pages, category pages, listing pages, sitemaps.
- **Membership** — sign up, claim a listing (admin-approved), Free and Premium plans.
- **Digital catalogue** — products with photo, weight, purity; "Order on WhatsApp".
- **Bio link** — `/bio/<business>` with links, QR code, save-contact card, 5 colour themes.
- **Enquiries** — buyers send enquiries; owners see them in the dashboard.
- **Admin** (`/admin`) — approve claims, activate memberships, import status.

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
node test/smoke.mjs      # end-to-end test (fresh local database)
```
