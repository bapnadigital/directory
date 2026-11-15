/** @jsxImportSource hono/jsx */
import { Hono, type Context } from "hono";
import type { Child } from "hono/jsx";
import QRCode from "qrcode-svg";
import { type AppEnv, clientIp } from "../auth";
import { type Business, allow, isPremium, now, PLANS, PLAN_LIMITS, cacheBust } from "../db";
import { Ad, Showcase, Sponsors } from "./ads";
import { RateStrip } from "./rates";
import { GUIDES } from "./guides";
import { ReviewsBlock, isSaved, loadReviews } from "./reviews";
import { sendMail } from "../mail";
import { LatestNews, LatestRequests } from "./market";
import { TOOLS } from "./tools";
import { DAILY_REVEALS, hasReveal, isPaidMember, revealsToday } from "./contact";
import { CITIES, STATES, THEMES, TRADE_TYPES, findCity, findState, findType, initials, safeUrl, waNumber } from "../content";
import { BizCard, type Card, Field, Flash, page, siteUrl } from "../ui";

export const pub = new Hono<AppEnv>();

const CARD_COLS = `b.id, b.slug, b.name, b.city, b.owner_id, b.plan, b.plan_expires, b.logo_image, b.gst,
  (SELECT group_concat(type) FROM business_types t WHERE t.business_id = b.id) AS types`;
const ORDER = `ORDER BY (b.plan = 'premium' AND (b.plan_expires IS NULL OR b.plan_expires > strftime('%s','now'))) DESC,
  (b.owner_id IS NOT NULL) DESC, b.created_at DESC, b.id DESC`;
const PAGE_SIZE = 24;

type Filters = { q?: string; city?: string; type?: string; claimed?: boolean; state?: string; sort?: string };

function where(f: Filters): { sql: string; args: unknown[] } {
  const parts: string[] = [];
  const args: unknown[] = [];
  const q = (f.q ?? "").trim().slice(0, 60);
  // Every word must match the name, city, state or GSTIN, so "bangles mumbai" works.
  for (const w of q.split(/\s+/).filter((x) => x.length >= 2).slice(0, 5)) {
    parts.push(`(b.name LIKE ? OR b.city LIKE ? OR b.state LIKE ? OR b.gst LIKE ?)`);
    args.push(`%${w}%`, `%${w}%`, `%${w}%`, `%${w.toUpperCase()}%`);
  }
  if (f.city) { parts.push(`b.city_slug = ?`); args.push(f.city); }
  if (f.state) { parts.push(`b.state = ?`); args.push(f.state); }
  const t = findType(f.type);
  if (t) {
    parts.push(`(EXISTS (SELECT 1 FROM business_types t WHERE t.business_id = b.id AND t.type = ?) OR b.name LIKE ?)`);
    args.push(t.slug, `%${t.keyword}%`);
  }
  if (f.claimed) parts.push(`b.owner_id IS NOT NULL`);
  return { sql: parts.length ? `WHERE ${parts.join(" AND ")}` : "", args };
}

async function search(db: D1Database, f: Filters, pageNo: number) {
  const w = where(f);
  const [rows, count] = await Promise.all([
    db.prepare(`SELECT ${CARD_COLS} FROM businesses b ${w.sql} ${f.sort === "name" ? "ORDER BY b.name COLLATE NOCASE, b.id" : f.sort === "views" ? "ORDER BY b.views DESC, b.id" : ORDER} LIMIT ? OFFSET ?`)
      .bind(...w.args, PAGE_SIZE, (pageNo - 1) * PAGE_SIZE).all<Card>(),
    db.prepare(`SELECT count(*) AS n FROM businesses b ${w.sql}`).bind(...w.args).first<{ n: number }>(),
  ]);
  return { rows: rows.results, total: count?.n ?? 0 };
}

pub.get("/api/suggest", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 40);
  if (q.length < 2) return c.json({ items: [] });
  const ql = q.toLowerCase();
  const cities = CITIES.filter((x) => x.label.toLowerCase().startsWith(ql)).slice(0, 2).map((x) => ({ label: `Jewellers in ${x.label}`, url: `/city/${x.slug}` }));
  const types = TRADE_TYPES.filter((x) => x.label.toLowerCase().includes(ql)).slice(0, 2).map((x) => ({ label: x.label, url: `/category/${x.slug}` }));
  const rows = (await c.env.DB.prepare(`SELECT slug, name, city FROM businesses WHERE name LIKE ? ORDER BY (owner_id IS NOT NULL) DESC, views DESC LIMIT 6`).bind(`${q}%`).all<{ slug: string; name: string; city: string | null }>()).results;
  return c.json({ items: [...cities, ...types, ...rows.map((r) => ({ label: r.name, sub: r.city, url: `/b/${r.slug}` }))] }, 200, { "cache-control": "public, max-age=120" });
});

