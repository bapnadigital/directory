/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Context } from "hono";
import { type AppEnv, clientIp } from "../auth";
import { TRADE_TYPES, findType, safeUrl } from "../content";
import { allow, now } from "../db";
import { Field, Flash, page } from "../ui";

// Buy requirements board and industry news.
export const market = new Hono<AppEnv>();
type C = Context<AppEnv>;
type Req = { id: number; title: string; category: string | null; details: string | null; qty: string | null; city: string | null; name: string; phone: string; created_at: number; status: string; views: number };
const ago = (t: number) => { const d = Math.floor((Date.now() / 1000 - t) / 86400); return d <= 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`; };
const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export async function LatestRequests({ c }: { c: C }) {
  let rows: Req[] = [];
  try { rows = (await c.env.DB.prepare(`SELECT id, title, category, qty, city, created_at FROM requests WHERE status = 'open' AND created_at > ? ORDER BY created_at DESC LIMIT 4`).bind(now() - 45 * 86400).all<Req>()).results; } catch { /* not ready */ }
  return (
    <section class="wrap">
      <div class="head"><div><div class="eyebrow">Buy requirements</div><h2>Buyers looking for suppliers</h2></div><span class="row"><a class="gold small" href="/requirements">See all →</a><a class="btn sm" href="/requirements/new">Post a requirement</a></span></div>
      {rows.length === 0
        ? <div class="card small muted">No open requirements yet. Looking for a manufacturer, wholesaler or service? <a class="gold" href="/requirements/new">Post what you need</a> and let suppliers contact you.</div>
        : <div class="grid g4">{rows.map((r) => <a class="card" href={`/requirements/${r.id}`}><b>{r.title}</b><div class="tiny muted" style="margin-top:6px">{[findType(r.category)?.label, r.qty, r.city].filter(Boolean).join(" · ")}</div><div class="tiny muted">{ago(r.created_at)}</div></a>)}</div>}
    </section>
  );
}

export async function LatestNews({ c }: { c: C }) {
  let rows: { title: string; url: string; source: string | null; published_at: number }[] = [];
  try { rows = (await c.env.DB.prepare(`SELECT title, url, source, published_at FROM news ORDER BY published_at DESC LIMIT 6`).all<{ title: string; url: string; source: string | null; published_at: number }>()).results; } catch { /* not ready */ }
  if (!rows.length) return <></>;
  return (
    <section class="wrap">
      <div class="head"><div><div class="eyebrow">Industry news</div><h2>Latest from the trade</h2></div><a class="gold small" href="/news">All news →</a></div>
      <div class="grid g2">{rows.map((n) => <a class="card small" href={n.url} target="_blank" rel="nofollow noopener"><b>{n.title}</b><div class="tiny muted" style="margin-top:6px">{n.source ?? "News"} · {ago(n.published_at)}</div></a>)}</div>
    </section>
  );
}

market.get("/news", async (c) => {
  const rows = (await c.env.DB.prepare(`SELECT title, url, source, published_at FROM news ORDER BY published_at DESC LIMIT 120`).all<{ title: string; url: string; source: string | null; published_at: number }>()).results;
  return page(c, { title: "Jewellery industry news — gold, silver, diamonds, hallmarking", desc: "Latest headlines for the Indian jewellery trade: gold and silver prices, exports, hallmarking, diamonds and policy. Updated through the day.", path: "/news" }, (
    <main class="wrap narrow" style="padding-top:26px">
      <div class="eyebrow">Industry news</div>
      <h1 style="font-size:30px;margin:6px 0">Jewellery trade headlines</h1>
      <p class="muted small">Collected automatically through the day. Each headline opens on the publisher's own site.</p>
      {rows.length === 0 ? <div class="card small muted">Headlines will appear here shortly.</div> : (
        <div class="card" style="margin-top:14px">{rows.map((n) => <a style="display:block;padding:11px 0;border-top:1px solid var(--border)" href={n.url} target="_blank" rel="nofollow noopener"><b class="small">{n.title}</b><div class="tiny muted">{n.source ?? "News"} · {ago(n.published_at)}</div></a>)}</div>
      )}
    </main>
  ));
});

market.get("/requirements", async (c) => {
  const cat = findType(c.req.query("category"));
  const rows = (await c.env.DB.prepare(`SELECT id, title, category, qty, city, details, created_at FROM requests WHERE status = 'open' AND created_at > ?1 ${cat ? "AND category = ?2" : ""} ORDER BY created_at DESC LIMIT 100`).bind(...(cat ? [now() - 60 * 86400, cat.slug] : [now() - 60 * 86400])).all<Req>()).results;
  return page(c, { title: "Jewellery buy requirements — buyers looking for suppliers", desc: "Open buy requirements from jewellery buyers across India. Manufacturers, wholesalers and service providers can respond directly.", path: "/requirements", noindex: !!cat }, (
    <main class="wrap" style="padding-top:26px">
      <div class="head"><div><div class="eyebrow">Buy requirements</div><h1 style="font-size:30px;margin-top:6px">Buyers looking for suppliers</h1></div><a class="btn" href="/requirements/new">Post a requirement (free)</a></div>
      <Flash ok={c.req.query("ok")} />
      <div class="row" style="gap:6px;margin-bottom:14px"><a class={`badge ${cat ? "" : "gold"}`} href="/requirements">All</a>{TRADE_TYPES.map((t) => <a class={`badge ${cat?.slug === t.slug ? "gold" : ""}`} href={`/requirements?category=${t.slug}`}>{t.label}</a>)}</div>
      {rows.length === 0 ? <div class="card center muted">No open requirements here yet. Be the first to post one.</div> : (
        <div class="grid g3">{rows.map((r) => <a class="card" href={`/requirements/${r.id}`}><b>{r.title}</b><p class="small muted" style="margin:6px 0">{(r.details ?? "").slice(0, 110)}{(r.details ?? "").length > 110 ? "…" : ""}</p><div class="row" style="gap:6px">{findType(r.category) && <span class="badge soft">{findType(r.category)!.label}</span>}{r.qty && <span class="badge">{r.qty}</span>}{r.city && <span class="badge">📍 {r.city}</span>}<span class="tiny muted">{ago(r.created_at)}</span></div></a>)}</div>
      )}
    </main>
  ));
});

market.get("/requirements/new", (c) => page(c, { title: "Post a buy requirement", desc: "Tell suppliers what you need. Free, takes a minute.", path: "/requirements/new" }, (
  <main class="wrap narrow" style="padding-top:26px">
    <div class="card">
      <h1 style="font-size:24px">Post a buy requirement</h1>
      <p class="small muted">Free. Suppliers with a verified listing can see your contact details and reach you directly.</p>
      <Flash err={c.req.query("err")} />
      <form method="post" action="/requirements/new">
        <Field label="What do you need?" name="title" required max={100} placeholder="e.g. 22K antique temple necklaces, 500 g" />
        <label>Category<select name="category"><option value="">Choose a category</option>{TRADE_TYPES.map((t) => <option value={t.slug}>{t.label}</option>)}</select></label>
        <div class="grid g2"><Field label="Quantity or budget" name="qty" max={60} placeholder="e.g. 500 g / ₹5 lakh / 20 pcs" /><Field label="Your city" name="city" required max={60} /></div>
        <Field label="Details" name="details" area max={1000} placeholder="Purity, design type, delivery date, any other requirement" />
        <div class="grid g2"><Field label="Your name" name="name" required max={80} /><Field label="Mobile number" name="phone" type="tel" required max={16} /></div>
        <input name="website" tabindex={-1} autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true" />
        <button class="btn" type="submit">Post requirement</button>
        <p class="tiny muted">Your number is shown only to signed-in suppliers with a claimed listing, never on the public page.</p>
      </form>
    </div>
  </main>
)));

market.post("/requirements/new", async (c) => {
  const f = await c.req.parseBody();
  const fail = (m: string) => c.redirect(`/requirements/new?err=${encodeURIComponent(m)}`, 303);
  if (s(f.website, 10)) return c.redirect("/requirements?ok=Posted", 303);
  const title = s(f.title, 100), city = s(f.city, 60), name = s(f.name, 80), phone = s(f.phone, 16);
  if (title.length < 8 || !city || !name || phone.replace(/\D/g, "").length < 10) return fail("Please fill in what you need (at least 8 characters), your city, name and a valid mobile number");
  if (/https?:\/\/|www\./i.test(title + s(f.details, 1000))) return fail("Please remove web links from the requirement");
  if (!(await allow(c.env, `rq:${clientIp(c)}`, 3, 86400))) return fail("You can post up to 3 requirements a day");
  const u = c.get("user");
  const r = await c.env.DB.prepare(`INSERT INTO requests (title, category, details, qty, city, name, phone, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(title, findType(s(f.category, 30))?.slug ?? null, s(f.details, 1000) || null, s(f.qty, 60) || null, city, name, phone, u?.id ?? null, now()).run();
  return c.redirect(`/requirements/${r.meta.last_row_id}?ok=${encodeURIComponent("Your requirement is live. Suppliers can now contact you.")}`, 303);
});

