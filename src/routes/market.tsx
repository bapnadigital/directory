/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Context } from "hono";
import { type AppEnv, clientIp } from "../auth";
import { TRADE_TYPES, findType, safeUrl } from "../content";
import { allow, now } from "../db";
import { digestToken } from "../digest";
import { Field, Flash, page } from "../ui";

// Buy requirements board and industry news.
export const market = new Hono<AppEnv>();
type C = Context<AppEnv>;
type Req = { id: number; title: string; category: string | null; details: string | null; qty: string | null; city: string | null; name: string; phone: string; created_at: number; status: string; views: number; kind: string; user_id: number | null };
const ago = (t: number) => { const d = Math.floor((Date.now() / 1000 - t) / 86400); return d <= 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`; };
const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

// One board, four kinds of post. "open" = any signed-in member may see the contact; otherwise only owners of claimed listings.
export const KINDS = [
  { slug: "buy", label: "Buy requirement", plural: "Buy requirements", who: "Buyer", open: false },
  { slug: "sell", label: "Stock / offer for sale", plural: "Offers for sale", who: "Seller", open: true },
  { slug: "hire", label: "Job vacancy", plural: "Jobs", who: "Employer", open: true },
  { slug: "work", label: "Looking for work", plural: "Available for work", who: "Candidate", open: false },
] as const;
const findKind = (k: unknown) => KINDS.find((x) => x.slug === k);

export async function LatestRequests({ c }: { c: C }) {
  let rows: Req[] = [];
  try { rows = (await c.env.DB.prepare(`SELECT id, title, category, qty, city, kind, created_at FROM requests WHERE status = 'open' AND created_at > ? ORDER BY created_at DESC LIMIT 4`).bind(now() - 45 * 86400).all<Req>()).results; } catch { /* not ready */ }
  return (
    <section class="wrap">
      <div class="head"><div><div class="eyebrow">Trade board</div><h2>Requirements, offers and jobs</h2></div><span class="row"><a class="gold small" href="/requirements">See all →</a><a class="btn sm" href="/requirements/new">Post free</a></span></div>
      {rows.length === 0
        ? <div class="card small muted">Nothing posted yet. Need a supplier, have stock to sell, hiring staff or looking for work? <a class="gold" href="/requirements/new">Post it free</a> and let the trade contact you.</div>
        : <div class="grid g4">{rows.map((r) => <a class="card" href={`/requirements/${r.id}`}><span class="badge soft">{(findKind(r.kind) ?? KINDS[0]).label}</span><b style="display:block;margin-top:6px">{r.title}</b><div class="tiny muted" style="margin-top:6px">{[findType(r.category)?.label, r.qty, r.city].filter(Boolean).join(" · ")}</div><div class="tiny muted">{ago(r.created_at)}</div></a>)}</div>}
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
  const kind = findKind(c.req.query("kind"));
  const where = ["status = 'open'", "created_at > ?"], args: (string | number)[] = [now() - 60 * 86400];
  if (cat) { where.push("category = ?"); args.push(cat.slug); }
  if (kind) { where.push("kind = ?"); args.push(kind.slug); }
  const q = s(c.req.query("q"), 60), city = s(c.req.query("city"), 40);
  for (const w of q.split(/\s+/).filter((x) => x.length > 1).slice(0, 4)) { where.push("(title LIKE ? OR details LIKE ?)"); args.push(`%${w}%`, `%${w}%`); }
  if (city) { where.push("city LIKE ?"); args.push(`${city}%`); }
  const rows = (await c.env.DB.prepare(`SELECT id, title, category, qty, city, details, kind, created_at FROM requests WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT 100`).bind(...args).all<Req>()).results;
  const link = (k?: string, t?: string) => { const p = new URLSearchParams(); if (k) p.set("kind", k); if (t) p.set("category", t); const x = p.toString(); return `/requirements${x ? `?${x}` : ""}`; };
  return page(c, { title: "Jewellery trade board — buy requirements, stock offers and jobs", desc: "Open buy requirements, stock offers, job vacancies and karigars available for work across the Indian jewellery trade. Free to post.", path: "/requirements", noindex: !!cat || !!kind || !!q || !!city }, (
    <main class="wrap" style="padding-top:26px">
      <div class="head"><div><div class="eyebrow">Trade board</div><h1 style="font-size:30px;margin-top:6px">{kind ? kind.plural : "Buyers looking for suppliers, offers and jobs"}</h1></div><a class="btn" href="/requirements/new">Post free</a></div>
      <Flash ok={c.req.query("ok")} />
      <form method="get" action="/requirements" class="row" style="margin-bottom:10px">
        {kind && <input type="hidden" name="kind" value={kind.slug} />}{cat && <input type="hidden" name="category" value={cat.slug} />}
        <input name="q" value={q} placeholder="Search posts, e.g. CAD designer, temple jewellery" style="flex:2;min-width:180px" /><input name="city" value={city} placeholder="City" style="flex:1;min-width:110px" /><button class="btn sm" type="submit">Search</button>
      </form>
      <div class="row" style="gap:6px;margin-bottom:8px"><a class={`badge ${kind ? "" : "gold"}`} href={link(undefined, cat?.slug)}>Everything</a>{KINDS.map((k) => <a class={`badge ${kind?.slug === k.slug ? "gold" : ""}`} href={link(k.slug, cat?.slug)}>{k.plural}</a>)}</div>
      <div class="row" style="gap:6px;margin-bottom:14px"><a class={`badge ${cat ? "" : "gold"}`} href={link(kind?.slug)}>All categories</a>{TRADE_TYPES.map((t) => <a class={`badge ${cat?.slug === t.slug ? "gold" : ""}`} href={link(kind?.slug, t.slug)}>{t.label}</a>)}</div>
      {rows.length === 0 ? <div class="card center muted">Nothing open here yet. Be the first to post.</div> : (
        <div class="grid g3">{rows.map((r) => <a class="card" href={`/requirements/${r.id}`}><span class="badge soft">{(findKind(r.kind) ?? KINDS[0]).label}</span><b style="display:block;margin-top:6px">{r.title}</b><p class="small muted" style="margin:6px 0">{(r.details ?? "").slice(0, 110)}{(r.details ?? "").length > 110 ? "…" : ""}</p><div class="row" style="gap:6px">{findType(r.category) && <span class="badge soft">{findType(r.category)!.label}</span>}{r.qty && <span class="badge">{r.qty}</span>}{r.city && <span class="badge">📍 {r.city}</span>}<span class="tiny muted">{ago(r.created_at)}</span></div></a>)}</div>
      )}
    </main>
  ));
});

market.get("/requirements/new", (c) => page(c, { title: "Post on the jewellery trade board", desc: "Post a buy requirement, stock offer, job vacancy or your availability for work. Free, takes a minute.", path: "/requirements/new" }, (
  <main class="wrap narrow" style="padding-top:26px">
    <div class="card">
      <h1 style="font-size:24px">Post on the trade board</h1>
      <p class="small muted">Free. Post a buy requirement, stock for sale, a job vacancy or your availability for work. Trade members contact you directly.</p>
      <Flash err={c.req.query("err")} />
      <form method="post" action="/requirements/new">
        <label>What are you posting?<select name="kind">{KINDS.map((k) => <option value={k.slug} selected={c.req.query("kind") === k.slug}>{k.label}</option>)}</select></label>
        <Field label="Title" name="title" required max={100} placeholder="e.g. Need 22K antique temple necklaces, 500 g / Hiring CAD designer in Rajkot" />
        <label>Category<select name="category"><option value="">Choose a category</option>{TRADE_TYPES.map((t) => <option value={t.slug}>{t.label}</option>)}</select></label>
        <div class="grid g2"><Field label="Quantity or budget" name="qty" max={60} placeholder="e.g. 500 g / ₹5 lakh / 20 pcs" /><Field label="Your city" name="city" required max={60} /></div>
        <Field label="Details" name="details" area max={1000} placeholder="Purity, design type, delivery date, experience or salary range, anything else that helps" />
        <div class="grid g2"><Field label="Your name" name="name" required max={80} /><Field label="Mobile number" name="phone" type="tel" required max={16} /></div>
        <input name="website" tabindex={-1} autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true" />
        <button class="btn" type="submit">Post now</button>
        <p class="tiny muted">Your number is never shown on the public page. Buy requirements and work-wanted posts are shown to signed-in businesses with a claimed listing; offers and job vacancies to any signed-in member.</p>
      </form>
    </div>
  </main>
)));

market.post("/requirements/new", async (c) => {
  const f = await c.req.parseBody();
  const fail = (m: string) => c.redirect(`/requirements/new?err=${encodeURIComponent(m)}`, 303);
  if (s(f.website, 10)) return c.redirect("/requirements?ok=Posted", 303);
  const title = s(f.title, 100), city = s(f.city, 60), name = s(f.name, 80), phone = s(f.phone, 16);
  if (title.length < 8 || !city || !name || phone.replace(/\D/g, "").length < 10) return fail("Please fill in a title (at least 8 characters), your city, name and a valid mobile number");
  if (/https?:\/\/|www\./i.test(title + s(f.details, 1000))) return fail("Please remove web links from the post");
  if (!(await allow(c.env, `rq:${clientIp(c)}`, 3, 86400))) return fail("You can post up to 3 times a day");
  const u = c.get("user");
  const r = await c.env.DB.prepare(`INSERT INTO requests (title, category, details, qty, city, name, phone, user_id, created_at, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(title, findType(s(f.category, 30))?.slug ?? null, s(f.details, 1000) || null, s(f.qty, 60) || null, city, name, phone, u?.id ?? null, now(), findKind(s(f.kind, 10))?.slug ?? "buy").run();
  return c.redirect(`/requirements/${r.meta.last_row_id}?ok=${encodeURIComponent("Your post is live. Trade members can now contact you.")}`, 303);
});