// ───────────────────────── Home ─────────────────────────
let homeCache: { at: number; featured: D1Result<Card>; latest: D1Result<Card>; total: { n: number } | null } | null = null;
const SPECIALITIES = [["Gold", "gold"], ["Diamond", "diam"], ["Silver", "silver"], ["Antique & Kundan", "kundan"], ["Chains", "chain"], ["Bangles", "bangle"], ["Mangalsutra", "mangalsutra"], ["Temple jewellery", "temple"], ["Polki", "polki"], ["Platinum", "platinum"], ["Gemstones", "gems"], ["Pearls", "pearl"], ["Casting", "casting"], ["Imitation", "imitation"], ["Bullion", "bullion"], ["Ornaments", "ornament"]];
pub.get("/", async (c) => {
  const db = c.env.DB;
  if (!homeCache || Date.now() - homeCache.at > 60000 || homeCache.at <= cacheBust.home) {
    const [f, l, t] = await Promise.all([
      db.prepare(`SELECT ${CARD_COLS} FROM businesses b WHERE b.plan = 'premium' AND (b.plan_expires IS NULL OR b.plan_expires > ?) ORDER BY random() LIMIT 4`).bind(now()).all<Card>(),
      db.prepare(`SELECT ${CARD_COLS} FROM businesses b ${ORDER} LIMIT 8`).all<Card>(),
      db.prepare(`SELECT count(*) AS n FROM businesses`).first<{ n: number }>(),
    ]);
    homeCache = { at: Date.now(), featured: f, latest: l, total: t };
  }
  const { featured, latest, total } = homeCache;
  const n = total?.n ?? 0;
  const brand = c.env.BRAND_NAME;
  return page(c, {
    title: `${brand} — Find & verify jewellers across India`,
    desc: "India's jewellery trade directory: find manufacturers, wholesalers, retailers and bullion dealers by city. View catalogues, send enquiries and order on WhatsApp.",
    path: "/",
    jsonld: { "@context": "https://schema.org", "@type": "WebSite", name: brand, url: siteUrl(c), potentialAction: { "@type": "SearchAction", target: `${siteUrl(c)}/directory?q={q}`, "query-input": "required name=q" } },
  }, (
    <main>
      <section class="hero wrap">
        <div class="eyebrow">India's jewellery, bullion and allied trade directory</div>
        <h1 style="margin-top:14px">Find the right jeweller<br /><em>before you deal.</em></h1>
        <p class="muted" style="max-width:560px;margin:16px auto 0">
          {n > 0 ? `${n.toLocaleString("en-IN")} jewellery businesses. ` : ""}Search by name, GSTIN or city. View catalogues, send enquiries and order on WhatsApp — free.
        </p>
        <form class="search" action="/directory" method="get">
          <input name="q" placeholder="Business name, GSTIN or city" aria-label="Search" />
          <button class="btn" type="submit">Search</button>
        </form>
      </section>

      <div class="wrap"><RateStrip c={c} /><Ad c={c} place="home" /></div>

      <section class="wrap">
        <div class="center"><div class="eyebrow">Browse by category</div><h2 style="font-size:26px;margin:6px 0 18px">What are you looking for?</h2></div>
        <div class="grid g5">
          {TRADE_TYPES.slice(0, 15).map((t) => (
            <a class="card tile" href={`/category/${t.slug}`}><div class="ic">{t.icon}</div><b class="small">{t.label}</b></a>
          ))}
        </div>
      </section>

      {featured.results.length > 0 && (
        <section class="wrap">
          <div class="head"><div><div class="eyebrow">★ Featured</div><h2>Premium members</h2></div></div>
          <div class="grid g4">{featured.results.map((b) => <BizCard b={b} />)}</div>
        </section>
      )}

      {latest.results.length > 0 && (
        <section class="wrap">
          <div class="head">
            <div><div class="eyebrow">Directory</div><h2>Recently listed</h2></div>
            <a class="gold small" href="/directory">Browse all {n.toLocaleString("en-IN")} →</a>
          </div>
          <div class="grid g4">{latest.results.map((b) => <BizCard b={b} />)}</div>
        </section>
      )}

      <section class="wrap">
        <div class="head"><div><div class="eyebrow">Popular hubs</div><h2>Explore by city</h2></div><span class="row"><a class="gold small" href="/states">By state →</a><a class="gold small" href="/cities">All cities →</a></span></div>
        <div class="grid g4">
          {CITIES.slice(0, 8).map((ct) => (
            <a class="card" href={`/city/${ct.slug}`}>📍<h3 style="margin-top:18px;font-size:18px">{ct.label}</h3><div class="tiny muted">{ct.note}</div></a>
          ))}
        </div>
      </section>

      <section class="wrap">
        <div class="center"><div class="eyebrow">Search by speciality</div></div>
        <div class="row" style="gap:8px;justify-content:center;margin-top:12px">{SPECIALITIES.map(([l, q]) => <a class="chip" href={`/directory?q=${q}`}>{l}</a>)}</div>
      </section>

      <Showcase c={c} />

      <LatestRequests c={c} />

      <section class="wrap">
        <div class="head"><div><div class="eyebrow">Free tools</div><h2>Calculators with live rates</h2></div><a class="gold small" href="/tools">All tools →</a></div>
        <div class="grid g4">{TOOLS.slice(0, 4).map((t) => <a class="card" href={`/tools/${t.slug}`}><b>{t.icon} {t.name}</b><p class="small muted" style="margin-bottom:0">{t.short}</p></a>)}</div>
      </section>

      <section class="wrap">
        <div class="center"><div class="eyebrow">For business owners</div><h2 style="font-size:26px;margin:6px 0 18px">One listing. Catalogue, bio link and enquiries.</h2></div>
        <div class="grid g3">
          <div class="card"><h3>📇 Directory listing</h3><p class="small muted">Claim your business, add details, photos, hours and what you deal in.</p></div>
          <div class="card"><h3>💍 Digital catalogue</h3><p class="small muted">Products with photo, weight and purity. Buyers order on WhatsApp in one tap.</p></div>
          <div class="card"><h3>🔗 Bio link + QR</h3><p class="small muted">One link for Instagram and WhatsApp with all your links, a QR code and save-contact card.</p></div>
        </div>
      </section>

      <section class="wrap">
        <div class="head"><div><div class="eyebrow">Guides</div><h2>Know the rules of the trade</h2></div><a class="gold small" href="/guides">All guides →</a></div>
        <div class="grid g3">{GUIDES.slice(0, 3).map((g) => <a class="card" href={`/guides/${g.slug}`}><b>{g.title}</b><p class="small muted" style="margin:6px 0 0">{g.desc}</p></a>)}</div>
      </section>
      <LatestNews c={c} />

      <Sponsors c={c} />

      <section class="wrap">
        <div class="band">
          <div class="eyebrow">Free to start</div>
          <h2 style="font-size:30px;margin:8px 0">Your business may already be listed.</h2>
          <p class="muted" style="max-width:520px;margin:0 auto 18px">Find it, claim it and make it yours in a few minutes.</p>
          <div class="row" style="justify-content:center"><a class="btn" href="/signup">List or claim your business</a><a class="btn ghost" href="/pricing">See membership plans</a></div>
        </div>
      </section>
    </main>
  ));
});

