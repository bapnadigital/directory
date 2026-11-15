import { type Env, getMeta, now, setMeta } from "./db";
import { sendMail } from "./mail";
import { getRates, inr, keyRates, perGram, RATE_SOURCE } from "./rates";

// Daily rate email: double opt-in sign-up, one mail on trading days around 11 am IST.
export const newToken = () => [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function subscribe(env: Env, reqUrl: string, email: string): Promise<void> {
  const base = (env.SITE_URL || new URL(reqUrl).origin).replace(/\/$/, "");
  const row = await env.DB.prepare(`SELECT token, confirmed FROM rate_subs WHERE email = ?`).bind(email).first<{ token: string; confirmed: number }>();
  if (row?.confirmed) return; // already on the list; say nothing more
  const token = row?.token ?? newToken();
  if (!row) await env.DB.prepare(`INSERT INTO rate_subs (email, token, created_at) VALUES (?, ?, ?)`).bind(email, token, now()).run();
  await sendMail(env, reqUrl, email, `Confirm your daily gold rate email`, `Someone asked for the daily gold and silver rate email from ${env.BRAND_NAME} at this address.\n\nTo confirm, open this link:\n${base}/rates/confirm?t=${token}\n\nIf this was not you, ignore this email and you will hear nothing more.`);
}

export async function dailyRates(env: Env): Promise<void> {
  if (!env.SITE_URL) return;
  const ist = new Date(Date.now() + 5.5 * 3600000);
  if (ist.getUTCDay() === 0 || ist.getUTCHours() !== 11) return; // Monday to Saturday, 11 am hour IST
  const day = ist.toISOString().slice(0, 10);
  if ((await getMeta(env, "rate_mail_day")) === day) return;
  const r = await getRates(env);
  if (!r || r.stale) return; // try again next minute within the hour
  await setMeta(env, "rate_mail_day", day);
  const k = keyRates(r), g = perGram(k), base = env.SITE_URL.replace(/\/$/, "");
  const subs = (await env.DB.prepare(`SELECT email, token FROM rate_subs WHERE confirmed = 1 ORDER BY id LIMIT 400`).all<{ email: string; token: string }>()).results;
  const nice = new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const lines = [
    `Gold 995 with GST: ${inr(k.gold995gst)} per 10 g`,
    `Gold 995 without GST: ${inr(k.gold995)} per 10 g`,
    g ? `24K per gram (with GST): ${inr(g.k24)}` : "",
    g ? `22K per gram (with GST): ${inr(g.k22)}` : "",
    g ? `18K per gram (with GST): ${inr(g.k18)}` : "",
    `Silver with GST: ${inr(k.silverGst)} per kg`,
    k.goldUsd != null ? `International gold: $${k.goldUsd} per oz` : "",
  ].filter(Boolean).join("\n");
  for (const s of subs) {
    await sendMail(env, base, s.email, `Gold ${inr(k.gold995gst)} · Silver ${inr(k.silverGst)} — ${nice}`,
      `Rates at 11 am, ${nice} (Mumbai)\n\n${lines}\n\nLive rates and calculators: ${base}/rates\nRates by ${RATE_SOURCE.name}: ${RATE_SOURCE.url}\n\nIndicative rates for reference only. Confirm with your dealer before booking.\n\nStop this email: ${base}/rates/unsubscribe?t=${s.token}`);
  }
}

// Target-rate alerts for signed-in members: one email when the rate crosses the target, then the alert is spent.
export const ALERT_METALS = { gold: "Gold 995 with GST (per 10 g)", silver: "Silver with GST (per kg)" } as const;
export async function checkAlerts(env: Env): Promise<void> {
  if (!env.SITE_URL) return;
  const open = await env.DB.prepare(`SELECT count(*) AS n FROM rate_alerts WHERE fired_at IS NULL`).first<{ n: number }>();
  if (!open?.n) return;
  const r = await getRates(env);
  if (!r || r.stale) return;
  const k = keyRates(r), base = env.SITE_URL.replace(/\/$/, "");
  const cur = { gold: k.gold995gst, silver: k.silverGst };
  const hits = (await env.DB.prepare(`SELECT a.id, a.metal, a.dir, a.target, u.email, u.name FROM rate_alerts a JOIN users u ON u.id = a.user_id
    WHERE a.fired_at IS NULL AND ((a.metal = 'gold' AND ?1 IS NOT NULL AND ((a.dir = 'above' AND ?1 >= a.target) OR (a.dir = 'below' AND ?1 <= a.target)))
      OR (a.metal = 'silver' AND ?2 IS NOT NULL AND ((a.dir = 'above' AND ?2 >= a.target) OR (a.dir = 'below' AND ?2 <= a.target)))) LIMIT 40`)
    .bind(cur.gold, cur.silver).all<{ id: number; metal: "gold" | "silver"; dir: string; target: number; email: string; name: string }>()).results;
  for (const h of hits) {
    await env.DB.prepare(`UPDATE rate_alerts SET fired_at = ? WHERE id = ? AND fired_at IS NULL`).bind(now(), h.id).run();
    await sendMail(env, base, h.email, `Rate alert: ${h.metal === "gold" ? "gold" : "silver"} is ${h.dir} ${inr(h.target)}`,
      `Hello ${h.name},\n\n${ALERT_METALS[h.metal]} is now ${inr(cur[h.metal])}, ${h.dir} your target of ${inr(h.target)}.\n\nLive rates: ${base}/rates\nRates by ${RATE_SOURCE.name}: ${RATE_SOURCE.url}\n\nIndicative rates for reference only. This alert has now been used; set a new one at ${base}/rates#alerts`);
  }
}
