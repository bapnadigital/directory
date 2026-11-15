import type { Env } from "./db";

/** Best-effort transactional email from the site's own domain. Never throws. */
export async function sendMail(env: Env, reqUrl: string, to: string | null | undefined, subject: string, text: string): Promise<boolean> {
  if (!env.EMAIL || !to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return false;
  const host = new URL(env.SITE_URL || reqUrl).hostname.replace(/^www\./, "");
  if (host.endsWith("workers.dev") || host === "localhost") return false;
  try { await env.EMAIL.send({ to, from: `notify@${host}`, subject, text }); return true; } catch (e) { console.error("mail", e); return false; }
}
