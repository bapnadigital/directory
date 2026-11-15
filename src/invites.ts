import { type Env, getMeta, now, setMeta } from "./db";
import { sendMail } from "./mail";

// Claim invitations to unclaimed listings that have an email on record.
// Nothing is sent until the admin sets a number to send; the cron then sends a few a minute.
const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, "0")).join("");
async function salt(env: Env) {
  let v = await getMeta(env, "invite_salt");
  if (!v) { v = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join(""); await setMeta(env, "invite_salt", v); }
  return v;
}
export const optToken = async (env: Env, email: string) => (await sha(`${email.toLowerCase()}:${await salt(env)}`)).slice(0, 24);

export const inviteText = (brand: string, base: string, name: string, slug: string, optUrl: string) => ({
  subject: `${name} is listed on ${brand} — claim it free`,
  text: `Hello,\n\n${name} is listed on ${brand}, a trade directory for India's jewellery, bullion and allied businesses run by the Jewellery Sahi Hai coalition.\n\nYour listing: ${base}/b/${slug}\n\nClaiming it is free and takes two minutes. Once claimed you can:\n• correct your details and add your logo, photos and catalogue\n• receive buyer enquiries by email and WhatsApp\n• collect customer reviews\n• see buy requirements posted by the trade\n\nClaim your listing: ${base}/signup?next=${encodeURIComponent(`/dashboard/claim?b=${slug}`)}\n\nIf this is not your business, or you want the listing corrected or removed, use the "Report this listing" link on the page.\n\nRegards,\n${brand}\n${base}\n\nYou received this one-time invitation because this address is published as the business contact for the listing. To get no further email from us: ${optUrl}`,
});

const ELIGIBLE = `FROM private_contacts p JOIN businesses b ON b.id = p.business_id
  WHERE b.owner_id IS NULL AND p.email LIKE '%_@_%._%' AND NOT EXISTS (SELECT 1 FROM invites i WHERE i.email = lower(p.email)) AND NOT EXISTS (SELECT 1 FROM mail_optout o WHERE o.email = lower(p.email))`;

export async function inviteStats(env: Env) {
  const r = await env.DB.prepare(`SELECT (SELECT count(DISTINCT lower(p.email)) ${ELIGIBLE}) AS eligible, (SELECT count(*) FROM invites) AS sent, (SELECT count(*) FROM mail_optout) AS optout,
    (SELECT count(*) FROM invites i JOIN businesses b ON b.id = i.business_id WHERE b.owner_id IS NOT NULL) AS claimed`).first<{ eligible: number; sent: number; optout: number; claimed: number }>();
  return { ...(r ?? { eligible: 0, sent: 0, optout: 0, claimed: 0 }), budget: Number((await getMeta(env, "invite_budget")) ?? 0) };
}

export async function sendInvites(env: Env): Promise<void> {
  if (!env.SITE_URL || !env.EMAIL) return;
  const budget = Number((await getMeta(env, "invite_budget")) ?? 0);
  if (budget <= 0) return;
  const n = Math.min(budget, 10);
  const rows = (await env.DB.prepare(`SELECT b.id, b.slug, b.name, lower(p.email) AS email ${ELIGIBLE} GROUP BY lower(p.email) ORDER BY b.id LIMIT ?`).bind(n).all<{ id: number; slug: string; name: string; email: string }>()).results;
  if (!rows.length) { await setMeta(env, "invite_budget", "0"); return; }
  await setMeta(env, "invite_budget", String(Math.max(0, budget - rows.length)));
  const base = env.SITE_URL.replace(/\/$/, "");
  for (const r of rows) {
    // Record first, so a failure can never cause a second email to the same address.
    await env.DB.prepare(`INSERT OR IGNORE INTO invites (email, business_id, sent_at, ok) VALUES (?, ?, ?, 0)`).bind(r.email, r.id, now()).run();
    const m = inviteText(env.BRAND_NAME, base, r.name, r.slug, `${base}/optout?e=${encodeURIComponent(r.email)}&t=${await optToken(env, r.email)}`);
    const ok = await sendMail(env, base, r.email, m.subject, m.text);
    if (ok) await env.DB.prepare(`UPDATE invites SET ok = 1 WHERE email = ?`).bind(r.email).run();
  }
}
