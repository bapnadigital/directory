/** @jsxImportSource hono/jsx */
import { Hono, type Context } from "hono";
import { type AppEnv, requireAdmin } from "../auth";
import { PLACEMENTS, type Placement } from "./ads";
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
  const banners = (await db.prepare(`SELECT id, title, url, image_id, placement, active, ends_at, views, clicks FROM banners ORDER BY placement, position, id DESC LIMIT 100`).all<{ id: number; title: string; url: string; image_id: number | null; placement: string; active: number; ends_at: number | null; views: number; clicks: number }>()).results;
  return page(c, { title: "Admin", noindex: true }, (
    <main class="wrap" style="padding-top:24px">
      <h1 style="font-size:26px;margin-bottom:14px">Admin</h1>
      <Flash ok={c.req.query("ok")} err={c.req.query("err")} />
      <div class="grid g5">
        {([["Businesses", biz?.n], ["Claimed", claimed?.n], ["Members", users?.n], ["Premium", premium?.n], ["Enquiries", enq?.n]] as const).map(([l, n]) => <div class="card stat"><b>{(n ?? 0).toLocaleString("en-IN")}</b><span class="small muted">{l}</span></div>)}
      </div>

      <section><h2 style="font-size:20px;margin-bottom:10px">Claims to review ({claims.results.length})</h2>
        {claims.results.length === 0 ? <div class="card muted small">Nothing waiting.</div> : <div class="card"><table><tr><th>Business</th><th>Claimed by</th><th>Details</th><th></th></tr>
          {claims.results.map((r) => <tr>
            <td><a class="gold" href={`/b/${r.slug}`} target="_blank">{r.name}</a><div class="tiny muted">{r.city} · {r.gst}</div></td>
            <td>{r.uname}<div class="tiny muted">{r.email}</div></td>
            <td class="small">{r.role} · {r.phone}<div class="tiny muted">{r.note}</div>{docs.has(r.id) ? <a class="gold tiny" href={`/admin/claim-doc/${r.id}`} target="_blank">View certificate</a> : <span class="tiny muted">No certificate</span>}<div class="tiny muted">{when(r.created_at)}</div></td>
            <td><div class="row"><form method="post" action={`/admin/claims/${r.id}/approve`}><button class="btn sm" type="submit">Approve</button></form><form method="post" action={`/admin/claims/${r.id}/reject`}><button class="btn danger sm" type="submit">Reject</button></form></div></td>
          </tr>)}</table></div>}
      </section>

      <section><h2 style="font-size:20px;margin-bottom:10px">Membership requests ({pays.results.length})</h2>
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
          <p class="small muted">{done === "1" ? `Finished: ${Number(off ?? 0).toLocaleString("en-IN")} businesses read from the old site.` : `In progress: ${Number(off ?? 0).toLocaleString("en-IN")} of ${total ? Number(total).toLocaleString("en-IN") : "?"} read. It continues by itself every 2 minutes.`} {note && note !== "finished" ? `(${note})` : ""}</p>
          <div class="row"><form method="post" action="/admin/import/run"><button class="btn ghost sm" type="submit">Run a batch now</button></form>
            <form method="post" action="/admin/import/restart" data-confirm="Re-read all businesses from the old site? Existing listings are kept."><button class="btn ghost sm" type="submit">Re-run from start</button></form></div>
        </div>
      </section>
      <section>
        <h2 style="font-size:20px;margin-bottom:10px">Reports ({reports.length})</h2>
        {reports.length === 0 ? <div class="card small muted">No open reports.</div> : <div class="card"><table><tr><th>Listing</th><th>From</th><th>Message</th><th></th></tr>
          {reports.map((r) => <tr><td><a class="gold" href={`/b/${r.slug}`} target="_blank">{r.bname}</a></td><td>{r.name}<div class="tiny muted">{r.phone} · {when(r.created_at)}</div></td><td class="small" style="white-space:normal">{r.message}</td>
            <td><div class="row"><form method="post" action={`/admin/reports/${r.id}/close`}><button class="btn ghost sm" type="submit">Close</button></form><form method="post" action={`/admin/reports/${r.id}/release`} data-confirm="Remove the current owner from this listing so it can be claimed again?"><button class="btn danger sm" type="submit">Remove owner</button></form></div></td></tr>)}</table></div>}
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
            <p class="tiny muted">Best sizes: wide banners 1200 × 250, side column 600 × 500, sponsor logos 300 × 150. Without an image the name is shown as text.</p>
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
