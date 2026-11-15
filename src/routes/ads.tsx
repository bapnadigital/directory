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
  sponsor: "Sponsor strip on the home page (logo)",
} as const;
export type Placement = keyof typeof PLACEMENTS;
type Banner = { id: number; title: string; image_id: number | null; url: string };

const live = `active = 1 AND (starts_at IS NULL OR starts_at <= ?2) AND (ends_at IS NULL OR ends_at > ?2)`;

/** One banner for a placement, rotated at random. Renders nothing when there is none. */
export async function Ad({ c, place }: { c: Context<AppEnv>; place: Exclude<Placement, "sponsor"> }) {
  const b = await c.env.DB.prepare(`SELECT id, title, image_id, url FROM banners WHERE placement = ?1 AND ${live} ORDER BY random() LIMIT 1`).bind(place, now()).first<Banner>();
  if (!b) return <></>;
  c.executionCtx.waitUntil(c.env.DB.prepare(`UPDATE banners SET views = views + 1 WHERE id = ?`).bind(b.id).run());
  return (
    <a class="ad" href={`/go/a/${b.id}`} rel="sponsored nofollow noopener" target="_blank">
      <span class="ad-tag">Sponsored</span>
      {b.image_id ? <img src={`/img/${b.image_id}`} alt={b.title} loading="lazy" /> : <span class="ad-text">{b.title}</span>}
    </a>
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
