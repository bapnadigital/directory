/** @jsxImportSource hono/jsx */
import type { Context } from "hono";
import type { Child } from "hono/jsx";
import type { AppEnv } from "./auth";
import { type Business, isPremium } from "./db";
import { findType, initials } from "./content";

export function siteUrl(c: Context<AppEnv>): string {
  return (c.env.SITE_URL || new URL(c.req.url).origin).replace(/\/$/, "");
}

type PageOpts = {
  title: string;
  desc?: string;
  path?: string;
  noindex?: boolean;
  jsonld?: unknown;
  bare?: boolean; // no header/footer (bio pages)
  bodyStyle?: string;
};

export function page(c: Context<AppEnv>, o: PageOpts, body: Child) {
  const brand = c.env.BRAND_NAME || "Directory";
  const user = c.get("user");
  const canonical = o.path ? `${siteUrl(c)}${o.path}` : undefined;
  const fullTitle = o.title.includes(brand) ? o.title : `${o.title} | ${brand}`;
  return c.html(
    <html lang="en-IN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{fullTitle}</title>
        {o.desc && <meta name="description" content={o.desc} />}
        {o.noindex && <meta name="robots" content="noindex" />}
        {canonical && <link rel="canonical" href={canonical} />}
        <meta property="og:title" content={fullTitle} />
        {o.desc && <meta property="og:description" content={o.desc} />}
        {canonical && <meta property="og:url" content={canonical} />}
        <meta name="theme-color" content="#0b1f44" />
        <meta property="og:image" content={`${siteUrl(c)}/og.png`} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={brand} />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap" />
        <link rel="stylesheet" href="/style.css?v=7" />
        {o.jsonld != null && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(o.jsonld).replace(/</g, "\\u003c") }} />}
      </head>
      <body style={o.bodyStyle}>
        {!o.bare && (
          <header class="site">
            <div class="wrap">
              <a href="/" class="logo"><i>◆</i> {brand}</a>
              <form class="hsearch" action="/directory" method="get"><input name="q" placeholder="Search jewellers, bullion dealers, cities" aria-label="Search" /></form>
              <nav class="main">
                <a href="/directory">Directory</a>
                <a href="/rates">Rates</a>
                <a href="/tools" class="hide-sm">Tools</a>
                <a href="/requirements" class="hide-sm">Requirements</a>
                <a href="/cities" class="hide-sm">Cities</a>
                <a href="/pricing" class="hide-sm">Membership</a>
                {user ? <a href="/saved" class="small only-wide" title="Saved listings">★ Saved</a> : null}
                {user ? <a href="/dashboard" class="btn sm">Dashboard</a> : <a href="/login" class="btn sm">Sign in</a>}
              </nav>
            </div>
          </header>
        )}
        {!o.bare && (
          <nav class="subnav"><a href="/directory">Directory</a><a href="/rates">Gold rates</a><a href="/tools">Tools</a><a href="/requirements">Buy requirements</a><a href="/news">News</a><a href="/events">Events</a><a href="/states">States</a><a href="/cities">Cities</a><a href="/categories">Categories</a><a href="/pricing">Membership</a></nav>
        )}
        {body}
        {!o.bare && (
          <footer class="site">
            <div class="wrap">
              <span>© {new Date().getFullYear()} {brand}</span>
              <span class="row">
                <a href="/directory">Directory</a><a href="/rates">Gold rates</a><a href="/tools">Tools</a><a href="/requirements">Buy requirements</a><a href="/news">News</a><a href="/events">Events</a><a href="/states">States</a><a href="/cities">Cities</a><a href="/pricing">Membership</a>
                <a href="/signup">List your business</a><a href="/advertise">Advertise</a><a href="/about">About</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a>
              </span>
            </div>
          </footer>
        )}
        <script src="/app.js?v=5" defer></script>
        <script src="/tools.js?v=4" defer></script>
      </body>
    </html>,
  );
}

export type Card = Pick<Business, "id" | "slug" | "name" | "city" | "owner_id" | "plan" | "plan_expires" | "logo_image" | "gst"> & { types?: string | null };

export function BizCard({ b }: { b: Card }) {
  const premium = isPremium(b);
  const types = (b.types ?? "").split(",").filter(Boolean).slice(0, 2);
  return (
    <a class="card biz" href={`/b/${b.slug}`} style={premium ? "border-color:rgba(233,196,106,.6)" : undefined}>
      <div class="top">{b.logo_image ? <img src={`/img/${b.logo_image}`} alt="" loading="lazy" /> : initials(b.name)}</div>
      <h3>{b.name}</h3>
      <div class="small muted">📍 {b.city || "India"}</div>
      <div class="row" style="margin-top:10px;gap:6px">
        {premium && <span class="badge gold">★ Featured</span>}
        {b.owner_id ? <span class="badge ok">✓ Claimed</span> : b.gst ? <span class="badge soft">GST listed</span> : null}
        {types.map((t) => <span class="badge">{findType(t)?.label ?? t}</span>)}
      </div>
    </a>
  );
}

export function Flash({ ok, err }: { ok?: string | null; err?: string | null }) {
  return (
    <>
      {ok && <div class="flash ok">{ok}</div>}
      {err && <div class="flash err">{err}</div>}
    </>
  );
}

export function Field(p: { label: string; name: string; value?: string | null; type?: string; placeholder?: string; required?: boolean; max?: number; area?: boolean; hint?: string }) {
  return (
    <label>
      {p.label}
      {p.area
        ? <textarea name={p.name} rows={4} maxlength={p.max ?? 1000} placeholder={p.placeholder} required={p.required}>{p.value ?? ""}</textarea>
        : <input name={p.name} type={p.type ?? "text"} value={p.value ?? ""} maxlength={p.max ?? 200} placeholder={p.placeholder} required={p.required} />}
      {p.hint && <span class="tiny muted">{p.hint}</span>}
    </label>
  );
}
