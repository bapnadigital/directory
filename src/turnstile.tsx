/** @jsxImportSource hono/jsx */
import type { Context } from "hono";
import type { AppEnv } from "./auth";

// Cloudflare Turnstile bot check. Does nothing until TURNSTILE_SITE_KEY and TURNSTILE_SECRET are set.
export function Turnstile({ c }: { c: Context<AppEnv> }) {
  const key = c.env.TURNSTILE_SITE_KEY;
  if (!key || !c.env.TURNSTILE_SECRET) return <></>;
  return <><div class="cf-turnstile" data-sitekey={key} data-theme="light" style="margin:10px 0" /><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer /></>;
}

export async function humanOk(c: Context<AppEnv>, form: Record<string, unknown>): Promise<boolean> {
  const secret = c.env.TURNSTILE_SECRET;
  if (!secret || !c.env.TURNSTILE_SITE_KEY) return true;
  const token = String(form["cf-turnstile-response"] ?? "");
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: c.req.header("cf-connecting-ip") ?? "" });
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(6000) });
    return ((await r.json()) as { success?: boolean }).success === true;
  } catch { return true; } // if the check itself is down, do not lock people out
}
export const BOT_MSG = "Please tick the \"I am human\" box and try again";