// ───────────────────────── Directory ─────────────────────────
function listing(title: string, sub: string, basePath: string, f: Filters, pageNo: number, data: { rows: Card[]; total: number }, showFilters: boolean, c: Context<AppEnv>, extra?: Child) {
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (f.q) u.set("q", f.q);
    if (showFilters && f.city) u.set("city", f.city);
    if (showFilters && f.type) u.set("type", f.type);
    if (showFilters && f.state) u.set("state", STATES.find((s) => s.label === f.state)?.slug ?? "");
    if (f.claimed) u.set("claimed", "1");
    if (f.sort) u.set("sort", f.sort);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  return (
    <main class="wrap" style="padding-top:26px">
      <h1 style="font-size:30px">{title}</h1>
      <p class="muted small">{data.total.toLocaleString("en-IN")} businesses. {sub}</p>
      {extra}
      <div class="layout" style="margin-top:18px">
        <aside class="card">
          <form method="get" action={basePath}>
            <label>Search<input name="q" value={f.q ?? ""} placeholder="Name, GSTIN or city" /></label>
            <label>Sort by<select name="sort" data-autosubmit><option value="">Featured and claimed first</option><option value="name" selected={f.sort === "name"}>Name A to Z</option><option value="views" selected={f.sort === "views"}>Most viewed</option></select></label>
            {showFilters && (
              <details class="flt" open={!!(f.city || f.type || f.state || f.claimed)}><summary class="small gold">Filter by city, state or type</summary>
                <label style="margin-top:10px">City
                  <select name="city"><option value="">All cities</option>{CITIES.map((ct) => <option value={ct.slug} selected={f.city === ct.slug}>{ct.label}</option>)}</select>
                </label>
                <label>State
                  <select name="state"><option value="">All states</option>{STATES.slice(0, 22).map((st) => <option value={st.slug} selected={f.state === st.label}>{st.label}</option>)}</select>
                </label>
                <label>Business type
                  <select name="type"><option value="">All types</option>{TRADE_TYPES.map((t) => <option value={t.slug} selected={f.type === t.slug}>{t.label}</option>)}</select>
                </label>
                <label class="row"><input type="checkbox" name="claimed" value="1" checked={!!f.claimed} /> Claimed by owner</label>
              </details>
            )}
            {!showFilters && <label class="row"><input type="checkbox" name="claimed" value="1" checked={!!f.claimed} /> Claimed by owner</label>}
            <button class="btn block" type="submit">Apply</button>
            <a class="small muted center" style="display:block;margin-top:10px" href={basePath}>Clear filters</a>
          </form>
        </aside>
        <div>
          <Ad c={c} place="directory" />
          {data.rows.length === 0
            ? <div class="card center muted">No businesses match. Try a different search.</div>
            : <div class="grid g3">{data.rows.map((b) => <BizCard b={b} />)}</div>}
          {pages > 1 && (
            <div class="pager">
              {pageNo > 1 && <a class="btn ghost sm" href={qs(pageNo - 1)} rel="prev">← Previous</a>}
              <span class="small muted" style="align-self:center">Page {pageNo} of {pages.toLocaleString("en-IN")}</span>
              {pageNo < pages && <a class="btn ghost sm" href={qs(pageNo + 1)} rel="next">Next →</a>}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

const pageNum = (v?: string) => Math.min(2000, Math.max(1, parseInt(v ?? "1", 10) || 1));

pub.get("/directory", async (c) => {
  const f: Filters = { q: c.req.query("q"), city: findCity(c.req.query("city"))?.slug, type: findType(c.req.query("type"))?.slug, claimed: c.req.query("claimed") === "1", sort: ["name", "views"].includes(c.req.query("sort") ?? "") ? c.req.query("sort") : undefined, state: findState(c.req.query("state"))?.label };
  const p = pageNum(c.req.query("page"));
  const data = await search(c.env.DB, f, p);
  const filtered = !!(f.q || f.city || f.type || f.claimed || f.state || f.sort || p > 1);
  return page(c, { title: "Jewellery business directory", desc: "Search jewellery manufacturers, wholesalers, retailers and bullion dealers across India.", path: "/directory", noindex: filtered },
    listing("Jewellery directory", "Free to search, no sign-in needed.", "/directory", f, p, data, true, c));
});

pub.get("/city/:slug", async (c) => {
  let city = findCity(c.req.param("slug"));
  if (!city) {
    const slug = c.req.param("slug").toLowerCase();
    const row = /^[a-z0-9-]{2,60}$/.test(slug) ? await c.env.DB.prepare(`SELECT city, state, count(*) AS n FROM businesses WHERE city_slug = ?`).bind(slug).first<{ city: string | null; state: string | null; n: number }>() : null;
    if (!row || !row.city || row.n < 1) return c.notFound();
    city = { slug, label: row.city, note: row.state ?? "India" };
  }
  const f: Filters = { q: c.req.query("q"), city: city.slug, claimed: c.req.query("claimed") === "1", sort: ["name", "views"].includes(c.req.query("sort") ?? "") ? c.req.query("sort") : undefined };
  const p = pageNum(c.req.query("page"));
  const data = await search(c.env.DB, f, p);
  return page(c, {
    title: `Jewellers in ${city.label} — manufacturers, wholesalers, retailers`,
    desc: `${data.total.toLocaleString("en-IN")} jewellery businesses in ${city.label} (${city.note}). View catalogues and contact them directly.`,
    path: `/city/${city.slug}`, noindex: p > 1 || !!f.q || !!f.sort,
    jsonld: { "@context": "https://schema.org", "@type": "ItemList", name: `Jewellers in ${city.label}`, numberOfItems: data.total,
      itemListElement: data.rows.slice(0, 20).map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, url: `${siteUrl(c)}/b/${b.slug}` })) },
  }, listing(`Jewellers in ${city.label}`, city.note, `/city/${city.slug}`, f, p, data, false, c,
    findCity(city.slug) ? <div class="row" style="gap:6px;margin:10px 0 0">{TRADE_TYPES.map((x) => <a class="badge" href={`/city/${city.slug}/${x.slug}`}>{x.label}</a>)}</div> : undefined));
});

pub.get("/city/:slug/:type", async (c) => {
  const city = findCity(c.req.param("slug")), t = findType(c.req.param("type"));
  if (!city || !t) return c.notFound();
  const f: Filters = { q: c.req.query("q"), city: city.slug, type: t.slug };
  const p = pageNum(c.req.query("page"));
  const data = await search(c.env.DB, f, p);
  return page(c, {
    title: `${t.label} in ${city.label}`, desc: `${data.total.toLocaleString("en-IN")} ${t.label.toLowerCase()} in ${city.label} (${city.note}). View details and contact options.`,
    path: `/city/${city.slug}/${t.slug}`, noindex: p > 1 || !!f.q || data.total < 3,
  }, listing(`${t.label} in ${city.label}`, city.note, `/city/${city.slug}/${t.slug}`, f, p, data, false, c,
    <div class="row" style="gap:6px;margin:10px 0 0"><a class="badge" href={`/city/${city.slug}`}>All in {city.label}</a>{TRADE_TYPES.map((x) => <a class={`badge ${x.slug === t.slug ? "gold" : ""}`} href={`/city/${city.slug}/${x.slug}`}>{x.label}</a>)}</div>));
});

pub.get("/category/:slug", async (c) => {
  const t = findType(c.req.param("slug"));
  if (!t) return c.notFound();
  const f: Filters = { q: c.req.query("q"), type: t.slug, claimed: c.req.query("claimed") === "1", sort: ["name", "views"].includes(c.req.query("sort") ?? "") ? c.req.query("sort") : undefined };
  const p = pageNum(c.req.query("page"));
  const data = await search(c.env.DB, f, p);
  return page(c, { title: `${t.label} — jewellery trade directory`, desc: `Find ${t.label.toLowerCase()} in the Indian jewellery trade. ${data.total.toLocaleString("en-IN")} businesses listed.`, path: `/category/${t.slug}`, noindex: p > 1 || !!f.q },
    listing(t.label, "Businesses tagged by their owners appear first.", `/category/${t.slug}`, f, p, data, false, c));
});

let geoCache: { at: number; states: { state: string; n: number }[]; cities: { city: string; city_slug: string; n: number }[] } | null = null;
async function geo(db: D1Database) {
  if (geoCache && Date.now() - geoCache.at < 600000) return geoCache;
  const [st, ci] = await Promise.all([
    db.prepare(`SELECT state, count(*) AS n FROM businesses WHERE state IS NOT NULL GROUP BY state ORDER BY n DESC`).all<{ state: string; n: number }>(),
    db.prepare(`SELECT min(city) AS city, city_slug, count(*) AS n FROM businesses WHERE city_slug IS NOT NULL AND city_slug <> '' GROUP BY city_slug HAVING n >= 15 ORDER BY n DESC LIMIT 240`).all<{ city: string; city_slug: string; n: number }>(),
  ]);
  geoCache = { at: Date.now(), states: st.results, cities: ci.results };
  return geoCache;
}

pub.get("/states", async (c) => {
  const g = await geo(c.env.DB);
  return page(c, { title: "Jewellers by state — India jewellery trade directory", desc: "Browse jewellery manufacturers, wholesalers, retailers and bullion dealers in every Indian state.", path: "/states" }, (
    <main class="wrap" style="padding-top:26px">
      <h1 style="font-size:30px">Jewellers by state</h1>
      <div class="grid g4" style="margin-top:18px">
        {g.states.map((s) => { const st = STATES.find((x) => x.label === s.state); return st ? <a class="card" href={`/state/${st.slug}`}><h3 style="font-size:16px">{st.label}</h3><div class="tiny muted">{s.n.toLocaleString("en-IN")} businesses</div></a> : null; })}
      </div>
    </main>
  ));
});

pub.get("/state/:slug", async (c) => {
  const st = findState(c.req.param("slug"));
  if (!st) return c.notFound();
  const f: Filters = { q: c.req.query("q"), state: st.label, claimed: c.req.query("claimed") === "1", sort: ["name", "views"].includes(c.req.query("sort") ?? "") ? c.req.query("sort") : undefined };
  const p = pageNum(c.req.query("page"));
  const data = await search(c.env.DB, f, p);
  return page(c, {
    title: `Jewellers in ${st.label} — manufacturers, wholesalers, bullion dealers, retailers`,
    desc: `${data.total.toLocaleString("en-IN")} jewellery businesses in ${st.label}. Search by name or city, view catalogues and send enquiries.`,
    path: `/state/${st.slug}`, noindex: p > 1 || !!f.q || !!f.sort,
  }, listing(`Jewellers in ${st.label}`, "All listed jewellery and allied businesses in the state.", `/state/${st.slug}`, f, p, data, false, c));
});

pub.get("/categories", (c) => page(c, { title: "Jewellery trade categories", desc: "Browse the jewellery trade by category: manufacturers, wholesalers, bullion, diamonds, hallmarking, refiners, tools, packaging and allied services.", path: "/categories" }, (
  <main class="wrap" style="padding-top:26px">
    <h1 style="font-size:30px">Trade categories</h1>
    <div class="grid g5" style="margin-top:18px">{TRADE_TYPES.map((t) => <a class="card tile" href={`/category/${t.slug}`}><div class="ic">{t.icon}</div><b class="small">{t.label}</b></a>)}</div>
  </main>
)));

pub.get("/cities", async (c) => { const g = await geo(c.env.DB); return page(c, { title: "Jewellery hubs of India", desc: "Browse jewellery businesses by city.", path: "/cities" }, (
  <main class="wrap" style="padding-top:26px">
    <h1 style="font-size:30px">Jewellery hubs</h1>
    <div class="grid g4" style="margin-top:18px">
      {CITIES.map((ct) => <a class="card" href={`/city/${ct.slug}`}><h3 style="font-size:17px">📍 {ct.label}</h3><div class="tiny muted">{ct.note}</div></a>)}
    </div>
    <h2 style="font-size:20px;margin:26px 0 12px">More cities and towns</h2>
    <div class="row" style="gap:8px">{g.cities.filter((x) => !findCity(x.city_slug)).map((x) => <a class="badge" href={`/city/${x.city_slug}`}>{x.city} · {x.n}</a>)}</div>
    <p class="small" style="margin-top:18px"><a class="gold" href="/states">Browse by state →</a></p>
  </main>
)); });

// ───────────────────────── Listing page ─────────────────────────
type Product = { id: number; name: string; category: string | null; weight: string | null; purity: string | null; price: string | null; description: string | null; image_id: number | null };
type Extra = { id: number; kind: string; title: string | null; body: string | null; image_id: number | null };
type LinkRow = { id: number; title: string; url: string };

async function loadBusiness(db: D1Database, slug: string) {
  return db.prepare(`SELECT * FROM businesses WHERE slug = ?`).bind(slug.toLowerCase()).first<Business>();
}

function ProductCard({ p, slug }: { p: Product; slug: string }) {
  return (
    <div class="card prod">
      {p.image_id ? <img src={`/img/${p.image_id}`} alt={p.name} loading="lazy" /> : <div class="ph">💍</div>}
      <h3 style="font-size:15px;margin-top:10px">{p.name}</h3>
      <div class="row" style="gap:6px;margin:8px 0">
        {p.weight && <span class="badge">{p.weight}</span>}
        {p.purity && <span class="badge">{p.purity}</span>}
        <span class="badge soft">{p.price || "Price on request"}</span>
      </div>
      {p.description && <p class="tiny muted">{p.description}</p>}
      <a class="btn wa block sm" href={`/go/p/${p.id}`} rel="nofollow">Order on WhatsApp</a>
      <a class="tiny muted center" style="display:block;margin-top:8px" href={`/b/${slug}?product=${p.id}#enquiry`}>or send an enquiry</a>
    </div>
  );
}

pub.get("/b/:slug", async (c) => {
  const db = c.env.DB;
  const b = await loadBusiness(db, c.req.param("slug"));
  if (!b) return c.notFound();
  const [types, products, extras, productCount] = await Promise.all([
    db.prepare(`SELECT type FROM business_types WHERE business_id = ?`).bind(b.id).all<{ type: string }>(),
    db.prepare(`SELECT id,name,category,weight,purity,price,description,image_id FROM products WHERE business_id = ? AND active = 1 ORDER BY position, id LIMIT 6`).bind(b.id).all<Product>(),
    db.prepare(`SELECT id,kind,title,body,image_id FROM extras WHERE business_id = ? ORDER BY kind, position, id`).bind(b.id).all<Extra>(),
    db.prepare(`SELECT count(*) AS n FROM products WHERE business_id = ? AND active = 1`).bind(b.id).first<{ n: number }>(),
  ]);
  c.executionCtx.waitUntil(db.prepare(`UPDATE businesses SET views = views + 1 WHERE id = ?`).bind(b.id).run());
  const premium = isPremium(b);
  const claimed = !!b.owner_id;
  const viewer = c.get("user");
  const pc = await db.prepare(`SELECT (mobile IS NOT NULL) AS m, (tel IS NOT NULL) AS t, (email IS NOT NULL) AS e FROM private_contacts WHERE business_id = ?`).bind(b.id).first<{ m: number; t: number; e: number }>();
  const paid = pc ? await isPaidMember(db, viewer) : false;
  const revealed = pc && paid && viewer ? await hasReveal(db, viewer.id, b.id) : false;
  const usedToday = pc && paid && viewer ? await revealsToday(db, viewer.id) : 0;
  const cerr = c.req.query("cerr");
  const rev = b.owner_id ? await loadReviews(db, b.id) : null;
  const me = c.get("user");
  const saved = me ? await isSaved(db, me.id, b.id) : false;
  const verified = claimed ? !!(await db.prepare(`SELECT 1 FROM claims WHERE business_id = ? AND user_id = ? AND status = 'approved' LIMIT 1`).bind(b.id, b.owner_id).first()) : false;
  const similar = b.city_slug ? (await db.prepare(`SELECT ${CARD_COLS} FROM businesses b WHERE b.city_slug = ? AND b.id <> ? ${ORDER} LIMIT 6`).bind(b.city_slug, b.id).all<Card>()).results : [];
  const wa = claimed ? waNumber(b.whatsapp || b.phone) : null;
  const web = claimed ? safeUrl(b.website) : null;
  const gallery = extras.results.filter((e) => e.kind === "gallery" && e.image_id);
  const offers = extras.results.filter((e) => e.kind === "offer");
  const faqs = extras.results.filter((e) => e.kind === "faq");
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${b.address || b.city || ""}`)}`;
  const url = `${siteUrl(c)}/b/${b.slug}`;
  const sent = c.req.query("sent") === "1";
  const err = c.req.query("err");
  const productId = c.req.query("product");

  return page(c, {
    title: `${b.name}${b.city ? ` — ${b.city}` : ""}`,
    desc: (b.about || `${b.name} is a jewellery business${b.city ? ` in ${b.city}` : ""}. View details, catalogue and contact options.`).slice(0, 160),
    path: `/b/${b.slug}`,
    jsonld: { "@context": "https://schema.org", "@type": "JewelryStore", name: b.name, url,
      address: { "@type": "PostalAddress", addressLocality: b.city ?? undefined, streetAddress: claimed ? b.address ?? undefined : undefined, addressCountry: "IN" },
      ...(rev && rev.count > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: Number(rev.avg.toFixed(1)), reviewCount: rev.count } } : {}),
      ...(b.logo_image ? { image: `${siteUrl(c)}/img/${b.logo_image}` } : {}) },
  }, (
    <main class="wrap" style="padding-top:26px">
      <div class="card" style={premium ? "border-color:rgba(233,196,106,.6)" : undefined}>
        <div class="row" style="align-items:flex-start;gap:18px">
          <div class="biz" style="width:96px;flex:none"><div class="top" style="margin:0;height:96px;border-radius:20px">{b.logo_image ? <img src={`/img/${b.logo_image}`} alt="" /> : initials(b.name)}</div></div>
          <div style="flex:1;min-width:220px">
            <h1 style="font-size:28px">{b.name}</h1>
            <div class="muted small" style="margin-top:4px">📍 {b.city || "India"}{b.state && b.state !== b.city ? `, ${b.state}` : ""}{b.gst ? <> · GSTIN <span style="font-family:monospace">{b.gst}</span></> : null}</div>
            <div class="row" style="margin-top:10px;gap:6px">
              {rev && rev.count > 0 && <a class="badge soft" href="#reviews">★ {rev.avg.toFixed(1)} ({rev.count})</a>}
              {premium && <span class="badge gold">★ Featured member</span>}
              {claimed ? <span class="badge ok">{verified ? "✓ Verified owner" : "✓ Claimed by owner"}</span> : <span class="badge">Unclaimed listing</span>}
              {b.gst_status && <span class="badge soft">GST {b.gst_status}</span>}
              {b.gst_since && <span class="badge">Since {b.gst_since.slice(0, 4)}</span>}
              {types.results.map((t) => <a class="badge soft" href={`/category/${t.type}`}>{findType(t.type)?.label ?? t.type}</a>)}
            </div>
          </div>
        </div>
        <div class="row" style="margin-top:16px">
          {wa && <a class="btn wa sm" href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi ${b.name}, I found you on ${c.env.BRAND_NAME}.`)}`} rel="nofollow noopener" target="_blank">WhatsApp</a>}
          {claimed && b.phone && <a class="btn ghost sm" href={`tel:${b.phone.replace(/[^\d+]/g, "")}`}>Call</a>}
          {web && <a class="btn ghost sm" href={web} rel="nofollow noopener" target="_blank">Website</a>}
          <a class="btn ghost sm" href={maps} rel="nofollow noopener" target="_blank">Map</a>
          <a class="btn ghost sm" href={`/bio/${b.slug}`}>Bio link</a>
          <a class="btn ghost sm" href={`/b/${b.slug}/qr.svg`} target="_blank">QR code</a>
          <a class="btn ghost sm" href={`https://wa.me/?text=${encodeURIComponent(`${b.name}${b.city ? `, ${b.city}` : ""}\n${url}`)}`} target="_blank" rel="noopener">Share</a>
          <form method="post" action={`/b/${b.slug}/save`} style="display:inline"><button class="btn ghost sm" type="submit">{saved ? "★ Saved" : "☆ Save"}</button></form>
          <button class="btn ghost sm" data-copy={url}>Copy link</button>
        </div>
      </div>

      <div class="layout listing" style="margin-top:20px">
        <div class="stack">
          {b.about && <div class="card"><h2 style="font-size:18px">About</h2><p class="small" style="white-space:pre-line">{b.about}</p></div>}

          {offers.length > 0 && (
            <div class="card" style="border-color:rgba(233,196,106,.45)"><h2 style="font-size:18px">Offers</h2>
              {offers.map((o) => <div style="margin-top:10px"><b>🏷️ {o.title}</b>{o.body && <p class="small muted" style="margin:2px 0;white-space:pre-line">{o.body}</p>}</div>)}
            </div>
          )}

          {products.results.length > 0 && (
            <div>
              <div class="head"><h2 style="font-size:20px">Catalogue</h2>{(productCount?.n ?? 0) > 6 && <a class="gold small" href={`/b/${b.slug}/catalogue`}>View all {productCount!.n} products →</a>}</div>
              <div class="grid g3">{products.results.map((p) => <ProductCard p={p} slug={b.slug} />)}</div>
            </div>
          )}

          {gallery.length > 0 && (
            <div><h2 style="font-size:20px;margin-bottom:12px">Gallery</h2>
              <div class="grid g3">{gallery.map((g) => <figure style="margin:0"><img src={`/img/${g.image_id}`} alt={g.title || `${b.name} photo`} loading="lazy" style="border-radius:14px;aspect-ratio:1;object-fit:cover;width:100%" />{g.title && <figcaption class="tiny muted">{g.title}</figcaption>}</figure>)}</div>
            </div>
          )}

          {rev && <ReviewsBlock c={c} slug={b.slug} ownerId={b.owner_id!} data={rev} />}

          {faqs.length > 0 && (
            <div class="card"><h2 style="font-size:18px;margin-bottom:8px">FAQs</h2>
              {faqs.map((q) => <details style="padding:8px 0;border-top:1px solid var(--border)"><summary>{q.title}</summary><p class="small muted" style="white-space:pre-line">{q.body}</p></details>)}
            </div>
          )}

          {!claimed && (
            <div class="band" style="padding:26px">
              <h2 style="font-size:22px">Is this your business?</h2>
              <p class="muted small">Claim it free to add your catalogue, contact buttons, photos and bio link.</p>
              <a class="btn" href={`/dashboard/claim?b=${b.slug}`}>Claim this listing</a>
            </div>
          )}
        </div>

        <aside class="stack">
          <Ad c={c} place="listing" />
          {pc && (
            <div class="card" id="contact" style="border-color:rgba(233,196,106,.45)">
              <h2 style="font-size:18px;margin-bottom:8px">Contact details</h2>
              {cerr && <Flash err={cerr} />}
              {revealed ? (
                <div class="stack small">
                  {pc.m ? <div><b>Mobile</b><br /><img src={`/b/${b.slug}/contact.svg?f=mobile`} alt="Mobile number" draggable={false} style="max-width:100%;height:auto" /></div> : null}
                  {pc.t ? <div><b>Landline</b><br /><img src={`/b/${b.slug}/contact.svg?f=tel`} alt="Landline number" draggable={false} style="max-width:100%;height:auto" /></div> : null}
                  {pc.e ? <div><b>Email</b><br /><img src={`/b/${b.slug}/contact.svg?f=email`} alt="Email address" draggable={false} style="max-width:100%;height:auto" /></div> : null}
                  {(pc.m || pc.t) ? <a class="btn sm" href={`/b/${b.slug}/call`} rel="nofollow">Call</a> : null}
                  <p class="tiny muted">For your own business use. Each view is recorded against your account. {usedToday} of {DAILY_REVEALS} used today.</p>
                </div>
              ) : (
                <div>
                  <p class="small muted" style="margin:0 0 10px">{[pc.m ? "Mobile" : "", pc.t ? "Landline" : "", pc.e ? "Email" : ""].filter(Boolean).join(" · ")} available for paid members.</p>
                  {paid ? (
                    <form method="post" action={`/b/${b.slug}/contact`}><button class="btn block" type="submit">Show contact</button><p class="tiny muted center">{usedToday} of {DAILY_REVEALS} used today.</p></form>
                  ) : (
                    <a class="btn block" href={viewer ? "/pricing?need=contact" : `/login?next=${encodeURIComponent(`/b/${b.slug}`)}`}>🔒 {viewer ? "Upgrade to view" : "Sign in to view"}</a>
                  )}
                </div>
              )}
            </div>
          )}
          {!claimed && b.source === "jt2023" && b.address && (
            <div class="card small"><b>Address</b><p class="muted" style="margin:2px 0;white-space:pre-line">{b.address}</p></div>
          )}
          <a class="tiny muted" href={`/b/${b.slug}/report`} rel="nofollow">{claimed ? "Not the real owner? Report this listing" : "Report or request removal"}</a>
          {claimed && (b.address || b.hours) && (
            <div class="card small">
              {b.address && <><b>Address</b><p class="muted" style="margin:2px 0 10px;white-space:pre-line">{b.address}</p></>}
              {b.hours && <><b>Hours</b><p class="muted" style="margin:2px 0;white-space:pre-line">{b.hours}</p></>}
            </div>
          )}
          <div class="card" id="enquiry">
            <h2 style="font-size:18px;margin-bottom:10px">Send an enquiry</h2>
            {sent && <Flash ok="Thanks! Your enquiry has been sent." />}
            {err && <Flash err={err} />}
            {claimed ? (
              <form method="post" action={`/b/${b.slug}/enquiry`}>
                {productId && /^\d+$/.test(productId) && <input type="hidden" name="product_id" value={productId} />}
                <Field label="Your name" name="name" required max={80} />
                <Field label="Mobile number" name="phone" type="tel" required max={16} />
                <Field label="What are you looking for?" name="message" area max={1000} />
                <input name="website" tabindex={-1} autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true" />
                <button class="btn block" type="submit">Send enquiry</button>
                <p class="tiny muted center">Your number is shared only with this business.</p>
              </form>
            ) : <p class="small muted">Enquiries open once the owner claims this listing.</p>}
          </div>
        </aside>
      </div>
      {similar.length > 0 && (
        <div style="margin-top:22px"><h2 style="font-size:20px;margin-bottom:12px">More jewellers in {b.city}</h2>
          <div class="grid g3">{similar.map((x) => <BizCard b={x} />)}</div>
          {b.city_slug && <p class="small" style="margin-top:10px"><a class="gold" href={`/city/${b.city_slug}`}>All businesses in {b.city} →</a></p>}
        </div>
      )}
    </main>
  ));
});