market.get("/requirements/:id{[0-9]+}", async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM requests WHERE id = ? AND status IN ('open','closed')`).bind(Number(c.req.param("id"))).first<Req>();
  if (!r) return c.notFound();
  const u = c.get("user");
  const supplier = u ? !!u.is_admin || !!(await c.env.DB.prepare(`SELECT 1 FROM businesses WHERE owner_id = ? LIMIT 1`).bind(u.id).first()) : false;
  const kind = findKind(r.kind) ?? KINDS[0];
  const allowed = kind.open ? !!u : supplier;
  let show = false;
  if (allowed && u && r.status === "open") {
    show = !!u.is_admin || (await allow(c.env, `rqv:${u.id}`, 40, 86400));
    if (show) c.executionCtx.waitUntil(c.env.DB.prepare(`UPDATE requests SET views = views + 1 WHERE id = ?`).bind(r.id).run());
  }
  const t = findType(r.category);
  return page(c, { title: r.title, desc: `${kind.label}: ${r.title}${r.city ? ` in ${r.city}` : ""}.`, path: `/requirements/${r.id}`, noindex: now() - r.created_at > 60 * 86400 }, (
    <main class="wrap narrow" style="padding-top:26px">
      <a class="small muted" href="/requirements">← Trade board</a>
      <div class="card" style="margin-top:10px">
        <Flash ok={c.req.query("ok")} />
        <h1 style="font-size:24px">{r.title}</h1>
        <div class="row" style="gap:6px;margin:10px 0"><a class="badge gold" href={`/requirements?kind=${kind.slug}`}>{kind.label}</a>{t && <a class="badge soft" href={`/category/${t.slug}`}>{t.label}</a>}{r.qty && <span class="badge">{r.qty}</span>}{r.city && <span class="badge">📍 {r.city}</span>}<span class="badge">{ago(r.created_at)}</span>{r.status === "closed" && <span class="badge">Closed</span>}</div>
        {r.details && <p class="small" style="white-space:pre-line">{r.details}</p>}
        <div class="result">
          <b>{kind.who} contact</b>
          {show ? <p style="margin:6px 0 0">{r.name} · <a class="gold" href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}>{r.phone}</a> · <a class="gold" href={`https://wa.me/${r.phone.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}?text=${encodeURIComponent(`Hello ${r.name}, regarding your post on Jewellery Sahi Hai: "${r.title}"`)}`} target="_blank" rel="noopener">WhatsApp</a></p>
            : allowed ? <p class="small muted" style="margin:6px 0 0">{r.status === "closed" ? "This post is closed." : "You have reached today's limit for viewing contacts."}</p>
            : kind.open ? <p class="small muted" style="margin:6px 0 0"><a class="gold" href={`/login?next=${encodeURIComponent(`/requirements/${r.id}`)}`}>Sign in</a> to see the name and number. It is free.</p>
            : <p class="small muted" style="margin:6px 0 0">Shown to businesses with a claimed listing. <a class="gold" href={u ? "/dashboard/claim" : `/login?next=${encodeURIComponent(`/requirements/${r.id}`)}`}>{u ? "Claim or add your business" : "Sign in"}</a> to see the name and number. It is free.</p>}
        </div>
      </div>
      {u && r.status === "open" && (u.is_admin || (r.user_id && r.user_id === u.id)) ? <form method="post" action={`/requirements/${r.id}/close`} style="margin-top:12px" data-confirm="Close this post? It will stop showing your contact."><button class="btn ghost sm" type="submit">Close this post</button></form> : null}
      {t && <p class="small" style="margin-top:14px"><a class="gold" href={`/category/${t.slug}`}>Browse {t.label.toLowerCase()} in the directory →</a></p>}
    </main>
  ));
});

