// Database: Cloudflare D1 (SQLite). The schema installs itself on first request,
// so there are no manual database steps.

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  BRAND_NAME: string;
  SITE_URL: string;
  RATES_URL?: string;
  IMPORT_URL?: string;
  IMPORT_KEY?: string;
  EMAIL?: { send(m: { to: string; from: string; subject: string; text: string; html?: string }): Promise<unknown> };
  CASHFREE_APP_ID?: string;
  CASHFREE_SECRET?: string;
  CASHFREE_ENV?: string;
};

const SCHEMA_VERSION = "13";

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (
     id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
     phone TEXT, pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL,
     is_admin INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS businesses (
     id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
     gst TEXT UNIQUE, city TEXT, city_slug TEXT, about TEXT, phone TEXT, whatsapp TEXT, email TEXT,
     website TEXT, address TEXT, hours TEXT, instagram TEXT, facebook TEXT, youtube TEXT,
     logo_image INTEGER, cover_image INTEGER, owner_id INTEGER,
     plan TEXT NOT NULL DEFAULT 'free', plan_expires INTEGER,
     theme TEXT NOT NULL DEFAULT 'gold', gst_status TEXT, gst_since TEXT,
     views INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'import', created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS businesses_city_idx ON businesses (city_slug)`,
  `CREATE INDEX IF NOT EXISTS businesses_owner_idx ON businesses (owner_id)`,
  `CREATE INDEX IF NOT EXISTS businesses_plan_idx ON businesses (plan)`,
  `CREATE INDEX IF NOT EXISTS businesses_created_idx ON businesses (created_at)`,
  `CREATE TABLE IF NOT EXISTS business_types (
     business_id INTEGER NOT NULL, type TEXT NOT NULL, PRIMARY KEY (business_id, type))`,
  `CREATE INDEX IF NOT EXISTS business_types_type_idx ON business_types (type)`,
  `CREATE TABLE IF NOT EXISTS products (
     id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER NOT NULL, name TEXT NOT NULL,
     category TEXT, weight TEXT, purity TEXT, price TEXT, description TEXT, image_id INTEGER,
     position INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
     clicks INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS products_business_idx ON products (business_id, position)`,
  `CREATE TABLE IF NOT EXISTS links (
     id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL,
     position INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, clicks INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS links_business_idx ON links (business_id, position)`,
  `CREATE TABLE IF NOT EXISTS extras (
     id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER NOT NULL, kind TEXT NOT NULL,
     title TEXT, body TEXT, image_id INTEGER, position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS extras_business_idx ON extras (business_id, kind, position)`,
  `CREATE TABLE IF NOT EXISTS images (
     id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
     mime TEXT NOT NULL, data BLOB NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS images_business_idx ON images (business_id)`,
  `CREATE TABLE IF NOT EXISTS enquiries (
     id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER NOT NULL, product_id INTEGER,
     name TEXT NOT NULL, phone TEXT NOT NULL, message TEXT, status TEXT NOT NULL DEFAULT 'new', created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS enquiries_business_idx ON enquiries (business_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS claims (
     id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
     role TEXT, phone TEXT, note TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS claims_status_idx ON claims (status, created_at)`,
  `CREATE TABLE IF NOT EXISTS payments (
     id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, business_id INTEGER NOT NULL,
     plan TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'requested',
     provider TEXT, ref TEXT, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status, created_at)`,
  `CREATE TABLE IF NOT EXISTS rate (key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL)`,
  // Contact details shown only to paid members, one reveal at a time.
  `CREATE TABLE IF NOT EXISTS private_contacts (business_id INTEGER PRIMARY KEY, mobile TEXT, tel TEXT, email TEXT)`,
  `CREATE TABLE IF NOT EXISTS reveals (
     id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, business_id INTEGER NOT NULL,
     day TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE (user_id, business_id, day))`,
  `CREATE INDEX IF NOT EXISTS reveals_user_day_idx ON reveals (user_id, day)`,
  // Ownership checks: emailed codes, private proof documents, wrong-owner reports.
  `CREATE TABLE IF NOT EXISTS claim_codes (
     id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
     code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS claim_codes_idx ON claim_codes (business_id, user_id)`,
  `CREATE TABLE IF NOT EXISTS claim_docs (claim_id INTEGER PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reports (
     id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL,
     message TEXT, status TEXT NOT NULL DEFAULT 'new', created_at INTEGER NOT NULL)`,
  // Banner ads and sponsor logos.
  `CREATE TABLE IF NOT EXISTS banners (
     id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, url TEXT NOT NULL, image_id INTEGER, placement TEXT NOT NULL,
     position INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, starts_at INTEGER, ends_at INTEGER,
     views INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS banners_place_idx ON banners (placement, active)`,
  `CREATE TABLE IF NOT EXISTS requests (
     id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT, details TEXT, qty TEXT, city TEXT,
     name TEXT NOT NULL, phone TEXT NOT NULL, user_id INTEGER, status TEXT NOT NULL DEFAULT 'open', views INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS requests_idx ON requests (status, created_at)`,
  `CREATE TABLE IF NOT EXISTS news (
     id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, url TEXT NOT NULL UNIQUE, source TEXT, topic TEXT, published_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS news_pub_idx ON news (published_at)`,
  `CREATE TABLE IF NOT EXISTS events (
     id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, city TEXT, venue TEXT, starts_on TEXT NOT NULL, ends_on TEXT,
     url TEXT, details TEXT, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS events_idx ON events (starts_on)`,
  `CREATE TABLE IF NOT EXISTS ad_leads (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, business TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, message TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reviews (
     id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER NOT NULL, user_id INTEGER NOT NULL, rating INTEGER NOT NULL,
     body TEXT, reply TEXT, status TEXT NOT NULL DEFAULT 'live', created_at INTEGER NOT NULL, UNIQUE (business_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS saved (user_id INTEGER NOT NULL, business_id INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, business_id))`,
  `CREATE TABLE IF NOT EXISTS rate_subs (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, token TEXT NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rate_history (ts INTEGER PRIMARY KEY, gold995gst REAL, silver_gst REAL, gold_usd REAL, usd_inr REAL)`,
];

const ALTERS = [`ALTER TABLE businesses ADD COLUMN state TEXT`, `ALTER TABLE users ADD COLUMN digest_off INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE requests ADD COLUMN kind TEXT NOT NULL DEFAULT 'buy'`];

let ready: Promise<void> | null = null;

export function ensureSchema(env: Env): Promise<void> {
  if (!ready) {
    ready = (async () => {
      try {
        const row = await env.DB.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).first<{ value: string }>();
        if (row?.value === SCHEMA_VERSION) return;
      } catch {
        // meta table missing: first run
      }
      await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
      for (const alter of ALTERS) { try { await env.DB.prepare(alter).run(); } catch { /* column already there */ } }
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS businesses_state_idx ON businesses (state)`).run();
      await env.DB.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)`).bind(SCHEMA_VERSION).run();
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

export const now = () => Math.floor(Date.now() / 1000);

export async function getMeta(env: Env, key: string): Promise<string | null> {
  const r = await env.DB.prepare(`SELECT value FROM meta WHERE key = ?`).bind(key).first<{ value: string }>();
  return r?.value ?? null;
}
export async function setMeta(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`).bind(key, value).run();
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "business";
}

/** Fixed-window rate limit. Returns true when the action is allowed. */
export async function allow(env: Env, key: string, max: number, windowSec: number): Promise<boolean> {
  const t = now();
  const row = await env.DB.prepare(`SELECT count, window_start FROM rate WHERE key = ?`).bind(key).first<{ count: number; window_start: number }>();
  if (!row || t - row.window_start >= windowSec) {
    await env.DB.prepare(`INSERT OR REPLACE INTO rate (key, count, window_start) VALUES (?, 1, ?)`).bind(key, t).run();
    return true;
  }
  if (row.count >= max) return false;
  await env.DB.prepare(`UPDATE rate SET count = count + 1 WHERE key = ?`).bind(key).run();
  return true;
}

export type Business = {
  id: number; slug: string; name: string; gst: string | null; city: string | null; city_slug: string | null;
  about: string | null; phone: string | null; whatsapp: string | null; email: string | null; website: string | null;
  address: string | null; hours: string | null; instagram: string | null; facebook: string | null; youtube: string | null;
  logo_image: number | null; cover_image: number | null; owner_id: number | null;
  plan: string; plan_expires: number | null; theme: string; gst_status: string | null; gst_since: string | null; state?: string | null;
  views: number; source: string; created_at: number;
};

export function isPremium(b: Pick<Business, "plan" | "plan_expires">): boolean {
  return b.plan === "premium" && (!b.plan_expires || b.plan_expires > now());
}

export const PLAN_LIMITS = {
  free: { products: 6, links: 5, gallery: 3, offers: 0, faqs: 2 },
  premium: { products: 200, links: 30, gallery: 20, offers: 10, faqs: 15 },
} as const;
export function limits(b: Pick<Business, "plan" | "plan_expires">) {
  return isPremium(b) ? PLAN_LIMITS.premium : PLAN_LIMITS.free;
}

export const PLANS = {
  premium_monthly: { label: "Premium — monthly", amount: 999, days: 31 },
  premium_yearly: { label: "Premium — yearly", amount: 9999, days: 366 },
} as const;
export type PlanKey = keyof typeof PLANS;

/** Set to Date.now() when something shown on the home page changes, so cached home data is rebuilt. */
export const cacheBust = { home: 0 };
