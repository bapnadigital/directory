/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv, User } from "../auth";
import { allow, now } from "../db";
import { GLYPHS, GLYPH_H, GLYPH_W } from "../glyphs";

// Paid-member contact reveal. Numbers and emails are never written into a page:
// a member reveals one listing at a time (daily cap, burst limit, every reveal
// logged) and the details are then drawn as a picture, not text.
export const DAILY_REVEALS = 30;
const BURST = 6; // reveals allowed per minute before the account is paused for the day
const BOT_UA = /bot|crawl|spider|scrap|python|curl|wget|httpclient|okhttp|axios|node-fetch|go-http|java\/|headless|phantom|selenium|playwright|puppeteer|gpt|openai|claude|anthropic|perplexity|bytespider|ccbot|cohere|diffbot|ai2|amazonbot|applebot-extended|google-extended|meta-external/i;

export const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10); // India date
type C = Context<AppEnv>;

export async function isPaidMember(db: D1Database, u: User | null): Promise<boolean> {
  if (!u) return false;
  if (u.is_admin) return true;
  const r = await db.prepare(`SELECT 1 AS ok FROM businesses WHERE owner_id = ? AND plan = 'premium' AND (plan_expires IS NULL OR plan_expires > ?) LIMIT 1`).bind(u.id, now()).first();
  return !!r;
}
export const looksAutomated = (c: C) => {
  const ua = c.req.header("user-agent") ?? "";
  return ua.length < 20 || BOT_UA.test(ua) || !c.req.header("accept-language");
};
export async function hasReveal(db: D1Database, userId: number, businessId: number) {
  return !!(await db.prepare(`SELECT 1 AS ok FROM reveals WHERE user_id = ? AND business_id = ? AND day = ?`).bind(userId, businessId, today()).first());
}
export async function revealsToday(db: D1Database, userId: number) {
  return (await db.prepare(`SELECT count(*) AS n FROM reveals WHERE user_id = ? AND day = ?`).bind(userId, today()).first<{ n: number }>())?.n ?? 0;
}

/** Draw text as filled pixels (no text in the output). */
function drawSvg(lines: string[], scale = 1): string {
  const cols = Math.max(1, ...lines.map((l) => l.length));
  const w = cols * GLYPH_W + 8, h = lines.length * (GLYPH_H + 2) + 6;
  let d = "";
  lines.forEach((line, li) => {
    for (let ci = 0; ci < line.length; ci++) {
      const g = GLYPHS[line[ci]] ?? GLYPHS["?"];
      const ox = 4 + ci * GLYPH_W, oy = 3 + li * (GLYPH_H + 2);
      for (let y = 0; y < GLYPH_H; y++) {
        const bits = parseInt(g[y], 16);
        if (!bits) continue;
        let x = 0;
        while (x < GLYPH_W) {
          if (bits & (1 << (GLYPH_W - 1 - x))) { let run = 1; while (x + run < GLYPH_W && bits & (1 << (GLYPH_W - 1 - x - run))) run++; d += `M${ox + x} ${oy + y}h${run}v1h-${run}z`; x += run; } else x++;
        }
      }
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}"><path fill="#e9c46a" d="${d}"/></svg>`;
}
const wrap = (s: string, n = 30) => { const out: string[] = []; for (const part of s.split(/\s*[,/]\s*/).filter(Boolean)) for (let i = 0; i < part.length; i += n) out.push(part.slice(i, i + n)); return out.slice(0, 6); };

export const contact = new Hono<AppEnv>();

contact.post("/b/:slug/contact", async (c) => {
  const slug = c.req.param("slug").toLowerCase();
  const back = (msg?: string) => c.redirect(`/b/${slug}${msg ? `?cerr=${encodeURIComponent(msg)}` : ""}#contact`, 303);
  const u = c.get("user");
  if (!u) return c.redirect(`/login?next=${encodeURIComponent(`/b/${slug}`)}`, 303);
  const db = c.env.DB;
  if (!(await isPaidMember(db, u))) return c.redirect("/pricing?need=contact", 303);
  if (looksAutomated(c)) return back("Contact details can only be opened from a normal browser.");
  const b = await db.prepare(`SELECT id FROM businesses WHERE slug = ?`).bind(slug).first<{ id: number }>();
  if (!b) return c.notFound();
  if (await hasReveal(db, u.id, b.id)) return back();
  if ((await db.prepare(`SELECT value FROM meta WHERE key = ?`).bind(`paused:${u.id}:${today()}`).first())) return back("Contact viewing is paused on your account for today because of unusually fast activity.");
  if (!(await allow(c.env, `rv:${u.id}`, BURST, 60))) {
    await db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`).bind(`paused:${u.id}:${today()}`, String(now())).run();
    return back("Contact viewing is paused on your account for today because of unusually fast activity.");
  }
  if ((await revealsToday(db, u.id)) >= DAILY_REVEALS) return back(`You have opened ${DAILY_REVEALS} contacts today, which is the daily limit. It resets at midnight.`);
  await db.prepare(`INSERT OR IGNORE INTO reveals (user_id, business_id, day, created_at) VALUES (?, ?, ?, ?)`).bind(u.id, b.id, today(), now()).run();
  return back();
});

contact.get("/b/:slug/contact.svg", async (c) => {
  const u = c.get("user");
  const deny = () => c.body(null, 403);
  if (!u || looksAutomated(c)) return deny();
  const db = c.env.DB;
  const row = await db.prepare(`SELECT b.id, p.mobile, p.tel, p.email FROM businesses b JOIN private_contacts p ON p.business_id = b.id WHERE b.slug = ?`)
    .bind(c.req.param("slug").toLowerCase()).first<{ id: number; mobile: string | null; tel: string | null; email: string | null }>();
  if (!row || !(await isPaidMember(db, u)) || !(await hasReveal(db, u.id, row.id))) return deny();
  const f = c.req.query("f");
  const val = f === "email" ? row.email : f === "tel" ? row.tel : row.mobile;
  if (!val) return deny();
  return c.body(drawSvg(wrap(val)), 200, { "content-type": "image/svg+xml", "cache-control": "private, no-store", "x-robots-tag": "noindex, noarchive, noai" });
});

contact.get("/b/:slug/call", async (c) => {
  const u = c.get("user");
  const slug = c.req.param("slug").toLowerCase();
  if (!u || looksAutomated(c)) return c.redirect(`/b/${slug}#contact`, 303);
  const row = await c.env.DB.prepare(`SELECT b.id, p.mobile, p.tel FROM businesses b JOIN private_contacts p ON p.business_id = b.id WHERE b.slug = ?`).bind(slug).first<{ id: number; mobile: string | null; tel: string | null }>();
  if (!row || !(await isPaidMember(c.env.DB, u)) || !(await hasReveal(c.env.DB, u.id, row.id))) return c.redirect(`/b/${slug}#contact`, 303);
  const first = ((row.mobile || row.tel || "").split(/[,/]/)[0] ?? "").replace(/[^\d+]/g, "");
  if (!first) return c.redirect(`/b/${slug}#contact`, 303);
  return c.redirect(`tel:${first.length === 10 ? `+91${first}` : first}`, 302);
});
