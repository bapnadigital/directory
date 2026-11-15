/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../auth";
import { now } from "../db";
import { safeUrl } from "../content";

// Banner ads and sponsor logos, managed from the admin panel.
export const PLACEMENTS = {
  home: "Home page (below search)",
  directory: "Directory, city and category pages (above results)",
  listing: "Business pages (side column)",
  showcase: "Home page showcase grid (large banners, two per row)",
  sponsor: "Sponsor strip on the home page (logo)",
} as const;
export type Placement = keyof typeof PLACEMENTS;
type Banner = { id: number; title: string; image_id: number | null; url: string };

// House placements for the Kalptaru group. Shown, labelled "Partner", when no paid banner is
// running in a slot, and occasionally alongside paid banners.
const UTM = "utm_source=jewellerysahihai&utm_medium=partner";
const HOUSE: Record<Exclude<Placement, "sponsor" | "showcase">, { line: string; cta: string; url: string }[]> = {
  home: [
    { line: "Buying gold or silver bars today? See the live desk rates.", cta: "Shree Kalptaru Bullion", url: `https://shreekalptarubullion.com/?${UTM}&utm_campaign=home` },
    { line: "Where are gold and silver headed? Read today's outlook.", cta: "Shree Kalptaru outlook", url: `https://shreekalptaru.com/?${UTM}&utm_campaign=home` },
  ],
  directory: [
    { line: "Bullion at live rates: gold 995, 999 and silver 999, Mumbai delivery.", cta: "Shree Kalptaru Bullion", url: `https://shreekalptarubullion.com/?${UTM}&utm_campaign=directory` },
    { line: "Daily gold and silver outlook for the trade.", cta: "Shree Kalptaru outlook", url: `https://shreekalptaru.com/?${UTM}&utm_campaign=directory` },
  ],
  listing: [
    { line: "Need bullion for your next order?", cta: "Live rates · Shree Kalptaru Bullion", url: `https://shreekalptarubullion.com/?${UTM}&utm_campaign=listing` },
  ],
};
function House({ place }: { place: Exclude<Placement, "sponsor" | "showcase"> }) {
  const list = HOUSE[place], h = list[Math.floor(Math.random() * list.length)];
  return <a class="ad house" href={h.url} rel="noopener" target="_blank"><span class="ad-tag">Partner</span><span class="small muted">{h.line}</span> <b class="gold small">{h.cta} →</b></a>;
}

const live = `active = 1 AND (starts_at IS NULL OR starts_at <= ?2) AND (ends_at IS NULL OR ends_at > ?2)`;

/** One banner for a placement, rotated at random. Renders nothing when there is none. */
export async function Ad({ c, place }: { c: Context<AppEnv>; place: Exclude<Placement, "sponsor" | "showcase"> }) {
  let b: Banner | null = null;
  try { b = await c.env.DB.prepare(`SELECT id, title, image_id, url FROM banners WHERE placement = ?1 AND ${live} ORDER BY random() LIMIT 1`).bind(place, now()).first<Banner>(); } catch { /* table not ready */ }
  if (!b || Math.random() < 0.2) return <House place={place} />;
  c.executionCtx.waitUntil(c.env.DB.prepare(`UPDATE banners SET views = views + 1 WHERE id = ?`).bind(b.id).run());
  return (
    <a class="ad" href={`/go/a/${b.id}`} rel="sponsored nofollow noopener" target="_blank">
      <span class="ad-tag">Sponsored</span>
      {b.image_id ? <img src={`/img/${b.image_id}`} alt={b.title} loading="lazy" /> : <span class="ad-text">{b.title}</span>}
    </a>
  );
}

/** Large banner grid on the home page, two per row. */
export async function Showcase({ c }: { c: Context<AppEnv> }) {
  let rows: Banner[] = [];
  try { rows = (await c.env.DB.prepare(`SELECT id, title, image_id, url FROM banners WHERE placement = ?1 AND image_id IS NOT NULL AND ${live} ORDER BY position, id LIMIT 8`).bind("showcase", now()).all<Banner>()).results; } catch { /* not ready */ }
  if (!rows.length) return <></>;
  return (
    <section class="wrap">
      <div class="center"><div class="eyebrow">Sponsored</div><h2 style="font-size:26px;margin:6px 0 16px">Featured sellers</h2></div>
      <div class="showcase">{rows.map((b) => <a href={`/go/a/${b.id}`} rel="sponsored nofollow noopener" target="_blank" title={b.title}><img src={`/img/${b.image_id}`} alt={b.title} loading="lazy" /></a>)}</div>
    </section>
  );
}

export async function Sponsors({ c }: { c: Context<AppEnv> }) {
  const rows = (await c.env.DB.prepare(`SELECT id, title, image_id, url FROM banners WHERE placement = ?1 AND ${live} ORDER BY position, id LIMIT 12`).bind("sponsor", now()).all<Banner>()).results;
  if (!rows.length) return <></>;
  return (
    <section class="wrap">
      <div class="center"><div class="eyebrow">Our sponsors</div></div>
      <div class="sponsors">
        {rows.map((s) => <a href={`/go/a/${s.id}`} rel="sponsored nofollow noopener" target="_blank" title={s.title}>{s.image_id ? <img src={`/img/${s.image_id}`} alt={s.title} loading="lazy" /> : <b>{s.title}</b>}</a>)}
      </div>
    </section>
  );
}

export const ads = new Hono<AppEnv>();
ads.get("/go/a/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = Number.isInteger(id) ? await c.env.DB.prepare(`SELECT url FROM banners WHERE id = ? AND active = 1`).bind(id).first<{ url: string }>() : null;
  const url = b ? safeUrl(b.url) : null;
  if (!url) return c.redirect("/", 302);
  c.executionCtx.waitUntil(c.env.DB.prepare(`UPDATE banners SET clicks = clicks + 1 WHERE id = ?`).bind(id).run());
  return c.redirect(url, 302);
});