pub.post("/b/:slug/enquiry", async (c) => {
  const b = await loadBusiness(c.env.DB, c.req.param("slug"));
  if (!b || !b.owner_id) return c.notFound();
  const back = (q: string) => c.redirect(`/b/${b.slug}?${q}#enquiry`, 303);
  const f = await c.req.parseBody();
  if (typeof f.website === "string" && f.website) return back("sent=1"); // honeypot
  const name = String(f.name ?? "").trim();
  const phone = String(f.phone ?? "").replace(/\D/g, "");
  const message = String(f.message ?? "").trim().slice(0, 1000);
  if (name.length < 2 || name.length > 80) return back(`err=${encodeURIComponent("Please enter your name")}`);
  if (phone.length < 10 || phone.length > 13) return back(`err=${encodeURIComponent("Please enter a valid mobile number")}`);
  if (!(await allow(c.env, `enq:ip:${clientIp(c)}`, 5, 3600)) || !(await allow(c.env, `enq:b:${b.id}`, 30, 3600))) {
    return back(`err=${encodeURIComponent("Too many enquiries. Please try again later.")}`);
  }
  const pid = /^\d+$/.test(String(f.product_id ?? "")) ? Number(f.product_id) : null;
  await c.env.DB.prepare(`INSERT INTO enquiries (business_id, product_id, name, phone, message, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(b.id, pid, name, phone, message || null, now()).run();
  if (b.owner_id) {
    const reqUrl = c.req.url, brand = c.env.BRAND_NAME;
    c.executionCtx.waitUntil((async () => {
      const owner = await c.env.DB.prepare(`SELECT email FROM users WHERE id = ?`).bind(b.owner_id).first<{ email: string }>();
      await sendMail(c.env, reqUrl, owner?.email, `New enquiry for ${b.name}`, `You have a new enquiry on ${brand}.\n\nFrom: ${name}\nMobile: ${phone}\n${message ? `Message: ${message}\n` : ""}\nOpen your enquiries: ${siteUrl(c)}/dashboard/enquiries`);
    })());
  }
  return back("sent=1");
});

pub.get("/b/:slug/catalogue", async (c) => {
  const b = await loadBusiness(c.env.DB, c.req.param("slug"));
  if (!b) return c.notFound();
  const cat = (c.req.query("cat") ?? "").slice(0, 60);
  const all = await c.env.DB.prepare(`SELECT id,name,category,weight,purity,price,description,image_id FROM products WHERE business_id = ? AND active = 1 ORDER BY position, id LIMIT 300`).bind(b.id).all<Product>();
  const cats = [...new Set(all.results.map((p) => p.category).filter(Boolean))] as string[];
  const shown = cat ? all.results.filter((p) => p.category === cat) : all.results;
  return page(c, { title: `${b.name} — catalogue`, desc: `Product catalogue of ${b.name}${b.city ? `, ${b.city}` : ""}. Order on WhatsApp.`, path: `/b/${b.slug}/catalogue` }, (
    <main class="wrap" style="padding-top:26px">
      <a class="small muted" href={`/b/${b.slug}`}>← {b.name}</a>
      <h1 style="font-size:28px;margin-top:8px">Catalogue</h1>
      {cats.length > 0 && (
        <div class="row" style="margin:14px 0">
          <a class={`badge ${cat ? "" : "gold"}`} href={`/b/${b.slug}/catalogue`}>All</a>
          {cats.map((x) => <a class={`badge ${cat === x ? "gold" : ""}`} href={`/b/${b.slug}/catalogue?cat=${encodeURIComponent(x)}`}>{x}</a>)}
        </div>
      )}
      {shown.length === 0 ? <div class="card muted center">No products yet.</div> : <div class="grid g4">{shown.map((p) => <ProductCard p={p} slug={b.slug} />)}</div>}
    </main>
  ));
});

// ───────────────────────── Bio link ─────────────────────────
pub.get("/bio/:slug", async (c) => {
  const b = await loadBusiness(c.env.DB, c.req.param("slug"));
  if (!b) return c.notFound();
  const [links, pc] = await Promise.all([
    c.env.DB.prepare(`SELECT id, title, url FROM links WHERE business_id = ? AND active = 1 ORDER BY position, id`).bind(b.id).all<LinkRow>(),
    c.env.DB.prepare(`SELECT count(*) AS n FROM products WHERE business_id = ? AND active = 1`).bind(b.id).first<{ n: number }>(),
  ]);
  const t = THEMES[b.theme] ?? THEMES.gold;
  const claimed = !!b.owner_id;
  const wa = claimed ? waNumber(b.whatsapp || b.phone) : null;
  const socials = claimed ? ([["Instagram", safeUrl(b.instagram)], ["Facebook", safeUrl(b.facebook)], ["YouTube", safeUrl(b.youtube)], ["Website", safeUrl(b.website)]] as const).filter((s) => s[1]) : [];
  const btn = `border-color:${t.accent}55;background:${t.accent}14;color:${t.text}`;
  return page(c, { title: `${b.name} — links`, desc: `All links for ${b.name}${b.city ? `, ${b.city}` : ""}.`, path: `/bio/${b.slug}`, bare: true, bodyStyle: `background:${t.bg};color:${t.text}` }, (
    <main class="bio">
      <div class="av" style={`background:${t.accent}22;color:${t.accent}`}>{b.logo_image ? <img src={`/img/${b.logo_image}`} alt="" /> : initials(b.name)}</div>
      <h1 style="font-size:24px">{b.name}</h1>
      <div class="small" style="opacity:.75;margin-top:4px">📍 {b.city || "India"}{isPremium(b) ? " · ★ Featured member" : ""}</div>
      {b.about && <p class="small" style="opacity:.85">{b.about.slice(0, 160)}</p>}
      {wa && <a class="lnk" style={`background:${t.accent};color:${t.bg};border-color:${t.accent}`} href={`https://wa.me/${wa}`} rel="nofollow noopener">💬 Chat on WhatsApp</a>}
      {(pc?.n ?? 0) > 0 && <a class="lnk" style={btn} href={`/b/${b.slug}/catalogue`}>💍 View catalogue ({pc!.n})</a>}
      {links.results.map((l) => <a class="lnk" style={btn} href={`/go/l/${l.id}`} rel="nofollow">{l.title}</a>)}
      {claimed && b.phone && <a class="lnk" style={btn} href={`tel:${b.phone.replace(/[^\d+]/g, "")}`}>📞 Call</a>}
      <a class="lnk" style={btn} href={`/b/${b.slug}/vcard.vcf`}>👤 Save contact</a>
      <a class="lnk" style={btn} href={`/b/${b.slug}`}>🏪 Full business profile</a>
      {socials.length > 0 && <div class="row" style="justify-content:center;margin-top:18px">{socials.map(([label, u]) => <a class="badge" style={`border-color:${t.accent}66;color:${t.accent}`} href={u!} rel="nofollow noopener" target="_blank">{label}</a>)}</div>}
      <img src={`/b/${b.slug}/qr.svg`} alt="QR code" width="140" height="140" style="margin:26px auto 0;border-radius:12px" />
      {!isPremium(b) && <p class="tiny" style="opacity:.6;margin-top:18px">Powered by <a href="/" style="text-decoration:underline">{c.env.BRAND_NAME}</a></p>}
    </main>
  ));
});

