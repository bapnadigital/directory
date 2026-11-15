/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../auth";
import { allow, now } from "../db";
import { Flash } from "../ui";

// Ratings and reviews on claimed listings: one per signed-in user per business,
// the owner can reply, the admin can hide.
export const reviews = new Hono<AppEnv>();
type C = Context<AppEnv>;
export type Review = { id: number; rating: number; body: string | null; reply: string | null; created_at: number; uname: string; user_id: number };
const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
export const stars = (n: number) => "★★★★★".slice(0, Math.round(n)) + "☆☆☆☆☆".slice(0, 5 - Math.round(n));

export async function loadReviews(db: D1Database, businessId: number) {
  const rows = (await db.prepare(`SELECT r.id, r.rating, r.body, r.reply, r.created_at, r.user_id, u.name AS uname FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.business_id = ? AND r.status = 'live' ORDER BY r.created_at DESC LIMIT 30`).bind(businessId).all<Review>()).results;
  const agg = await db.prepare(`SELECT count(*) AS n, avg(rating) AS a FROM reviews WHERE business_id = ? AND status = 'live'`).bind(businessId).first<{ n: number; a: number | null }>();
  return { rows, count: agg?.n ?? 0, avg: agg?.a ?? 0 };
}

export function ReviewsBlock({ c, slug, ownerId, data }: { c: C; slug: string; ownerId: number; data: Awaited<ReturnType<typeof loadReviews>> }) {
  const u = c.get("user");
  const mine = u ? data.rows.find((r) => r.user_id === u.id) : undefined;
  const isOwner = !!u && u.id === ownerId;
  const first = (n: string) => n.split(/\s+/)[0];
  return (
    <div class="card" id="reviews">
      <div class="row between"><h2 style="font-size:18px">Ratings and reviews</h2>{data.count > 0 && <span class="small"><b class="gold">{stars(data.avg)}</b> {data.avg.toFixed(1)} · {data.count} review{data.count === 1 ? "" : "s"}</span>}</div>
      <Flash ok={c.req.query("rok")} err={c.req.query("rerr")} />
      {data.rows.length === 0 && <p class="small muted">No reviews yet. If you have dealt with this business, be the first to rate it.</p>}
      {data.rows.map((r) => (
        <div style="padding:10px 0;border-top:1px solid var(--border);margin-top:8px">
          <div class="small"><b class="gold">{stars(r.rating)}</b> <b>{first(r.uname)}</b> <span class="tiny muted">{new Date(r.created_at * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span></div>
          {r.body && <p class="small" style="margin:4px 0;white-space:pre-line">{r.body}</p>}
          {r.reply && <div class="small" style="margin-top:6px;padding:8px 10px;border-radius:10px;background:var(--surface2)"><b>Reply from the business:</b> {r.reply}</div>}
          {isOwner && !r.reply && <form method="post" action={`/b/${slug}/review/${r.id}/reply`} class="row" style="margin-top:6px"><input name="reply" maxlength={400} placeholder="Reply to this review" required style="flex:1" /><button class="btn ghost sm" type="submit">Reply</button></form>}
        </div>
      ))}
      {!isOwner && (u ? (
        <form method="post" action={`/b/${slug}/review`} style="margin-top:12px">
          <b class="small">{mine ? "Update your review" : "Rate this business"}</b>
          <div class="grid g2" style="margin-top:6px"><label>Rating<select name="rating" required>{[5, 4, 3, 2, 1].map((n) => <option value={n} selected={mine?.rating === n}>{n} – {["", "Poor", "Below average", "Average", "Good", "Excellent"][n]}</option>)}</select></label></div>
          <label>Your experience (optional)<textarea name="body" rows={3} maxlength={600} placeholder="What did you buy or order, and how did it go?">{mine?.body ?? ""}</textarea></label>
          <button class="btn sm" type="submit">{mine ? "Update review" : "Post review"}</button>
          <p class="tiny muted">Shown with your first name. Write only about your own dealings. Abusive or false reviews are removed.</p>
        </form>
      ) : <p class="small" style="margin-top:10px"><a class="gold" href={`/login?next=${encodeURIComponent(`/b/${slug}`)}`}>Sign in</a> to rate this business.</p>)}
    </div>
  );
}

reviews.post("/b/:slug/review", async (c) => {
  const slug = c.req.param("slug").toLowerCase();
  const back = (k: string, m: string) => c.redirect(`/b/${slug}?${k}=${encodeURIComponent(m)}#reviews`, 303);
  const u = c.get("user");
  if (!u) return c.redirect(`/login?next=${encodeURIComponent(`/b/${slug}`)}`, 303);
  const b = await c.env.DB.prepare(`SELECT id, owner_id FROM businesses WHERE slug = ?`).bind(slug).first<{ id: number; owner_id: number | null }>();
  if (!b) return c.notFound();
  if (!b.owner_id) return back("rerr", "Reviews open once the owner claims this listing");
  if (b.owner_id === u.id) return back("rerr", "You cannot review your own business");
  const f = await c.req.parseBody();
  const rating = Number(f.rating), body = s(f.body, 600);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return back("rerr", "Please choose a rating from 1 to 5");
  if (/https?:\/\/|www\./i.test(body)) return back("rerr", "Please remove web links from the review");
  if (!(await allow(c.env, `rev:${u.id}`, 6, 86400))) return back("rerr", "You have posted several reviews today. Please try again tomorrow.");
  await c.env.DB.prepare(`INSERT INTO reviews (business_id, user_id, rating, body, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (business_id, user_id) DO UPDATE SET rating = excluded.rating, body = excluded.body, created_at = excluded.created_at, status = 'live'`).bind(b.id, u.id, rating, body || null, now()).run();
  return back("rok", "Thank you. Your review is live.");
});

reviews.post("/b/:slug/review/:id/reply", async (c) => {
  const slug = c.req.param("slug").toLowerCase();
  const u = c.get("user");
  const b = await c.env.DB.prepare(`SELECT id, owner_id FROM businesses WHERE slug = ?`).bind(slug).first<{ id: number; owner_id: number | null }>();
  if (!u || !b || b.owner_id !== u.id) return c.text("Not allowed", 403);
  const reply = s((await c.req.parseBody()).reply, 400);
  if (reply) await c.env.DB.prepare(`UPDATE reviews SET reply = ? WHERE id = ? AND business_id = ?`).bind(reply, Number(c.req.param("id")), b.id).run();
  return c.redirect(`/b/${slug}?rok=${encodeURIComponent("Reply posted")}#reviews`, 303);
});

// ---- Saved listings (a private shortlist for any signed-in user)
import { BizCard, page, type Card } from "../ui";

export async function isSaved(db: D1Database, userId: number, businessId: number) {
  return !!(await db.prepare(`SELECT 1 AS x FROM saved WHERE user_id = ? AND business_id = ?`).bind(userId, businessId).first());
}

reviews.post("/b/:slug/save", async (c) => {
  const slug = c.req.param("slug").toLowerCase();
  const u = c.get("user");
  if (!u) return c.redirect(`/login?next=${encodeURIComponent(`/b/${slug}`)}`, 303);
  const b = await c.env.DB.prepare(`SELECT id FROM businesses WHERE slug = ?`).bind(slug).first<{ id: number }>();
  if (!b) return c.notFound();
  if (await isSaved(c.env.DB, u.id, b.id)) await c.env.DB.prepare(`DELETE FROM saved WHERE user_id = ? AND business_id = ?`).bind(u.id, b.id).run();
  else {
    const n = await c.env.DB.prepare(`SELECT count(*) AS n FROM saved WHERE user_id = ?`).bind(u.id).first<{ n: number }>();
    if ((n?.n ?? 0) < 200) await c.env.DB.prepare(`INSERT OR IGNORE INTO saved (user_id, business_id, created_at) VALUES (?, ?, ?)`).bind(u.id, b.id, now()).run();
  }
  return c.redirect((await c.req.parseBody()).back === "saved" ? "/saved" : `/b/${slug}`, 303);
});

reviews.get("/saved", async (c) => {
  const u = c.get("user");
  if (!u) return c.redirect("/login?next=%2Fsaved", 302);
  const rows = (await c.env.DB.prepare(`SELECT b.id, b.slug, b.name, b.city, b.owner_id, b.plan, b.plan_expires, b.logo_image, b.gst,
      (SELECT group_concat(type) FROM business_types t WHERE t.business_id = b.id) AS types
    FROM saved s JOIN businesses b ON b.id = s.business_id WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 200`).bind(u.id).all<Card>()).results;
  return page(c, { title: "Saved listings", noindex: true }, (
    <main class="wrap" style="padding-top:24px">
      <h1 style="font-size:24px">Saved listings</h1>
      <p class="small muted">Your private shortlist. Only you can see it.</p>
      {rows.length === 0
        ? <div class="card small">Nothing saved yet. Open any business and tap <b>Save</b> to keep it here. <a class="gold" href="/directory">Browse the directory</a></div>
        : <div class="grid g3" style="margin-top:12px">{rows.map((b) => <BizCard b={b} />)}</div>}
    </main>
  ));
});
