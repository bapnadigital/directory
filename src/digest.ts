import { type Env, getMeta, now, setMeta } from "./db";
import { sendMail } from "./mail";

// Weekly email of new buy requirements to owners of claimed listings.
const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, "0")).join("");
export const digestToken = async (userId: number, salt: string) => (await sha(`${userId}:${salt}:digest`)).slice(0, 24);

export async function weeklyDigest(env: Env): Promise<void> {
  if (!env.SITE_URL) return; // only once the site's public address is set
  const ist = new Date(Date.now() + 5.5 * 3600000);
  if (ist.getUTCDay() !== 1 || ist.getUTCHours() < 10) return; // Mondays after 10 am IST
  const week = ist.toISOString().slice(0, 10);
  if ((await getMeta(env, "digest_week")) === week) return;
  await setMeta(env, "digest_week", week);
  const reqs = (await env.DB.prepare(`SELECT id, title, qty, city FROM requests WHERE status = 'open' AND created_at > ? ORDER BY created_at DESC LIMIT 12`).bind(now() - 7 * 86400).all<{ id: number; title: string; qty: string | null; city: string | null }>()).results;
  if (!reqs.length) return;
  const owners = (await env.DB.prepare(`SELECT DISTINCT u.id, u.email, u.name, u.pass_salt FROM users u JOIN businesses b ON b.owner_id = u.id WHERE coalesce(u.digest_off, 0) = 0 LIMIT 150`).all<{ id: number; email: string; name: string; pass_salt: string }>()).results;
  const base = env.SITE_URL.replace(/\/$/, "");
  const list = reqs.map((r) => `• ${r.title}${r.qty ? ` (${r.qty})` : ""}${r.city ? `, ${r.city}` : ""}\n  ${base}/requirements/${r.id}`).join("\n");
  for (const o of owners) {
    await sendMail(env, base, o.email, `${reqs.length} new posts on the trade board this week`, `Hello ${o.name},\n\nThe trade posted these requirements, offers and jobs on ${env.BRAND_NAME} this week. Sign in to see each name and number.\n\n${list}\n\nAll open requirements: ${base}/requirements\n\nTo stop these weekly emails: ${base}/unsubscribe?u=${o.id}&t=${await digestToken(o.id, o.pass_salt)}`);
  }
}