pub.get("/b/:slug/qr.svg", async (c) => {
  const b = await loadBusiness(c.env.DB, c.req.param("slug"));
  if (!b) return c.notFound();
  const svg = new QRCode({ content: `${siteUrl(c)}/bio/${b.slug}`, padding: 3, width: 320, height: 320, color: "#111111", background: "#ffffff", ecl: "M", join: true }).svg();
  return c.body(svg, 200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" });
});

pub.get("/b/:slug/vcard.vcf", async (c) => {
  const b = await loadBusiness(c.env.DB, c.req.param("slug"));
  if (!b) return c.notFound();
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\r?\n/g, "\\n");
  const claimed = !!b.owner_id;
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${esc(b.name)}`, `ORG:${esc(b.name)}`,
    claimed && b.phone ? `TEL;TYPE=WORK,VOICE:${b.phone.replace(/[^\d+]/g, "")}` : "",
    claimed && b.email ? `EMAIL:${esc(b.email)}` : "",
    b.city ? `ADR;TYPE=WORK:;;${esc(claimed && b.address ? b.address : "")};${esc(b.city)};;;India` : "",
    `URL:${siteUrl(c)}/bio/${b.slug}`, "END:VCARD"].filter(Boolean);
  return c.body(lines.join("\r\n"), 200, { "content-type": "text/vcard; charset=utf-8", "content-disposition": `attachment; filename="${b.slug}.vcf"` });
});

// ───────────────────────── Click tracking ─────────────────────────
pub.get("/go/l/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const l = Number.isInteger(id) ? await c.env.DB.prepare(`SELECT url FROM links WHERE id = ? AND active = 1`).bind(id).first<{ url: string }>() : null;
  const u = safeUrl(l?.url);
  if (!u) return c.notFound();
  c.executionCtx.waitUntil(c.env.DB.prepare(`UPDATE links SET clicks = clicks + 1 WHERE id = ?`).bind(id).run());
  return c.redirect(u, 302);
});

pub.get("/go/p/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const r = Number.isInteger(id) ? await c.env.DB.prepare(
    `SELECT p.name, p.weight, b.slug, b.name AS bname, b.whatsapp, b.phone, b.owner_id FROM products p JOIN businesses b ON b.id = p.business_id WHERE p.id = ? AND p.active = 1`,
  ).bind(id).first<{ name: string; weight: string | null; slug: string; bname: string; whatsapp: string | null; phone: string | null; owner_id: number | null }>() : null;
  if (!r) return c.notFound();
  c.executionCtx.waitUntil(c.env.DB.prepare(`UPDATE products SET clicks = clicks + 1 WHERE id = ?`).bind(id).run());
  const wa = r.owner_id ? waNumber(r.whatsapp || r.phone) : null;
  if (!wa) return c.redirect(`/b/${r.slug}?product=${id}#enquiry`, 302);
  const msg = `Hi ${r.bname}, I'm interested in "${r.name}"${r.weight ? ` (${r.weight})` : ""}. Please share details.\n${siteUrl(c)}/b/${r.slug}/catalogue`;
  return c.redirect(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, 302);
});

