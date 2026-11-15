import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { type Env, now } from "./db";

export type User = { id: number; email: string; name: string; phone: string | null; is_admin: number };
export type AppEnv = { Bindings: Env; Variables: { user: User | null } };

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer | Uint8Array) =>
  [...(buf instanceof Uint8Array ? buf : new Uint8Array(buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => new Uint8Array((s.match(/../g) ?? []).map((h) => parseInt(h, 16)));

const ITERATIONS = 100_000;

async function pbkdf2(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  return hex(bits);
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await pbkdf2(password, salt), salt: hex(salt) };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const got = await pbkdf2(password, unhex(salt));
  if (got.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

async function sha256(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

const COOKIE = "sid";
const SESSION_DAYS = 30;

export async function startSession(c: Context<AppEnv>, userId: number): Promise<void> {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const t = now();
  await c.env.DB.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
    .bind(await sha256(token), userId, t + SESSION_DAYS * 86400, t).run();
  const secure = new URL(c.req.url).protocol === "https:";
  setCookie(c, COOKIE, token, { httpOnly: true, secure, sameSite: "Lax", path: "/", maxAge: SESSION_DAYS * 86400 });
}

export async function endSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(await sha256(token)).run();
  deleteCookie(c, COOKIE, { path: "/" });
}

/** Loads the signed-in user (if any) and blocks cross-site form posts. */
export async function sessionMiddleware(c: Context<AppEnv>, next: Next) {
  c.set("user", null);
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin") ?? c.req.header("referer");
    let ok = false;
    try { ok = !!origin && new URL(origin).host === new URL(c.req.url).host; } catch { ok = false; }
    if (!ok) return c.text("Cross-site request blocked", 403);
  }
  const token = getCookie(c, COOKIE);
  if (token && /^[0-9a-f]{64}$/.test(token)) {
    const row = await c.env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.phone, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    ).bind(await sha256(token), now()).first<User>();
    if (row) c.set("user", row);
  }
  await next();
}

export async function requireUser(c: Context<AppEnv>, next: Next) {
  if (!c.get("user")) return c.redirect(`/login?next=${encodeURIComponent(new URL(c.req.url).pathname)}`);
  await next();
}

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const u = c.get("user");
  if (!u) return c.redirect("/login?next=/admin");
  if (!u.is_admin) return c.text("Admins only", 403);
  await next();
}

export function clientIp(c: Context<AppEnv>): string {
  return c.req.header("cf-connecting-ip") ?? "local";
}
