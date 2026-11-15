/** @jsxImportSource hono/jsx */
import { Hono, type Context } from "hono";
import { type AppEnv, requireAdmin } from "../auth";
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
            <td class="small">{r.role} · {r.phone}<div class="tiny muted">{r.note}</div><div class="tiny muted">{when(r.created_at)}</div></td>
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
    </main>
  ));
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