// ───────────────────────── Images ─────────────────────────
pub.get("/img/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.notFound();
  const r = await c.env.DB.prepare(`SELECT mime, data FROM images WHERE id = ?`).bind(id).first<{ mime: string; data: ArrayBuffer | number[] }>();
  if (!r) return c.notFound();
  const bytes = r.data instanceof ArrayBuffer ? new Uint8Array(r.data) : new Uint8Array(r.data);
  return c.body(bytes, 200, { "content-type": r.mime, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" });
});

// ───────────────────────── Pricing & static ─────────────────────────
pub.get("/pricing", (c) => page(c, { title: "Membership plans", desc: "Free and Premium membership for jewellery businesses: directory listing, digital catalogue, bio link and enquiries.", path: "/pricing" }, (
  <main class="wrap narrow" style="padding-top:36px;max-width:860px">
    <div class="center"><div class="eyebrow">Membership</div><h1 style="font-size:34px;margin:8px 0">Start free. Upgrade when it pays.</h1></div>
    {c.req.query("need") === "contact" && <Flash err="Mobile numbers and emails of trade listings are a Premium benefit. Upgrade below to open up to 30 contacts a day." />}
    <div class="grid g2" style="margin-top:24px">
      <div class="card"><h2 style="font-size:20px">Free</h2><div class="stat"><b>₹0</b></div>
        <ul class="small muted"><li>Claimed listing with contact buttons</li><li>Catalogue: {PLAN_LIMITS.free.products} products</li><li>Bio link with {PLAN_LIMITS.free.links} links + QR code</li><li>{PLAN_LIMITS.free.gallery} gallery photos, {PLAN_LIMITS.free.faqs} FAQs</li><li>Enquiry inbox with an email alert for every enquiry</li><li>See buyers' contacts on buy requirements</li><li>Free calculators and the live rate widget for your website</li></ul>
        <a class="btn ghost block" href="/signup">Get started</a></div>
      <div class="card" style="border-color:rgba(233,196,106,.6)"><h2 style="font-size:20px">Premium <span class="badge gold">★ Featured</span></h2>
        <div class="stat"><b>₹{PLANS.premium_monthly.amount.toLocaleString("en-IN")}<span class="small muted"> / month</span></b></div>
        <div class="small muted">or ₹{PLANS.premium_yearly.amount.toLocaleString("en-IN")} / year</div>
        <ul class="small muted"><li>Featured badge and top placement in search, city and category pages</li><li>Catalogue: {PLAN_LIMITS.premium.products} products</li><li>Bio link with {PLAN_LIMITS.premium.links} links, no "Powered by"</li><li>{PLAN_LIMITS.premium.gallery} gallery photos, {PLAN_LIMITS.premium.offers} offers, {PLAN_LIMITS.premium.faqs} FAQs</li><li>Shown on the homepage</li><li>Mobile numbers and emails of 20,000+ trade listings: open up to 30 a day</li><li>Everything in Free</li></ul>
        <a class="btn block" href="/dashboard/membership">Upgrade</a></div>
    </div>
    <div class="card" style="margin-top:16px"><h2 style="font-size:18px;margin-bottom:6px">Common questions</h2>
      <details style="padding:8px 0;border-top:1px solid var(--border)"><summary>How do I get my listing?</summary><p class="small muted">Sign up, search for your business and claim it. If we have an email on record you can verify instantly with a code; otherwise upload your GST certificate and we approve it. Not listed yet? Add it as a new business.</p></details>
      <details style="padding:8px 0;border-top:1px solid var(--border)"><summary>Who can see my phone number?</summary><p class="small muted">Once you claim your listing, the contact buttons you add are public so buyers can reach you. Numbers that came from trade directories are shown only to Premium members, one at a time.</p></details>
      <details style="padding:8px 0;border-top:1px solid var(--border)"><summary>How do I pay for Premium?</summary><p class="small muted">Choose a plan from your dashboard. Your request reaches our team and Premium is switched on as soon as the payment is confirmed.</p></details>
      <details style="padding:8px 0;border-top:1px solid var(--border)"><summary>Can I advertise on the site?</summary><p class="small muted">Yes. Banner and sponsor slots are available on the home page, directory pages and business pages. Write to us from your dashboard or reply to any of our emails.</p></details>
    </div>
  </main>
)));

// ───────────────────────── SEO files ─────────────────────────
pub.get("/robots.txt", (c) => c.text(`User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /admin\nDisallow: /go/\nDisallow: /*/contact\nDisallow: /*/call\n\nSitemap: ${siteUrl(c)}/sitemap.xml\n`));

const SM_CHUNK = 5000;
pub.get("/sitemap.xml", async (c) => {
  const n = (await c.env.DB.prepare(`SELECT count(*) AS n FROM businesses`).first<{ n: number }>())?.n ?? 0;
  const base = siteUrl(c);
  const parts = ["pages", ...Array.from({ length: Math.ceil(n / SM_CHUNK) }, (_, i) => `b-${i + 1}`)];
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${parts.map((p) => `<sitemap><loc>${base}/sitemap/${p}.xml</loc></sitemap>`).join("\n")}\n</sitemapindex>`, 200, { "content-type": "application/xml" });
});
pub.get("/sitemap/:file", async (c) => {
  const file = c.req.param("file");
  const base = siteUrl(c);
  const xml = (urls: string[]) => c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${base}${u}</loc></url>`).join("\n")}\n</urlset>`, 200, { "content-type": "application/xml", "cache-control": "public, max-age=3600" });
  if (file === "pages.xml") return xml(["/", "/directory", "/cities", "/pricing", "/rates", "/tools", "/states", "/categories", "/requirements", "/news", "/events", "/about", "/advertise", "/guides", ...["bis-hallmark-huid", "gst-on-gold-jewellery", "how-gold-jewellery-price-is-calculated", "995-vs-999-gold", "gold-weight-units"].map((g) => `/guides/${g}`), ...CITIES.flatMap((ct) => ["manufacturer", "wholesaler", "retailer", "bullion", "diamonds", "silver", "chains", "hallmarking", "refiner"].map((t) => `/city/${ct.slug}/${t}`)), ...TOOLS.map((t) => `/tools/${t.slug}`), ...STATES.slice(0, 22).map((x) => `/state/${x.slug}`), ...CITIES.map((x) => `/city/${x.slug}`), ...TRADE_TYPES.map((t) => `/category/${t.slug}`)]);
  const m = /^b-(\d{1,3})\.xml$/.exec(file);
  if (!m) return c.notFound();
  const i = parseInt(m[1]!, 10);
  if (i < 1) return c.notFound();
  const rows = await c.env.DB.prepare(`SELECT slug FROM businesses ORDER BY id LIMIT ? OFFSET ?`).bind(SM_CHUNK, (i - 1) * SM_CHUNK).all<{ slug: string }>();
  return xml(rows.results.map((r) => `/b/${r.slug}`));
});