market.get("/requirements/:id{[0-9]+}", async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM requests WHERE id = ? AND status IN ('open','closed')`).bind(Number(c.req.param("id"))).first<Req>();
  if (!r) return c.notFound();
  const u = c.get("user");
  const supplier = u ? !!u.is_admin || !!(await c.env.DB.prepare(`SELECT 1 FROM businesses WHERE owner_id = ? LIMIT 1`).bind(u.id).first()) : false;
  let show = false;
  if (supplier && u && r.status === "open") {
    show = !!u.is_admin || (await allow(c.env, `rqv:${u.id}`, 40, 86400));
    if (show) c.executionCtx.waitUntil(c.env.DB.prepare(`UPDATE requests SET views = views + 1 WHERE id = ?`).bind(r.id).run());
  }
  const t = findType(r.category);
  return page(c, { title: r.title, desc: `Buy requirement: ${r.title}${r.city ? ` in ${r.city}` : ""}.`, path: `/requirements/${r.id}`, noindex: now() - r.created_at > 60 * 86400 }, (
    <main class="wrap narrow" style="padding-top:26px">
      <a class="small muted" href="/requirements">← All requirements</a>
      <div class="card" style="margin-top:10px">
        <Flash ok={c.req.query("ok")} />
        <h1 style="font-size:24px">{r.title}</h1>
        <div class="row" style="gap:6px;margin:10px 0">{t && <a class="badge soft" href={`/category/${t.slug}`}>{t.label}</a>}{r.qty && <span class="badge">{r.qty}</span>}{r.city && <span class="badge">📍 {r.city}</span>}<span class="badge">{ago(r.created_at)}</span>{r.status === "closed" && <span class="badge">Closed</span>}</div>
        {r.details && <p class="small" style="white-space:pre-line">{r.details}</p>}
        <div class="result">
          <b>Buyer contact</b>
          {show ? <p style="margin:6px 0 0">{r.name} · <a class="gold" href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}>{r.phone}</a></p>
            : supplier ? <p class="small muted" style="margin:6px 0 0">{r.status === "closed" ? "This requirement is closed." : "You have reached today's limit for viewing buyer contacts."}</p>
            : <p class="small muted" style="margin:6px 0 0">Shown to suppliers with a claimed listing. <a class="gold" href={u ? "/dashboard/claim" : `/login?next=${encodeURIComponent(`/requirements/${r.id}`)}`}>{u ? "Claim or add your business" : "Sign in"}</a> to see the buyer's name and number. It is free.</p>}
        </div>
      </div>
      {t && <p class="small" style="margin-top:14px"><a class="gold" href={`/category/${t.slug}`}>Browse {t.label.toLowerCase()} in the directory →</a></p>}
    </main>
  ));
});

// Trade shows and exhibitions, added from the admin panel.
type Ev = { id: number; title: string; city: string | null; venue: string | null; starts_on: string; ends_on: string | null; url: string | null; details: string | null };
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
market.get("/events", async (c) => {
  const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
  const rows = (await c.env.DB.prepare(`SELECT * FROM events WHERE coalesce(ends_on, starts_on) >= ? ORDER BY starts_on LIMIT 100`).bind(today).all<Ev>()).results;
  return page(c, { title: "Jewellery trade shows and exhibitions in India", desc: "Upcoming jewellery trade shows, exhibitions and B2B events in India, with dates and venues.", path: "/events",
    jsonld: rows.slice(0, 20).map((e) => ({ "@context": "https://schema.org", "@type": "Event", name: e.title, startDate: e.starts_on, endDate: e.ends_on ?? e.starts_on, location: { "@type": "Place", name: e.venue ?? e.city ?? "India", address: e.city ?? "India" } })) }, (
    <main class="wrap narrow" style="padding-top:26px">
      <div class="eyebrow">Events</div>
      <h1 style="font-size:30px;margin:6px 0">Trade shows and exhibitions</h1>
      <p class="muted small">Upcoming events for the jewellery, bullion and allied trade. Confirm dates with the organiser before you travel.</p>
      {rows.length === 0 ? <div class="card small muted" style="margin-top:14px">Upcoming events will be listed here soon.</div> : (
        <div class="stack" style="margin-top:14px">{rows.map((e) => <div class="card"><b>{e.title}</b><div class="small muted" style="margin-top:4px">📅 {day(e.starts_on)}{e.ends_on && e.ends_on !== e.starts_on ? ` to ${day(e.ends_on)}` : ""}{e.venue || e.city ? ` · 📍 ${[e.venue, e.city].filter(Boolean).join(", ")}` : ""}</div>{e.details && <p class="small" style="white-space:pre-line">{e.details}</p>}{safeUrl(e.url) && <a class="gold small" href={safeUrl(e.url)!} target="_blank" rel="nofollow noopener">Organiser's website →</a>}</div>)}</div>
      )}
    </main>
  ));
});
