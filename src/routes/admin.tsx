/** @jsxImportSource hono/jsx */
import { Hono, type Context } from "hono";
import { inviteStats, inviteText } from "../invites";
import { siteUrl } from "../ui";
import { recount } from "./reviews";
import { type AppEnv, requireAdmin } from "../auth";
import { PLACEMENTS, type Placement } from "./ads";
import { DAILY_REVEALS, today } from "./contact";
import { safeUrl } from "../content";
import { JT_CHUNKS } from "../data/jt-index";
import { type PlanKey, PLANS, getMeta, now, setMeta } from "../db";
import { importBatch } from "../import";
import { Field, Flash, page } from "../ui";
import { activatePlan } from "./account";

export const admin = new Hono<AppEnv>();
admin.use("*", requireAdmin);

const back = (c: Context<AppEnv>, msg: string, err = false) => c.redirect(`/admin?${err ? "err" : "ok"}=${encodeURIComponent(msg)}`, 303);
const when = (t: number) => new Date(t * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

admin.get("/", async (c) => {
  const db = c.env.DB;
  const [biz, claimed, users, premium, enq, claims, pays, off, total, done, note] = await Promise.all([
    db.prepare(`SELECT count(*) AS n FROM businesses`).first<{ n: number }>(),
    db.prepare(`SELECT count(*) AS n FROM businesses WHERE owner_id IS NOT NULL`).first<{ n: number }>(),
    db.prepare(`SELECT count(*) AS n FROM users`).first<{ n: number }>(),
    db.prepare(`SELECT count(*) AS n FROM businesses WHERE plan = 'premium' AND (plan_expires IS NULL OR plan_expires > ?)`).bind(now()).first<{ n: number }>(),
    db.prepare(`SELECT count(*) AS n FROM enquiries`).first<{ n: number }>(),
    db.prepare(`SELECT c.id, c.role, c.phone, c.note, c.created_at, b.name, b.slug, b.gst, b.city, u.name AS uname, u.email FROM claims c JOIN businesses b ON b.id = c.business_id JOIN users u ON u.id = c.user_id WHERE c.status = 'pending' ORDER BY c.created_at LIMIT 100`).all<{ id: number; role: string | null; phone: string | null; note: string | null; created_at: number; name: string; slug: string; gst: string | null; city: string | null; uname: string; email: string }>(),
    db.prepare(`SELECT p.id, p.plan, p.amount, p.provider, p.created_at, b.name, b.slug, u.name AS uname, u.email, u.phone FROM payments p JOIN businesses b ON b.id = p.business_id JOIN users u ON u.id = p.user_id WHERE p.status = 'requested' ORDER BY p.created_at DESC LIMIT 100`).all<{ id: number; plan: PlanKey; amount: number; provider: string | null; created_at: number; name: string; slug: string; uname: string; email: string; phone: string | null }>(),
    getMeta(c.env, "import_offset"), getMeta(c.env, "import_total"), getMeta(c.env, "import_done"), getMeta(c.env, "import_note"),
  ]);
  const jtDone = Number((await getMeta(c.env, "jt_chunk")) ?? 0);
  const jtChunks = JT_CHUNKS.length;
  const docs = new Set((await db.prepare(`SELECT claim_id FROM claim_docs`).all<{ claim_id: number }>()).results.map((r) => r.claim_id));
  const reports = (await db.prepare(`SELECT r.id, r.name, r.phone, r.message, r.created_at, b.name AS bname, b.slug FROM reports r JOIN businesses b ON b.id = r.business_id WHERE r.status = 'new' ORDER BY r.created_at DESC LIMIT 50`).all<{ id: number; name: string; phone: string; message: string | null; created_at: number; bname: string; slug: string }>()).results;
  const events = (await db.prepare(`SELECT id, title, city, starts_on FROM events ORDER BY starts_on DESC LIMIT 60`).all<{ id: number; title: string; city: string | null; starts_on: string }>()).results;
  const viewers = (await db.prepare(`SELECT u.name, u.email, count(*) AS n, (SELECT count(*) FROM reveals r2 WHERE r2.user_id = u.id) AS total FROM reveals r JOIN users u ON u.id = r.user_id WHERE r.day = ? GROUP BY u.id ORDER BY n DESC LIMIT 10`).bind(today()).all<{ name: string; email: string; n: number; total: number }>()).results;
  const adLeads = (await db.prepare(`SELECT name, business, phone, email, message, created_at FROM ad_leads ORDER BY created_at DESC LIMIT 20`).all<{ name: string; business: string; phone: string; email: string | null; message: string | null; created_at: number }>()).results;
  const lq = String(c.req.query("lq") ?? "").trim().slice(0, 80);
  const found = lq.length >= 3 ? (await db.prepare(`SELECT b.id, b.slug, b.name, b.city, b.source, b.plan, u.email AS owner, EXISTS (SELECT 1 FROM private_contacts p WHERE p.business_id = b.id) AS has_contact FROM businesses b LEFT JOIN users u ON u.id = b.owner_id WHERE b.name LIKE ?1 OR b.gst = ?2 OR b.slug = ?3 ORDER BY (b.owner_id IS NOT NULL) DESC, b.name LIMIT 15`).bind(`%${lq}%`, lq.toUpperCase(), lq.toLowerCase().replace(/^.*\/b\//, "")).all<{ id: number; slug: string; name: string; city: string | null; source: string; plan: string; owner: string | null; has_contact: number }>()).results : [];
  const revs = (await db.prepare(`SELECT r.id, r.rating, r.body, r.status, r.created_at, b.name AS bname, b.slug, u.name AS uname FROM reviews r JOIN businesses b ON b.id = r.business_id JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC LIMIT 20`).all<{ id: number; rating: number; body: string | null; status: string; created_at: number; bname: string; slug: string; uname: string }>()).results;
  const mailStats = await db.prepare(`SELECT (SELECT count(*) FROM rate_subs WHERE confirmed = 1) AS subs, (SELECT count(*) FROM rate_alerts WHERE fired_at IS NULL) AS alerts`).first<{ subs: number; alerts: number }>();
  const inv = await inviteStats(c.env);
  const topCities = (await db.prepare(`SELECT coalesce(b.city, '—') AS k, sum(s.views) AS n FROM stats_daily s JOIN businesses b ON b.id = s.business_id WHERE s.day >= date('now', '+330 minutes', '-6 days') GROUP BY b.city ORDER BY n DESC LIMIT 8`).all<{ k: string; n: number }>()).results;
  const topBiz = (await db.prepare(`SELECT b.name AS k, b.slug, sum(s.views) AS n FROM stats_daily s JOIN businesses b ON b.id = s.business_id WHERE s.day >= date('now', '+330 minutes', '-6 days') GROUP BY s.business_id ORDER BY n DESC LIMIT 8`).all<{ k: string; slug: string; n: number }>()).results;
  const visits7 = (await db.prepare(`SELECT day, sum(views) AS n FROM stats_daily WHERE day >= date('now', '+330 minutes', '-6 days') GROUP BY day ORDER BY day`).all<{ day: string; n: number }>()).results;
  const heldEnq = await db.prepare(`SELECT count(*) AS n FROM enquiries e JOIN businesses b ON b.id = e.business_id WHERE b.owner_id IS NULL`).first<{ n: number }>();
  const sample = inviteText(c.env.BRAND_NAME, siteUrl(c), "Your Business Name", "your-business", `${siteUrl(c)}/optout?e=...`);
  const reqs = (await db.prepare(`SELECT id, title, city, name, phone, status, views, created_at, kind FROM requests ORDER BY created_at DESC LIMIT 30`).all<{ id: number; title: string; city: string | null; name: string; phone: string; status: string; views: number; created_at: number }>()).results;
  const banners = (await db.prepare(`SELECT id, title, url, image_id, placement, active, ends_at, views, clicks FROM banners ORDER BY placement, position, id DESC LIMIT 100`).all<{ id: number; title: string; url: string; image_id: number | null; placement: string; active: number; ends_at: number | null; views: number; clicks: number }>()).results;
  return page(c, { title: "Admin", noindex: true }, (
    <main class="wrap" style="padding-top:24px">
      <h1 style="font-size:26px;margin-bottom:14px">Admin</h1>
      <Flash ok={c.req.query("ok")} err={c.req.query("err")} />
      <div class="grid g5">
        {([["Businesses", biz?.n], ["Claimed", claimed?.n], ["Members", users?.n], ["Premium", premium?.n], ["Enquiries", enq?.n]] as const).map(([l, n]) => <div class="card stat"><b>{(n ?? 0).toLocaleString("en-IN")}</b><span class="small muted">{l}</span></div>)}
      </div>

      <nav class="row" style="gap:6px;margin:14px 0 0" aria-label="Admin sections">{[["claims", "Claims"], ["payments", "Membership"], ["reports", "Reports"], ["views", "Contact views"], ["board", "Trade board"], ["events", "Events"], ["adleads", "Ad enquiries"], ["listings", "Find a listing"], ["visitors", "Visitors"], ["invites", "Claim invites"], ["reviews", "Reviews"], ["banners", "Banners"]].map(([i, l]) => <a class="badge" href={`#${i}`}>{l}</a>)}</nav>

      <section id="claims"><h2 style="font-size:20px;margin-bottom:10px">Claims to review ({claims.results.length})</h2>
        {claims.results.length === 0 ? <div class="card muted small">Nothing waiting.</div> : <div class="card"><table><tr><th>Business</th><th>Claimed by</th><th>Details</th><th></th></tr>
          {claims.results.map((r) => <tr>
            <td><a class="gold" href={`/b/${r.slug}`} target="_blank">{r.name}</a><div class="tiny muted">{r.city} · {r.gst}</div></td>
            <td>{r.uname}<div class="tiny muted">{r.email}</div></td>
            <td class="small">{r.role} · {r.phone}<div class="tiny muted">{r.note}</div>{docs.has(r.id) ? <a class="gold tiny" href={`/admin/claim-doc/${r.id}`} target="_blank">View certificate</a> : <span class="tiny muted">No certificate</span>}<div class="tiny muted">{when(r.created_at)}</div></td>
            <td><div class="row"><form method="post" action={`/admin/claims/${r.id}/approve`}><button class="btn sm" type="submit">Approve</button></form><form method="post" action={`/admin/claims/${r.id}/reject`}><button class="btn danger sm" type="submit">Reject</button></form></div></td>
          </tr>)}</table></div>}
      </section>

      <section id="payments"><h2 style="font-size:20px;margin-bottom:10px">Membership requests ({pays.results.length})</h2>
        {pays.results.length === 0 ? <div class="card muted small">Nothing waiting.</div> : <div class="card"><table><tr><th>Business</th><th>Member</th><th>Plan</th><th></th></tr>
          {pays.results.map((r) => <tr>
            <td><a class="gold" href={`/b/${r.slug}`} target="_blank">{r.name}</a></td>
            <td>{r.uname}<div class="tiny muted">{r.email} · {r.phone}</div></td>
            <td>{PLANS[r.plan]?.label}<div class="tiny muted">₹{r.amount.toLocaleString("en-IN")} · {r.provider} · {when(r.created_at)}</div></td>
            <td><div class="row"><form method="post" action={`/admin/payments/${r.id}/activate`} data-confirm="Mark as paid and activate Premium?"><button class="btn sm" type="submit">Payment received — activate</button></form><form method="post" action={`/admin/payments/${r.id}/dismiss`}><button class="btn ghost sm" type="submit">Dismiss</button></form></div></td>
          </tr>)}</table></div>}
      </section>

      <section class="grid g2">
        <form class="card" method="post" action="/admin/grant">
          <b>Give Premium to a business</b>
          <Field label="Listing address ending (the part after /b/)" name="slug" required max={90} />
          <label>Plan<select name="plan">{(Object.keys(PLANS) as PlanKey[]).map((k) => <option value={k}>{PLANS[k].label}</option>)}</select></label>
          <button class="btn sm" type="submit">Activate</button>
        </form>
        <div class="card">
          <b>Business import</b>
          <p class="small muted">Trade directory listings: {jtDone} of {jtChunks} batches loaded.</p>
          <p class="small muted">{done === "1" ? `Finished: ${Number(off ?? 0).toLocaleString("en-IN")} businesses read from the old site.` : `In progress: ${Number(off ?? 0).toLocaleString("en-IN")} of ${total ? Number(total).toLocaleString("en-IN") : "?"} read. It continues by itself every minute.`} {note && note !== "finished" ? `(${note})` : ""}</p>
          <div class="row"><form method="post" action="/admin/import/run"><button class="btn ghost sm" type="submit">Run a batch now</button></form>
            <form method="post" action="/admin/import/restart" data-confirm="Re-read all businesses from the old site? Existing listings are kept."><button class="btn ghost sm" type="submit">Re-run from start</button></form></div>
        </div>
      </section>
      <section id="reports">
        <h2 style="font-size:20px;margin-bottom:10px">Reports ({reports.length})</h2>
        {reports.length === 0 ? <div class="card small muted">No open reports.</div> : <div class="card"><table><tr><th>Listing</th><th>From</th><th>Message</th><th></th></tr>
          {reports.map((r) => <tr><td><a class="gold" href={`/b/${r.slug}`} target="_blank">{r.bname}</a></td><td>{r.name}<div class="tiny muted">{r.phone} · {when(r.created_at)}</div></td><td class="small" style="white-space:normal">{r.message}</td>
            <td><div class="row"><form method="post" action={`/admin/reports/${r.id}/close`}><button class="btn ghost sm" type="submit">Close</button></form><form method="post" action={`/admin/reports/${r.id}/release`} data-confirm="Remove the current owner from this listing so it can be claimed again?"><button class="btn danger sm" type="submit">Remove owner</button></form></div></td></tr>)}</table></div>}
      </section>
      <section id="views">
        <h2 style="font-size:20px;margin-bottom:10px">Contact views today</h2>
        {viewers.length === 0 ? <div class="card small muted">No member has opened a contact today. Each member can open up to {DAILY_REVEALS} a day; fast repeated opening pauses the account automatically.</div> : <div class="card"><table><tr><th>Member</th><th>Opened today</th><th>All time</th></tr>
          {viewers.map((v) => <tr><td>{v.name}<div class="tiny muted">{v.email}</div></td><td>{v.n} of {DAILY_REVEALS}</td><td>{v.total}</td></tr>)}</table></div>}
      </section>
      <section id="board">
        <h2 style="font-size:20px;margin-bottom:10px">Trade board posts ({reqs.length} recent)</h2>
        <p class="small muted">Daily rate email: {mailStats?.subs ?? 0} confirmed subscribers · {mailStats?.alerts ?? 0} open rate alerts</p>
        {reqs.length === 0 ? <div class="card small muted">None posted yet.</div> : <div class="card"><table><tr><th>Post</th><th>Posted by</th><th>Views</th><th></th></tr>
          {reqs.map((r) => <tr><td style="white-space:normal"><a class="gold" href={`/requirements/${r.id}`} target="_blank">{r.title}</a><div class="tiny muted">{(r as { kind?: string }).kind ?? "buy"} · {r.city} · {when(r.created_at)} · {r.status}</div></td><td>{r.name}<div class="tiny muted">{r.phone}</div></td><td>{r.views}</td>
            <td><form method="post" action={`/admin/requests/${r.id}/${r.status === "hidden" ? "open" : "hidden"}`}><button class="btn ghost sm" type="submit">{r.status === "hidden" ? "Show" : "Hide"}</button></form></td></tr>)}</table></div>}
      </section>
      <section id="events">
        <h2 style="font-size:20px;margin-bottom:10px">Events</h2>
        <div class="grid g2">
          <form class="card" method="post" action="/admin/events">
            <b>Add an event</b>
            <label>Event name<input name="title" required maxlength={120} /></label>
            <div class="grid g2"><label>Starts<input name="starts_on" type="date" required /></label><label>Ends<input name="ends_on" type="date" /></label></div>
            <div class="grid g2"><label>City<input name="city" maxlength={60} /></label><label>Venue<input name="venue" maxlength={120} /></label></div>
            <label>Organiser's website<input name="url" type="url" maxlength={300} placeholder="https://" /></label>
            <label>Details (optional)<textarea name="details" rows={2} maxlength={600}></textarea></label>
            <button class="btn sm" type="submit">Add event</button>
          </form>
          <div class="card"><b>Listed events ({events.length})</b>{events.length === 0 ? <p class="small muted">None yet. They appear on the public Events page.</p> : events.map((e) => <div class="row between" style="border-top:1px solid var(--border);padding:8px 0"><span class="small">{e.title}<div class="tiny muted">{e.starts_on} · {e.city}</div></span><form method="post" action={`/admin/events/${e.id}/delete`} data-confirm="Delete this event?"><button class="btn danger sm" type="submit">Delete</button></form></div>)}</div>
        </div>
      </section>
      <section id="adleads">
        <h2 style="font-size:20px;margin-bottom:10px">Advertising enquiries ({adLeads.length})</h2>
        {adLeads.length === 0 ? <div class="card small muted">None yet. They come from the public Advertise page.</div> : <div class="card"><table><tr><th>Business</th><th>Contact</th><th>Message</th></tr>
          {adLeads.map((a) => <tr><td>{a.business}<div class="tiny muted">{when(a.created_at)}</div></td><td>{a.name}<div class="tiny muted">{a.phone}{a.email ? ` · ${a.email}` : ""}</div></td><td class="small" style="white-space:normal">{a.message}</td></tr>)}</table></div>}
      </section>
      <section id="listings">
        <h2 style="font-size:20px;margin-bottom:10px">Find and manage a listing</h2>
        <div class="card">
          <form method="get" action="/admin#listings" class="row"><input name="lq" value={lq} placeholder="Business name, GSTIN or listing address" style="flex:1" /><button class="btn sm" type="submit">Search</button></form>
          {lq.length >= 3 && found.length === 0 && <p class="small muted">Nothing found.</p>}
          {found.map((b) => <div style="border-top:1px solid var(--border);padding:10px 0;margin-top:10px">
            <div class="row between"><span><a class="gold" href={`/b/${b.slug}`} target="_blank">{b.name}</a><div class="tiny muted">{b.city} · {b.source}{b.owner ? ` · owner: ${b.owner}` : " · unclaimed"}{b.has_contact ? " · has members-only contact" : ""}{b.plan === "premium" ? " · Premium" : ""}</div></span>
              <span class="row">
                {b.has_contact ? <form method="post" action={`/admin/listings/${b.id}/hide-contact`} data-confirm="Remove the members-only phone and email for this listing? This cannot be undone."><button class="btn ghost sm" type="submit">Remove contact</button></form> : null}
                {b.owner ? <form method="post" action={`/admin/listings/${b.id}/release`} data-confirm="Remove the owner from this listing?"><button class="btn ghost sm" type="submit">Remove owner</button></form> : null}
                <form method="post" action={`/admin/listings/${b.id}/delete`} data-confirm={`Delete the listing "${b.name}" and everything on it? This cannot be undone.`}><button class="btn danger sm" type="submit">Delete listing</button></form>
              </span></div></div>)}
        </div>
      </section>
      <section id="reviews">
        <h2 style="font-size:20px;margin-bottom:10px">Recent reviews</h2>
        {revs.length === 0 ? <div class="card small muted">No reviews yet.</div> : <div class="card"><table><tr><th>Business</th><th>Review</th><th></th></tr>
          {revs.map((r) => <tr style={r.status === "live" ? undefined : "opacity:.55"}><td><a class="gold" href={`/b/${r.slug}#reviews`} target="_blank">{r.bname}</a><div class="tiny muted">{r.uname} · {when(r.created_at)}</div></td><td class="small" style="white-space:normal">{"★".repeat(r.rating)} {r.body}</td>
            <td><form method="post" action={`/admin/reviews/${r.id}/${r.status === "live" ? "hidden" : "live"}`}><button class="btn ghost sm" type="submit">{r.status === "live" ? "Hide" : "Show"}</button></form></td></tr>)}</table></div>}
      </section>
      <section id="visitors">
        <h2 style="font-size:20px;margin-bottom:10px">Visitors, last 7 days</h2>
        <div class="card">
          <p class="small muted">Listing page visits by people. Search-engine robots are not counted. {heldEnq?.n ?? 0} enquiries are being held for unclaimed listings.</p>
          {visits7.length === 0 ? <p class="small muted">No visits recorded yet. Counting started when this section was added.</p> : (<>
            <div class="row small" style="gap:14px;margin:8px 0">{visits7.map((d) => <span><b>{d.n}</b><div class="tiny muted">{d.day.slice(5)}</div></span>)}</div>
            <div class="grid g2">
              <div><b class="small">Top cities</b>{topCities.map((r) => <div class="row between small"><span>{r.k}</span><span>{r.n}</span></div>)}</div>
              <div><b class="small">Most visited listings</b>{topBiz.map((r) => <div class="row between small"><a class="gold" href={`/b/${r.slug}`} target="_blank">{r.k}</a><span>{r.n}</span></div>)}</div>
            </div></>)}
        </div>
      </section>
      <section id="invites">
        <h2 style="font-size:20px;margin-bottom:10px">Claim invitations</h2>
        <div class="card">
          <p class="small">One email, once, to unclaimed listings that have an email on record, inviting the owner to claim. Nothing is sent until you press the button.</p>
          <div class="row small" style="gap:16px;margin:8px 0"><span><b>{inv.eligible.toLocaleString("en-IN")}</b> not yet invited</span><span><b>{inv.sent.toLocaleString("en-IN")}</b> sent</span><span><b>{inv.claimed}</b> claimed after invite</span><span><b>{inv.optout}</b> opted out</span><span><b>{inv.budget}</b> waiting to go</span></div>
          <details><summary class="small gold">Read the email that will be sent</summary><pre class="small" style="white-space:pre-wrap;background:var(--surface2);padding:12px;border-radius:10px;margin-top:8px">{`Subject: ${sample.subject}\n\n${sample.text}`}</pre></details>
          <form method="post" action="/admin/invites" class="row" style="margin-top:10px" data-confirm="Send these invitation emails? They cannot be recalled.">
            <label style="flex:0 0 220px">How many to send now<input name="n" type="number" min={0} max={300} value="50" /></label>
            <button class="btn sm" type="submit">Send invitations</button>
          </form>
          <p class="tiny muted">Sent at about 10 a minute. Start with 50 a day and watch replies and opt-outs before sending more: mail to old addresses bounces, and too many bounces can get the site's email blocked. Enter 0 to stop a batch that is waiting.</p>
        </div>
      </section>
      <section id="banners">
        <h2 style="font-size:20px;margin-bottom:10px">Banner ads and sponsors</h2>
        <div class="grid g2">
          <form class="card" method="post" action="/admin/banners" enctype="multipart/form-data">
            <b>Add a banner</b>
            <label>Advertiser or sponsor name<input name="title" required maxlength={80} /></label>
            <label>Link when clicked<input name="url" type="url" required maxlength={300} placeholder="https://" /></label>
            <label>Where it shows<select name="placement">{Object.entries(PLACEMENTS).map(([k, v]) => <option value={k}>{v}</option>)}</select></label>
            <label>Banner image (JPG, PNG or WebP under 600 KB)<input type="file" name="image" accept="image/jpeg,image/png,image/webp" data-resize="1600" /></label>
            <label>Run for how many days? (leave empty for no end date)<input name="days" type="number" min="1" max="730" /></label>
            <button class="btn sm" type="submit">Add banner</button>
            <p class="tiny muted">Best sizes: wide banners 1200 × 250, showcase 1200 × 550, side column 600 × 500, sponsor logos 300 × 150. Without an image the name is shown as text.</p>
          </form>
          <div class="card">
            <b>Current banners ({banners.length})</b>
            {banners.length === 0 ? <p class="small muted">None yet.</p> : <table><tr><th>Banner</th><th>Views</th><th>Clicks</th><th></th></tr>
              {banners.map((b) => <tr><td>{b.title}<div class="tiny muted">{PLACEMENTS[b.placement as Placement] ?? b.placement}{b.ends_at ? ` · ends ${when(b.ends_at)}` : ""}{b.active ? "" : " · paused"}</div></td><td>{b.views.toLocaleString("en-IN")}</td><td>{b.clicks.toLocaleString("en-IN")}</td>
                <td><div class="row"><form method="post" action={`/admin/banners/${b.id}/toggle`}><button class="btn ghost sm" type="submit">{b.active ? "Pause" : "Resume"}</button></form><form method="post" action={`/admin/banners/${b.id}/delete`} data-confirm="Delete this banner?"><button class="btn danger sm" type="submit">Delete</button></form></div></td></tr>)}</table>}
          </div>
        </div>
      </section>
    </main>
  ));
});

admin.get("/claim-doc/:id", async (c) => {
  const d = await c.env.DB.prepare(`SELECT mime, data FROM claim_docs WHERE claim_id = ?`).bind(Number(c.req.param("id"))).first<{ mime: string; data: ArrayBuffer }>();
  if (!d) return c.notFound();
  return c.body(d.data instanceof ArrayBuffer ? d.data : new Uint8Array(d.data as unknown as number[]).buffer, 200, { "content-type": d.mime, "cache-control": "private, no-store", "content-disposition": "inline", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" });
});
admin.post("/reports/:id/:action{close|release}", async (c) => {
  const id = Number(c.req.param("id"));
  const r = await c.env.DB.prepare(`SELECT business_id FROM reports WHERE id = ?`).bind(id).first<{ business_id: number }>();
  if (!r) return back(c, "Report not found", true);
  if (c.req.param("action") === "release") await c.env.DB.prepare(`UPDATE businesses SET owner_id = NULL WHERE id = ?`).bind(r.business_id).run();
  await c.env.DB.prepare(`UPDATE reports SET status = 'closed' WHERE id = ?`).bind(id).run();
  return back(c, c.req.param("action") === "release" ? "Owner removed. The listing can be claimed again." : "Report closed");
});
admin.post("/requests/:id/:action{open|hidden}", async (c) => {
  await c.env.DB.prepare(`UPDATE requests SET status = ? WHERE id = ?`).bind(c.req.param("action"), Number(c.req.param("id"))).run();
  return back(c, "Requirement updated");
});
admin.post("/events", async (c) => {
  const f = await c.req.parseBody();
  const v = (k: string, n: number) => String(f[k] ?? "").trim().slice(0, n);
  const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!v("title", 120) || !isDate(v("starts_on", 10))) return back(c, "Event needs a name and a start date", true);
  await c.env.DB.prepare(`INSERT INTO events (title, city, venue, starts_on, ends_on, url, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(v("title", 120), v("city", 60) || null, v("venue", 120) || null, v("starts_on", 10), isDate(v("ends_on", 10)) ? v("ends_on", 10) : null, safeUrl(v("url", 300)), v("details", 600) || null, now()).run();
  return back(c, "Event added");
});
admin.post("/events/:id/delete", async (c) => { await c.env.DB.prepare(`DELETE FROM events WHERE id = ?`).bind(Number(c.req.param("id"))).run(); return back(c, "Event deleted"); });
admin.post("/reviews/:id/:action{live|hidden}", async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare(`UPDATE reviews SET status = ? WHERE id = ?`).bind(c.req.param("action"), id).run();
  const rv = await c.env.DB.prepare(`SELECT business_id FROM reviews WHERE id = ?`).bind(id).first<{ business_id: number }>();
  if (rv) await recount(c.env.DB, rv.business_id);
  return back(c, "Review updated");
});
admin.post("/listings/:id/:action{hide-contact|release|delete}", async (c) => {
  const id = Number(c.req.param("id")), action = c.req.param("action"), db = c.env.DB;
  if (action === "hide-contact") { await db.batch([db.prepare(`DELETE FROM private_contacts WHERE business_id = ?`).bind(id), db.prepare(`DELETE FROM reveals WHERE business_id = ?`).bind(id)]); return back(c, "Members-only contact removed"); }
  if (action === "release") { await db.prepare(`UPDATE businesses SET owner_id = NULL WHERE id = ?`).bind(id).run(); return back(c, "Owner removed"); }
  await db.batch(["products", "links", "extras", "images", "enquiries", "claims", "payments", "business_types", "private_contacts", "reveals", "reviews", "reports", "claim_codes", "saved"].map((t) => db.prepare(`DELETE FROM ${t} WHERE business_id = ?`).bind(id)).concat(db.prepare(`DELETE FROM businesses WHERE id = ?`).bind(id)));
  return back(c, "Listing deleted");
});
admin.post("/invites", async (c) => {
  const n = Math.max(0, Math.min(300, Math.round(Number((await c.req.parseBody()).n) || 0)));
  await setMeta(c.env, "invite_budget", String(n));
  return back(c, n ? `${n} invitations queued. They go out over the next few minutes.` : "Invitations stopped");
});
admin.post("/banners", async (c) => {
  const f = await c.req.parseBody();
  const title = String(f.title ?? "").trim().slice(0, 80), url = safeUrl(String(f.url ?? "").slice(0, 300));
  const placement = String(f.placement ?? "");
  if (!title || !url || !(placement in PLACEMENTS)) return back(c, "Banner needs a name, a valid link and a placement", true);
  let imageId: number | null = null;
  const file = f.image;
  if (file instanceof File && file.size > 0) {
    if (file.size > 600 * 1024) return back(c, "Banner image must be under 600 KB", true);
    const buf = new Uint8Array(await file.arrayBuffer());
    const mime = buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : buf[0] === 0x89 && buf[1] === 0x50 ? "image/png" : buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45 ? "image/webp" : null;
    if (!mime) return back(c, "Banner image must be a JPG, PNG or WebP", true);
    const r = await c.env.DB.prepare(`INSERT INTO images (business_id, user_id, mime, data, size, created_at) VALUES (0, ?, ?, ?, ?, ?)`).bind(c.get("user")!.id, mime, buf, buf.length, now()).run();
    imageId = Number(r.meta.last_row_id);
  }
  const days = Number(f.days);
  await c.env.DB.prepare(`INSERT INTO banners (title, url, image_id, placement, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(title, url, imageId, placement, days >= 1 && days <= 730 ? now() + Math.floor(days) * 86400 : null, now()).run();
  return back(c, "Banner added");
});
admin.post("/banners/:id/:action{toggle|delete}", async (c) => {
  const id = Number(c.req.param("id"));
  if (c.req.param("action") === "toggle") { await c.env.DB.prepare(`UPDATE banners SET active = 1 - active WHERE id = ?`).bind(id).run(); return back(c, "Banner updated"); }
  const b = await c.env.DB.prepare(`SELECT image_id FROM banners WHERE id = ?`).bind(id).first<{ image_id: number | null }>();
  await c.env.DB.batch([c.env.DB.prepare(`DELETE FROM banners WHERE id = ?`).bind(id), ...(b?.image_id ? [c.env.DB.prepare(`DELETE FROM images WHERE id = ? AND business_id = 0`).bind(b.image_id)] : [])]);
  return back(c, "Banner deleted");
});

admin.post("/claims/:id/:action{approve|reject}", async (c) => {
  const id = Number(c.req.param("id"));
  const cl = await c.env.DB.prepare(`SELECT c.business_id, c.user_id, b.owner_id FROM claims c JOIN businesses b ON b.id = c.business_id WHERE c.id = ? AND c.status = 'pending'`).bind(id).first<{ business_id: number; user_id: number; owner_id: number | null }>();
  if (!cl) return back(c, "Claim not found", true);
  if (c.req.param("action") === "reject") { await c.env.DB.prepare(`UPDATE claims SET status = 'rejected' WHERE id = ?`).bind(id).run(); return back(c, "Claim rejected"); }
  if (cl.owner_id) return back(c, "That business already has an owner", true);
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE businesses SET owner_id = ? WHERE id = ? AND owner_id IS NULL`).bind(cl.user_id, cl.business_id),
    c.env.DB.prepare(`UPDATE claims SET status = 'approved' WHERE id = ?`).bind(id),
    c.env.DB.prepare(`UPDATE claims SET status = 'rejected' WHERE business_id = ? AND status = 'pending' AND id <> ?`).bind(cl.business_id, id),
  ]);
  return back(c, "Claim approved");
});

admin.post("/payments/:id/:action{activate|dismiss}", async (c) => {
  const id = Number(c.req.param("id"));
  const p = await c.env.DB.prepare(`SELECT business_id, plan FROM payments WHERE id = ? AND status = 'requested'`).bind(id).first<{ business_id: number; plan: PlanKey }>();
  if (!p) return back(c, "Request not found", true);
  if (c.req.param("action") === "dismiss") { await c.env.DB.prepare(`UPDATE payments SET status = 'dismissed' WHERE id = ?`).bind(id).run(); return back(c, "Dismissed"); }
  const u = await c.env.DB.prepare(`UPDATE payments SET status = 'paid' WHERE id = ? AND status = 'requested'`).bind(id).run();
  if (u.meta.changes === 1) await activatePlan(c.env.DB, p.business_id, p.plan);
  return back(c, "Premium activated");
});

admin.post("/grant", async (c) => {
  const f = await c.req.parseBody();
  const plan = String(f.plan) as PlanKey;
  const b = await c.env.DB.prepare(`SELECT id FROM businesses WHERE slug = ?`).bind(String(f.slug ?? "").trim().toLowerCase()).first<{ id: number }>();
  if (!b || !(plan in PLANS)) return back(c, "Business not found", true);
  await activatePlan(c.env.DB, b.id, plan);
  return back(c, "Premium activated");
});

admin.post("/import/run", async (c) => { const r = await importBatch(c.env, 4); return back(c, r.note && !r.done ? `Import: ${r.note}` : `Import at ${r.offset}${r.done ? " (finished)" : ""}`, !!r.note && !r.done); });
admin.post("/import/restart", async (c) => { await setMeta(c.env, "import_done", "0"); await setMeta(c.env, "import_offset", "0"); return back(c, "Import restarted"); });