market.post("/requirements/:id{[0-9]+}/close", async (c) => {
  const u = c.get("user"), id = Number(c.req.param("id"));
  if (!u) return c.redirect("/login", 303);
  await c.env.DB.prepare(`UPDATE requests SET status = 'closed' WHERE id = ? AND status = 'open' AND (user_id = ? OR ? = 1)`).bind(id, u.id, u.is_admin ? 1 : 0).run();
  return c.redirect(`/requirements/${id}?ok=${encodeURIComponent("Updated")}`, 303);
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

market.get("/unsubscribe", async (c) => {
  const id = Number(c.req.query("u")), t = c.req.query("t") ?? "";
  const u = Number.isInteger(id) ? await c.env.DB.prepare(`SELECT id, pass_salt FROM users WHERE id = ?`).bind(id).first<{ id: number; pass_salt: string }>() : null;
  const ok = !!u && t.length === 24 && t === (await digestToken(u.id, u.pass_salt));
  if (ok) await c.env.DB.prepare(`UPDATE users SET digest_off = 1 WHERE id = ?`).bind(id).run();
  return page(c, { title: "Email preferences", noindex: true }, (
    <main class="wrap narrow center" style="padding-top:60px"><div class="card"><h1 style="font-size:22px">{ok ? "You are unsubscribed" : "This link is not valid"}</h1><p class="muted small">{ok ? "You will no longer receive the weekly buy requirements email. Enquiry alerts for your own listing still reach you." : "Please use the link from the most recent email."}</p><a class="btn" href="/">Back to the site</a></div></main>
  ));
});
