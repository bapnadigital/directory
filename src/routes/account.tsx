/** @jsxImportSource hono/jsx */
import { Hono, type Context } from "hono";
import type { Child } from "hono/jsx";
import { type AppEnv, clientIp, endSession, hashPassword, requireUser, startSession, verifyPassword } from "../auth";
import { type Business, type PlanKey, PLANS, allow, isPremium, limits, now, slugify, cacheBust } from "../db";
import { CITIES, THEMES, TRADE_TYPES, safeUrl, stateFromGst } from "../content";
import { Field, Flash, page, siteUrl } from "../ui";

export const account = new Hono<AppEnv>();
type C = Context<AppEnv>;

const str = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const nul = (v: unknown, max = 200) => str(v, max) || null;
const MAX_IMAGE = 600 * 1024;
const go = (c: C, path: string, msg?: string, isErr = false) =>
  c.redirect(msg ? `${path}${path.includes("?") ? "&" : "?"}${isErr ? "err" : "ok"}=${encodeURIComponent(msg)}` : path, 303);
const safeNext = (n?: string) => (n && /^\/[a-zA-Z0-9/_\-?=&%.]*$/.test(n) && !n.startsWith("//") ? n : "/dashboard");

// ───────────────────────── Sign up / in / out ─────────────────────────
function authPage(c: C, mode: "login" | "signup") {
  const next = safeNext(c.req.query("next"));
  return page(c, { title: mode === "login" ? "Sign in" : "Create your account", noindex: true }, (
    <main class="wrap" style="max-width:440px;padding-top:48px">
      <div class="card">
        <h1 style="font-size:24px;margin-bottom:14px">{mode === "login" ? "Sign in" : "Create your account"}</h1>
        <Flash err={c.req.query("err")} ok={c.req.query("ok")} />
        <form method="post" action={`/${mode}`}>
          <input type="hidden" name="next" value={next} />
          {mode === "signup" && <Field label="Your name" name="name" required max={80} />}
          <Field label="Email" name="email" type="email" required max={160} />
          {mode === "signup" && <Field label="Mobile number" name="phone" type="tel" required max={16} />}
          <Field label="Password" name="password" type="password" required max={128} hint={mode === "signup" ? "At least 8 characters" : undefined} />
          <button class="btn block" type="submit">{mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <p class="small muted center" style="margin-bottom:0">
          {mode === "login" ? <>New here? <a class="gold" href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</a></> : <>Already have an account? <a class="gold" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</a></>}
        </p>
      </div>
    </main>
  ));
}
account.get("/login", (c) => (c.get("user") ? c.redirect("/dashboard") : authPage(c, "login")));
account.get("/signup", (c) => (c.get("user") ? c.redirect("/dashboard") : authPage(c, "signup")));

account.post("/signup", async (c) => {
  const f = await c.req.parseBody();
  const name = str(f.name, 80), email = str(f.email, 160).toLowerCase(), phone = str(f.phone, 16).replace(/[^\d+]/g, ""), password = String(f.password ?? "");
  const next = safeNext(str(f.next, 200));
  const fail = (m: string) => go(c, `/signup?next=${encodeURIComponent(next)}`, m, true);
  if (name.length < 2) return fail("Please enter your name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail("Please enter a valid email");
  if (phone.replace(/\D/g, "").length < 10) return fail("Please enter a valid mobile number");
  if (password.length < 8 || password.length > 128) return fail("Password must be at least 8 characters");
  if (!(await allow(c.env, `signup:${clientIp(c)}`, 5, 3600))) return fail("Too many attempts. Please try again later.");
  if (await c.env.DB.prepare(`SELECT 1 FROM users WHERE email = ?`).bind(email).first()) return fail("An account with this email already exists. Please sign in.");
  const { hash, salt } = await hashPassword(password);
  // The very first account becomes the site admin.
  const first = !(await c.env.DB.prepare(`SELECT 1 FROM users LIMIT 1`).first());
  const r = await c.env.DB.prepare(`INSERT INTO users (email, name, phone, pass_hash, pass_salt, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(email, name, phone, hash, salt, first ? 1 : 0, now()).run();
  await startSession(c, Number(r.meta.last_row_id));
  return c.redirect(next, 303);
});

account.post("/login", async (c) => {
  const f = await c.req.parseBody();
  const email = str(f.email, 160).toLowerCase(), password = String(f.password ?? "");
  const next = safeNext(str(f.next, 200));
  const fail = (m: string) => go(c, `/login?next=${encodeURIComponent(next)}`, m, true);
  if (!(await allow(c.env, `login:${clientIp(c)}:${email}`, 10, 900))) return fail("Too many attempts. Please wait 15 minutes.");
  const u = await c.env.DB.prepare(`SELECT id, pass_hash, pass_salt FROM users WHERE email = ?`).bind(email).first<{ id: number; pass_hash: string; pass_salt: string }>();
  if (!u || !(await verifyPassword(password, u.pass_hash, u.pass_salt))) return fail("Wrong email or password");
  await startSession(c, u.id);
  return c.redirect(next, 303);
});

account.post("/logout", async (c) => { await endSession(c); return c.redirect("/", 303); });

// ───────────────────────── Dashboard shell ─────────────────────────
account.use("/dashboard/*", requireUser);
account.use("/dashboard", requireUser);

async function myBiz(c: C): Promise<Business | null> {
  return c.env.DB.prepare(`SELECT * FROM businesses WHERE owner_id = ? ORDER BY id LIMIT 1`).bind(c.get("user")!.id).first<Business>();
}

const NAV = [["/dashboard", "Overview"], ["/dashboard/profile", "Business profile"], ["/dashboard/products", "Catalogue"], ["/dashboard/links", "Bio link"], ["/dashboard/extras", "Photos, offers, FAQs"], ["/dashboard/enquiries", "Enquiries"], ["/dashboard/reviews", "Reviews"], ["/dashboard/membership", "Membership"], ["/saved", "Saved listings"]] as const;

function shell(c: C, title: string, body: Child) {
  const path = new URL(c.req.url).pathname;
  const u = c.get("user")!;
  return page(c, { title, noindex: true }, (
    <main class="wrap" style="padding-top:24px">
      <div class="layout dash">
        <aside class="card side">
          {NAV.map(([href, label]) => <a href={href} class={path === href ? "on" : ""}>{label}</a>)}
          {u.is_admin ? <a href="/admin">Admin</a> : null}
          <form method="post" action="/logout" style="margin-top:8px"><button class="btn ghost sm block" type="submit">Sign out</button></form>
        </aside>
        <div>
          <h1 style="font-size:26px;margin-bottom:14px">{title}</h1>
          <Flash ok={c.req.query("ok")} err={c.req.query("err")} />
          {body}
        </div>
      </div>
    </main>
  ));
}

function needBiz(c: C) {
  return shell(c, "Set up your business", (
    <div class="card">
      <p>You don't have a business listing yet.</p>
      <div class="row"><a class="btn" href="/dashboard/claim">Find and claim my business</a><a class="btn ghost" href="/dashboard/new">Add a new business</a></div>
    </div>
  ));
}

account.get("/dashboard", async (c) => {
  const b = await myBiz(c);
  if (!b) {
    const pending = await c.env.DB.prepare(`SELECT b.name FROM claims c JOIN businesses b ON b.id = c.business_id WHERE c.user_id = ? AND c.status = 'pending'`).bind(c.get("user")!.id).first<{ name: string }>();
    if (pending) return shell(c, "Claim under review", <div class="card">Your claim for <b>{pending.name}</b> is being reviewed. You'll get full access once it's approved.</div>);
    return needBiz(c);
  }
  const db = c.env.DB;
  const [p, l, e, clicks] = await Promise.all([
    db.prepare(`SELECT count(*) AS n FROM products WHERE business_id = ?`).bind(b.id).first<{ n: number }>(),
    db.prepare(`SELECT count(*) AS n FROM links WHERE business_id = ?`).bind(b.id).first<{ n: number }>(),
    db.prepare(`SELECT count(*) AS n FROM enquiries WHERE business_id = ? AND status = 'new'`).bind(b.id).first<{ n: number }>(),
    db.prepare(`SELECT (SELECT coalesce(sum(clicks),0) FROM products WHERE business_id = ?1) + (SELECT coalesce(sum(clicks),0) FROM links WHERE business_id = ?1) AS n`).bind(b.id).first<{ n: number }>(),
  ]);
  const base = siteUrl(c);
  const reqs = (await db.prepare(`SELECT id, title, qty, city FROM requests WHERE status = 'open' AND created_at > ? ORDER BY created_at DESC LIMIT 4`).bind(now() - 30 * 86400).all<{ id: number; title: string; qty: string | null; city: string | null }>()).results;
  return shell(c, b.name, (
    <div class="stack">
      <div class="grid g4">
        <div class="card stat"><b>{b.views}</b><span class="small muted">Profile views</span></div>
        <div class="card stat"><b>{clicks?.n ?? 0}</b><span class="small muted">Clicks</span></div>
        <div class="card stat"><b>{e?.n ?? 0}</b><span class="small muted">New enquiries</span></div>
        <div class="card stat"><b>{isPremium(b) ? "Premium" : "Free"}</b><span class="small muted">Plan</span></div>
      </div>
      <div class="card stack">
        <div><b>Your public pages</b></div>
        {([["Business profile", `/b/${b.slug}`], ["Catalogue", `/b/${b.slug}/catalogue`], ["Bio link (for Instagram / WhatsApp)", `/bio/${b.slug}`]] as const).map(([label, path]) => (
          <div class="row between"><span class="small">{label}: <a class="gold" href={path} target="_blank">{base}{path}</a></span><button class="btn ghost sm" data-copy={`${base}${path}`}>Copy</button></div>
        ))}
        <div class="row"><a class="btn ghost sm" href={`/b/${b.slug}/qr.svg`} target="_blank">Download QR code</a></div>
      </div>
      {(() => {
        const steps: [boolean, string, string][] = [
          [!!b.logo_image, "Add your logo", "/dashboard/profile"], [!!b.about, "Write an About section", "/dashboard/profile"],
          [!!(b.phone || b.whatsapp), "Add your phone or WhatsApp number", "/dashboard/profile"], [!!b.address, "Add your address and hours", "/dashboard/profile"],
          [(p?.n ?? 0) > 0, "Add your first product", "/dashboard/products"], [(l?.n ?? 0) > 0, "Add links to your bio page", "/dashboard/links"],
        ];
        const done = steps.filter((x) => x[0]).length, pct = Math.round((done / steps.length) * 100);
        return (
          <div class="card">
            <div class="row between"><b>Your listing is {pct}% complete</b><span class="small muted">{done} of {steps.length} done</span></div>
            <div style="height:8px;border-radius:99px;background:var(--surface2);margin:10px 0;overflow:hidden"><div style={`height:100%;width:${pct}%;background:var(--gold-bg)`} /></div>
            <ul class="todo small" style="list-style:none;padding:0;margin:0">{steps.map(([ok, label, href]) => <li>{ok ? <span class="done">✓ {label}</span> : <a class="gold" href={href}>○ {label} →</a>}</li>)}</ul>
            <p class="tiny muted" style="margin-bottom:0">Complete listings appear more trustworthy to buyers. Then share your bio link on WhatsApp and Instagram.</p>
          </div>
        );
      })()}
      {reqs.length > 0 && (
        <div class="card"><div class="row between"><b>New buy requirements</b><a class="gold small" href="/requirements">See all →</a></div>
          {reqs.map((r) => <a style="display:block;padding:8px 0;border-top:1px solid var(--border);margin-top:8px" href={`/requirements/${r.id}`}><span class="small">{r.title}</span><div class="tiny muted">{[r.qty, r.city].filter(Boolean).join(" · ")}</div></a>)}
        </div>
      )}
    </div>
  ));
});

// ───────────────────────── Claim / create ─────────────────────────
account.get("/dashboard/claim", async (c) => {
  if (await myBiz(c)) return c.redirect("/dashboard");
  const slug = str(c.req.query("b"), 80), q = str(c.req.query("q"), 60);
  const db = c.env.DB;
  const b = slug ? await db.prepare(`SELECT id, slug, name, city, gst, owner_id FROM businesses WHERE slug = ?`).bind(slug).first<{ id: number; slug: string; name: string; city: string | null; gst: string | null; owner_id: number | null }>() : null;
  const results = !b && q.length >= 3
    ? (await db.prepare(`SELECT slug, name, city, gst FROM businesses WHERE owner_id IS NULL AND (name LIKE ? OR gst LIKE ?) ORDER BY name LIMIT 20`).bind(`%${q}%`, `%${q.toUpperCase()}%`).all<{ slug: string; name: string; city: string | null; gst: string | null }>()).results
    : [];
  const rec = b && !b.owner_id ? await db.prepare(`SELECT email FROM private_contacts WHERE business_id = ?`).bind(b.id).first<{ email: string | null }>() : null;
  const recEmail = firstEmail(rec?.email);
  const codeSent = c.req.query("sent") === "1";
  return shell(c, "Claim your business", b ? (
    b.owner_id ? <div class="card">This listing has already been claimed. If that's a mistake, <a class="gold" href={`/b/${b.slug}/report`}>report it</a>.</div> : (
      <div class="stack">
        <div class="card"><b>{b.name}</b><br /><span class="small muted">{b.city} {b.gst ? `· GSTIN ${b.gst}` : ""}</span></div>
        {recEmail && c.env.EMAIL && (
          <div class="card">
            <h2 style="font-size:18px">Option 1: verify by email (instant)</h2>
            <p class="small muted">We send a 6-digit code to the email address on record for this business: <b>{maskEmail(recEmail)}</b></p>
            {codeSent ? (
              <form method="post" action="/dashboard/claim/verify">
                <input type="hidden" name="b" value={b.slug} />
                <label>6-digit code<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength={6} required autocomplete="one-time-code" /></label>
                <button class="btn" type="submit">Verify and claim</button>
                <p class="tiny muted">The code is valid for 15 minutes.</p>
              </form>
            ) : null}
            <form method="post" action="/dashboard/claim/send"><input type="hidden" name="b" value={b.slug} /><button class={codeSent ? "btn ghost sm" : "btn"} type="submit">{codeSent ? "Send a new code" : "Send code"}</button></form>
          </div>
        )}
        <div class="card">
          <h2 style="font-size:18px">{recEmail && c.env.EMAIL ? "Option 2: upload your GST certificate" : "Verify with your GST certificate"}</h2>
          <form method="post" action="/dashboard/claim" enctype="multipart/form-data">
            <input type="hidden" name="b" value={b.slug} />
            <Field label="Your role in the business" name="role" placeholder="Owner / Partner / Director / Manager" required max={60} />
            <Field label="Phone number registered with the business" name="phone" type="tel" required max={16} />
            <label>GST registration certificate (photo or PDF, under 600 KB)<input type="file" name="doc" accept="image/jpeg,image/png,image/webp,application/pdf" data-resize="1600" required /></label>
            <Field label="Anything else that helps us verify (optional)" name="note" area max={500} />
            <button class="btn" type="submit">Submit claim</button>
            <p class="tiny muted">The certificate is seen only by our verification team and is never shown publicly. We check that the GSTIN and trade name match this listing.</p>
          </form>
        </div>
      </div>
    )
  ) : (
    <div class="card">
      <form method="get" action="/dashboard/claim" class="row"><input name="q" value={q} placeholder="Business name or GSTIN" style="flex:1" /><button class="btn" type="submit">Search</button></form>
      {q.length >= 3 && results.length === 0 && <p class="small muted">Not found. <a class="gold" href="/dashboard/new">Add it as a new business</a>.</p>}
      {results.map((r) => <div class="row between" style="border-top:1px solid var(--border);padding:10px 0"><span><b>{r.name}</b><br /><span class="tiny muted">{r.city} {r.gst ? `· ${r.gst}` : ""}</span></span><a class="btn sm" href={`/dashboard/claim?b=${r.slug}`}>This is mine</a></div>)}
      <p class="small muted" style="margin-bottom:0">Can't find it? <a class="gold" href="/dashboard/new">Add a new business</a></p>
    </div>
  ));
});

const firstEmail = (raw?: string | null) => { const m = (raw ?? "").match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/); return m ? m[0].toLowerCase() : null; };
const maskEmail = (e: string) => { const [u, d] = e.split("@"); const parts = d.split("."); return `${u[0]}•••@${parts[0][0]}•••.${parts.slice(1).join(".")}`; };
const codeHash = async (code: string, businessId: number, userId: number) => {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${code}:${businessId}:${userId}`));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
};
const claimTarget = (c: C, slug: string) =>
  c.env.DB.prepare(`SELECT b.id, b.slug, b.name, b.owner_id, p.email FROM businesses b LEFT JOIN private_contacts p ON p.business_id = b.id WHERE b.slug = ?`)
    .bind(slug).first<{ id: number; slug: string; name: string; owner_id: number | null; email: string | null }>();

account.post("/dashboard/claim/send", async (c) => {
  const u = c.get("user")!;
  if (await myBiz(c)) return c.redirect("/dashboard", 303);
  const f = await c.req.parseBody();
  const b = await claimTarget(c, str(f.b, 80));
  if (!b || b.owner_id) return go(c, "/dashboard/claim", "That listing can't be claimed", true);
  const to = firstEmail(b.email);
  const path = `/dashboard/claim?b=${b.slug}`;
  if (!to || !c.env.EMAIL) return go(c, path, "Email verification isn't available for this listing. Please upload the GST certificate.", true);
  if (!(await allow(c.env, `cc:${u.id}`, 3, 86400)) || !(await allow(c.env, `ccb:${b.id}`, 5, 86400))) return go(c, path, "Too many codes requested today. Please upload the GST certificate instead.", true);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM claim_codes WHERE business_id = ? AND user_id = ?`).bind(b.id, u.id),
    c.env.DB.prepare(`INSERT INTO claim_codes (business_id, user_id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`).bind(b.id, u.id, await codeHash(code, b.id, u.id), now() + 900, now()),
  ]);
  const host = new URL(c.env.SITE_URL || c.req.url).hostname.replace(/^www\./, "");
  try {
    await c.env.EMAIL.send({
      to, from: `verify@${host}`, subject: `${code} is your ${c.env.BRAND_NAME} verification code`,
      text: `Someone is claiming the listing "${b.name}" on ${c.env.BRAND_NAME}.\n\nVerification code: ${code}\n\nIt is valid for 15 minutes. If this was not you, ignore this email and do not share the code with anyone.`,
    });
  } catch (e) {
    console.error("claim email", e);
    return go(c, path, "We couldn't send the code right now. Please upload the GST certificate instead.", true);
  }
  return go(c, `${path}&sent=1`, "Code sent. Check the inbox of the email on record.");
});

account.post("/dashboard/claim/verify", async (c) => {
  const u = c.get("user")!;
  if (await myBiz(c)) return c.redirect("/dashboard", 303);
  const f = await c.req.parseBody();
  const b = await claimTarget(c, str(f.b, 80));
  if (!b || b.owner_id) return go(c, "/dashboard/claim", "That listing can't be claimed", true);
  const path = `/dashboard/claim?b=${b.slug}&sent=1`;
  const row = await c.env.DB.prepare(`SELECT id, code_hash, expires_at, attempts FROM claim_codes WHERE business_id = ? AND user_id = ?`).bind(b.id, u.id).first<{ id: number; code_hash: string; expires_at: number; attempts: number }>();
  if (!row || row.expires_at < now() || row.attempts >= 5) return go(c, path, "That code has expired. Send a new one.", true);
  const code = str(f.code, 6).replace(/\D/g, "");
  if ((await codeHash(code, b.id, u.id)) !== row.code_hash) {
    await c.env.DB.prepare(`UPDATE claim_codes SET attempts = attempts + 1 WHERE id = ?`).bind(row.id).run();
    return go(c, path, "That code is not correct.", true);
  }
  const upd = await c.env.DB.prepare(`UPDATE businesses SET owner_id = ? WHERE id = ? AND owner_id IS NULL`).bind(u.id, b.id).run();
  if (!upd.meta.changes) return go(c, "/dashboard/claim", "That listing has just been claimed by someone else", true);
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM claim_codes WHERE business_id = ?`).bind(b.id),
    c.env.DB.prepare(`UPDATE claims SET status = 'rejected' WHERE business_id = ? AND status = 'pending'`).bind(b.id),
    c.env.DB.prepare(`INSERT INTO claims (business_id, user_id, role, note, status, created_at) VALUES (?, ?, 'Verified by email code', 'Code sent to the email on record', 'approved', ?)`).bind(b.id, u.id, now()),
  ]);
  return go(c, "/dashboard", "Verified. This listing is now yours.");
});

account.post("/dashboard/claim", async (c) => {
  const u = c.get("user")!;
  if (await myBiz(c)) return c.redirect("/dashboard", 303);
  const f = await c.req.parseBody();
  const slug = str(f.b, 80);
  const b = await c.env.DB.prepare(`SELECT id, owner_id FROM businesses WHERE slug = ?`).bind(slug).first<{ id: number; owner_id: number | null }>();
  if (!b || b.owner_id) return go(c, "/dashboard/claim", "That listing can't be claimed", true);
  const path = `/dashboard/claim?b=${slug}`;
  if (await c.env.DB.prepare(`SELECT 1 FROM claims WHERE user_id = ? AND status = 'pending'`).bind(u.id).first()) return go(c, "/dashboard", "You already have a claim under review");
  const doc = f.doc;
  if (!(doc instanceof File) || doc.size === 0) return go(c, path, "Please attach the GST registration certificate", true);
  if (doc.size > MAX_IMAGE) return go(c, path, "The certificate must be under 600 KB", true);
  const buf = new Uint8Array(await doc.arrayBuffer());
  const mime = buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : buf[0] === 0x89 && buf[1] === 0x50 ? "image/png"
    : buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 ? "application/pdf"
    : buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45 ? "image/webp" : null;
  if (!mime) return go(c, path, "The certificate must be a JPG, PNG, WebP or PDF file", true);
  if (!(await allow(c.env, `claim:${u.id}`, 3, 86400))) return go(c, path, "Too many claims today", true);
  const r = await c.env.DB.prepare(`INSERT INTO claims (business_id, user_id, role, phone, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(b.id, u.id, nul(f.role, 60), nul(f.phone, 16), nul(f.note, 500), now()).run();
  await c.env.DB.prepare(`INSERT OR REPLACE INTO claim_docs (claim_id, mime, data, size, created_at) VALUES (?, ?, ?, ?, ?)`).bind(Number(r.meta.last_row_id), mime, buf, buf.length, now()).run();
  return go(c, "/dashboard", "Claim submitted with your certificate. We'll review it shortly.");
});

account.get("/dashboard/new", async (c) => {
  if (await myBiz(c)) return c.redirect("/dashboard");
  return shell(c, "Add your business", (
    <div class="card"><form method="post" action="/dashboard/new">
      <Field label="Business name" name="name" required max={120} />
      <label>City<input name="city" list="cities" required maxlength={60} /><datalist id="cities">{CITIES.map((x) => <option value={x.label} />)}</datalist></label>
      <Field label="GSTIN (optional)" name="gst" max={15} placeholder="15-character GSTIN" />
      <button class="btn" type="submit">Create listing</button>
    </form></div>
  ));
});

account.post("/dashboard/new", async (c) => {
  const u = c.get("user")!;
  if (await myBiz(c)) return c.redirect("/dashboard", 303);
  const f = await c.req.parseBody();
  const name = str(f.name, 120), city = str(f.city, 60), gst = str(f.gst, 15).toUpperCase() || null;
  if (name.length < 3 || city.length < 2) return go(c, "/dashboard/new", "Please enter the business name and city", true);
  if (gst && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gst)) return go(c, "/dashboard/new", "That GSTIN doesn't look right", true);
  if (gst && (await c.env.DB.prepare(`SELECT 1 FROM businesses WHERE gst = ?`).bind(gst).first())) return go(c, "/dashboard/claim?q=" + gst, "This GSTIN is already listed. Claim it instead.", true);
  if (!(await allow(c.env, `newbiz:${u.id}`, 2, 86400))) return go(c, "/dashboard/new", "Too many attempts today", true);
  let slug = slugify(`${name} ${city}`);
  if (await c.env.DB.prepare(`SELECT 1 FROM businesses WHERE slug = ?`).bind(slug).first()) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  await c.env.DB.prepare(`INSERT INTO businesses (slug, name, gst, city, city_slug, owner_id, state, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?)`)
    .bind(slug, name, gst, city, slugify(city), u.id, stateFromGst(gst), now()).run();
  return go(c, "/dashboard/profile", "Listing created. Add your details below.");
});

// ───────────────────────── Images ─────────────────────────
async function saveImage(c: C, b: Business, file: unknown): Promise<number | null | "bad"> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_IMAGE) return "bad";
  const buf = new Uint8Array(await file.arrayBuffer());
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8, png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const webp = buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45;
  if (!jpeg && !png && !webp) return "bad";
  const used = await c.env.DB.prepare(`SELECT count(*) AS n FROM images WHERE business_id = ?`).bind(b.id).first<{ n: number }>();
  if ((used?.n ?? 0) >= 260) return "bad";
  const r = await c.env.DB.prepare(`INSERT INTO images (business_id, user_id, mime, data, size, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(b.id, c.get("user")!.id, jpeg ? "image/jpeg" : png ? "image/png" : "image/webp", buf, buf.length, now()).run();
  return Number(r.meta.last_row_id);
}
const IMG_ERR = "Photo must be a JPG, PNG or WebP under 600 KB";
const dropImage = (c: C, b: Business, id: number | null) =>
  id ? c.env.DB.prepare(`DELETE FROM images WHERE id = ? AND business_id = ?`).bind(id, b.id).run() : Promise.resolve();

// ───────────────────────── Profile ─────────────────────────
account.get("/dashboard/profile", async (c) => {
  const b = await myBiz(c);
  if (!b) return needBiz(c);
  const types = (await c.env.DB.prepare(`SELECT type FROM business_types WHERE business_id = ?`).bind(b.id).all<{ type: string }>()).results.map((t) => t.type);
  return shell(c, "Business profile", (
    <form method="post" action="/dashboard/profile" enctype="multipart/form-data" class="stack">
      <div class="card">
        <Field label="Business name" name="name" value={b.name} required max={120} />
        <Field label="City" name="city" value={b.city} required max={60} />
        <Field label="About your business" name="about" value={b.about} area max={1500} placeholder="What you make or sell, since when, what you're known for" />
        <label>Logo or shop photo{b.logo_image ? <img src={`/img/${b.logo_image}`} alt="" style="width:72px;height:72px;border-radius:14px;object-fit:cover;margin:6px 0" /> : null}<input type="file" name="logo" accept="image/*" data-resize="800" /></label>
      </div>
      <div class="card">
        <b>Contact details</b><p class="tiny muted">Shown on your listing and bio page.</p>
        <div class="grid g2">
          <Field label="Phone" name="phone" value={b.phone} type="tel" max={16} />
          <Field label="WhatsApp number" name="whatsapp" value={b.whatsapp} type="tel" max={16} />
          <Field label="Email" name="email" value={b.email} type="email" max={160} />
          <Field label="Website" name="website" value={b.website} max={200} placeholder="https://" />
          <Field label="Instagram link" name="instagram" value={b.instagram} max={200} />
          <Field label="Facebook link" name="facebook" value={b.facebook} max={200} />
          <Field label="YouTube link" name="youtube" value={b.youtube} max={200} />
        </div>
        <Field label="Address" name="address" value={b.address} area max={400} />
        <Field label="Business hours" name="hours" value={b.hours} area max={300} placeholder={"Mon–Sat: 10:30 AM – 8:00 PM\nSunday: Closed"} />
      </div>
      <div class="card">
        <b>What does your business do?</b><p class="tiny muted">Pick up to 4. Buyers find you under these categories.</p>
        <div class="row">{TRADE_TYPES.map((t) => <label class="badge" style="margin:0;cursor:pointer"><input type="checkbox" name="types" value={t.slug} checked={types.includes(t.slug)} /> {t.label}</label>)}</div>
      </div>
      <div class="card">
        <b>Bio page colour</b>
        <div class="row" style="margin-top:8px">{Object.entries(THEMES).map(([k, t]) => <label class="badge" style="margin:0;cursor:pointer"><input type="radio" name="theme" value={k} checked={b.theme === k} style="width:auto" /> <span style={`display:inline-block;width:14px;height:14px;border-radius:50%;background:linear-gradient(135deg,${t.bg} 50%,${t.accent} 50%);border:1px solid #888`}></span> {t.label}</label>)}</div>
      </div>
      <button class="btn" type="submit">Save profile</button>
    </form>
  ));
});

account.post("/dashboard/profile", async (c) => {
  const b = await myBiz(c);
  if (!b) return c.redirect("/dashboard", 303);
  const f = await c.req.parseBody({ all: true });
  const one = (k: string) => (Array.isArray(f[k]) ? (f[k] as unknown[])[0] : f[k]);
  const name = str(one("name"), 120), city = str(one("city"), 60);
  if (name.length < 3 || city.length < 2) return go(c, "/dashboard/profile", "Business name and city are required", true);
  const url = (k: string) => { const v = str(one(k), 200); return v ? safeUrl(v) : null; };
  const img = await saveImage(c, b, one("logo"));
  if (img === "bad") return go(c, "/dashboard/profile", IMG_ERR, true);
  const theme = THEMES[str(one("theme"), 20)] ? str(one("theme"), 20) : "gold";
  await c.env.DB.prepare(`UPDATE businesses SET name=?, city=?, city_slug=?, about=?, phone=?, whatsapp=?, email=?, website=?, instagram=?, facebook=?, youtube=?, address=?, hours=?, theme=?, logo_image=coalesce(?, logo_image) WHERE id=?`)
    .bind(name, city, slugify(city), nul(one("about"), 1500), nul(one("phone"), 16), nul(one("whatsapp"), 16), nul(one("email"), 160), url("website"), url("instagram"), url("facebook"), url("youtube"), nul(one("address"), 400), nul(one("hours"), 300), theme, img, b.id).run();
  if (img && b.logo_image) await dropImage(c, b, b.logo_image);
  const picked = ([] as unknown[]).concat(f.types ?? []).map(String).filter((t) => TRADE_TYPES.some((x) => x.slug === t)).slice(0, 4);
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM business_types WHERE business_id = ?`).bind(b.id),
    ...picked.map((t) => c.env.DB.prepare(`INSERT OR IGNORE INTO business_types (business_id, type) VALUES (?, ?)`).bind(b.id, t)),
  ]);
  return go(c, "/dashboard/profile", "Profile saved");
});

// ───────────────────────── Catalogue ─────────────────────────
type Product = { id: number; name: string; category: string | null; weight: string | null; purity: string | null; price: string | null; image_id: number | null; active: number; clicks: number };

account.get("/dashboard/products", async (c) => {
  const b = await myBiz(c);
  if (!b) return needBiz(c);
  const rows = (await c.env.DB.prepare(`SELECT id,name,category,weight,purity,price,image_id,active,clicks FROM products WHERE business_id = ? ORDER BY position, id`).bind(b.id).all<Product>()).results;
  const max = limits(b).products;
  return shell(c, "Catalogue", (
    <div class="stack">
      <div class="card small muted">{rows.length} of {max} products used.{!isPremium(b) && <> <a class="gold" href="/dashboard/membership">Upgrade to Premium</a> for {limits({ plan: "premium", plan_expires: null }).products}.</>}</div>
      {rows.length < max && (
        <details class="card" open={rows.length === 0}><summary>+ Add a product</summary>
          <form method="post" action="/dashboard/products" enctype="multipart/form-data" style="margin-top:12px">
            <div class="grid g2">
              <Field label="Product name" name="name" required max={120} placeholder="22K Temple Necklace" />
              <Field label="Category" name="category" max={60} placeholder="Necklaces" />
              <Field label="Weight" name="weight" max={40} placeholder="24.5 g" />
              <Field label="Purity" name="purity" max={40} placeholder="22K / 916 HUID" />
              <Field label="Price (optional)" name="price" max={40} placeholder="On request" />
              <label>Photo<input type="file" name="image" accept="image/*" data-resize="1200" /></label>
            </div>
            <Field label="Description (optional)" name="description" area max={400} />
            <button class="btn" type="submit">Add product</button>
          </form>
        </details>
      )}
      <div class="grid g3">
        {rows.map((p) => (
          <div class="card prod" style={p.active ? undefined : "opacity:.55"}>
            {p.image_id ? <img src={`/img/${p.image_id}`} alt="" loading="lazy" /> : <div class="ph">💍</div>}
            <h3 style="font-size:15px;margin-top:10px">{p.name}</h3>
            <div class="tiny muted">{[p.category, p.weight, p.purity, p.price].filter(Boolean).join(" · ")} · {p.clicks} clicks</div>
            <div class="row" style="margin-top:10px">
              <form method="post" action={`/dashboard/products/${p.id}/toggle`}><button class="btn ghost sm" type="submit">{p.active ? "Hide" : "Show"}</button></form>
              <form method="post" action={`/dashboard/products/${p.id}/delete`} data-confirm="Delete this product?"><button class="btn danger sm" type="submit">Delete</button></form>
            </div>
          </div>
        ))}
      </div>
    </div>
  ));
});

account.post("/dashboard/products", async (c) => {
  const b = await myBiz(c);
  if (!b) return c.redirect("/dashboard", 303);
  const n = (await c.env.DB.prepare(`SELECT count(*) AS n FROM products WHERE business_id = ?`).bind(b.id).first<{ n: number }>())?.n ?? 0;
  if (n >= limits(b).products) return go(c, "/dashboard/products", "Product limit reached for your plan", true);
  const f = await c.req.parseBody();
  const name = str(f.name, 120);
  if (name.length < 2) return go(c, "/dashboard/products", "Please enter a product name", true);
  const img = await saveImage(c, b, f.image);
  if (img === "bad") return go(c, "/dashboard/products", IMG_ERR, true);
  await c.env.DB.prepare(`INSERT INTO products (business_id, name, category, weight, purity, price, description, image_id, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(b.id, name, nul(f.category, 60), nul(f.weight, 40), nul(f.purity, 40), nul(f.price, 40), nul(f.description, 400), img, n, now()).run();
  return go(c, "/dashboard/products", "Product added");
});
account.post("/dashboard/products/:id/toggle", async (c) => {
  const b = await myBiz(c);
  if (b) await c.env.DB.prepare(`UPDATE products SET active = 1 - active WHERE id = ? AND business_id = ?`).bind(Number(c.req.param("id")), b.id).run();
  return c.redirect("/dashboard/products", 303);
});
account.post("/dashboard/products/:id/delete", async (c) => {
  const b = await myBiz(c);
  if (b) {
    const p = await c.env.DB.prepare(`SELECT image_id FROM products WHERE id = ? AND business_id = ?`).bind(Number(c.req.param("id")), b.id).first<{ image_id: number | null }>();
    if (p) { await c.env.DB.prepare(`DELETE FROM products WHERE id = ? AND business_id = ?`).bind(Number(c.req.param("id")), b.id).run(); await dropImage(c, b, p.image_id); }
  }
  return go(c, "/dashboard/products", "Product deleted");
});

// ───────────────────────── Bio links ─────────────────────────
account.get("/dashboard/links", async (c) => {
  const b = await myBiz(c);
  if (!b) return needBiz(c);
  const rows = (await c.env.DB.prepare(`SELECT id, title, url, clicks FROM links WHERE business_id = ? ORDER BY position, id`).bind(b.id).all<{ id: number; title: string; url: string; clicks: number }>()).results;
  const max = limits(b).links;
  return shell(c, "Bio link", (
    <div class="stack">
      <div class="card small">Your bio page: <a class="gold" href={`/bio/${b.slug}`} target="_blank">{siteUrl(c)}/bio/{b.slug}</a> <button class="btn ghost sm" data-copy={`${siteUrl(c)}/bio/${b.slug}`}>Copy</button>
        <p class="tiny muted" style="margin-bottom:0">WhatsApp, call, catalogue, save-contact and social buttons appear automatically from your profile. Add extra links here. {rows.length} of {max} used.</p></div>
      {rows.length < max && (
        <form class="card" method="post" action="/dashboard/links">
          <div class="grid g2"><Field label="Button text" name="title" required max={60} placeholder="New bridal collection" /><Field label="Link" name="url" required max={300} placeholder="https://" /></div>
          <button class="btn" type="submit">Add link</button>
        </form>
      )}
      {rows.length > 0 && <div class="card"><table><tr><th>Button</th><th>Link</th><th>Clicks</th><th></th></tr>
        {rows.map((l) => <tr><td>{l.title}</td><td class="tiny muted" style="word-break:break-all">{l.url}</td><td>{l.clicks}</td><td><form method="post" action={`/dashboard/links/${l.id}/delete`}><button class="btn danger sm" type="submit">Remove</button></form></td></tr>)}
      </table></div>}
    </div>
  ));
});
account.post("/dashboard/links", async (c) => {
  const b = await myBiz(c);
  if (!b) return c.redirect("/dashboard", 303);
  const n = (await c.env.DB.prepare(`SELECT count(*) AS n FROM links WHERE business_id = ?`).bind(b.id).first<{ n: number }>())?.n ?? 0;
  if (n >= limits(b).links) return go(c, "/dashboard/links", "Link limit reached for your plan", true);
  const f = await c.req.parseBody();
  const title = str(f.title, 60), url = safeUrl(str(f.url, 300));
  if (title.length < 2 || !url) return go(c, "/dashboard/links", "Enter button text and a valid link", true);
  await c.env.DB.prepare(`INSERT INTO links (business_id, title, url, position) VALUES (?, ?, ?, ?)`).bind(b.id, title, url, n).run();
  return go(c, "/dashboard/links", "Link added");
});
account.post("/dashboard/links/:id/delete", async (c) => {
  const b = await myBiz(c);
  if (b) await c.env.DB.prepare(`DELETE FROM links WHERE id = ? AND business_id = ?`).bind(Number(c.req.param("id")), b.id).run();
  return go(c, "/dashboard/links", "Link removed");
});

// ───────────────────────── Photos, offers, FAQs ─────────────────────────
const KINDS = { gallery: "Gallery photo", offer: "Offer", faq: "FAQ" } as const;
type Kind = keyof typeof KINDS;
const kindLimit = (b: Business, k: Kind) => (k === "gallery" ? limits(b).gallery : k === "offer" ? limits(b).offers : limits(b).faqs);

account.get("/dashboard/extras", async (c) => {
  const b = await myBiz(c);
  if (!b) return needBiz(c);
  const rows = (await c.env.DB.prepare(`SELECT id, kind, title, body, image_id FROM extras WHERE business_id = ? ORDER BY kind, position, id`).bind(b.id).all<{ id: number; kind: Kind; title: string | null; body: string | null; image_id: number | null }>()).results;
  const section = (k: Kind, form: Child) => {
    const mine = rows.filter((r) => r.kind === k), max = kindLimit(b, k);
    return (
      <div class="card">
        <b>{KINDS[k]}s</b> <span class="tiny muted">{mine.length} of {max}{max === 0 ? " — Premium only" : ""}</span>
        {mine.map((r) => (
          <div class="row between" style="border-top:1px solid var(--border);padding:10px 0;margin-top:8px">
            <span class="row">{r.image_id ? <img src={`/img/${r.image_id}`} alt="" style="width:56px;height:56px;border-radius:10px;object-fit:cover" /> : null}<span><b class="small">{r.title}</b>{r.body && <div class="tiny muted">{r.body.slice(0, 120)}</div>}</span></span>
            <form method="post" action={`/dashboard/extras/${r.id}/delete`}><button class="btn danger sm" type="submit">Remove</button></form>
          </div>
        ))}
        {mine.length < max && <form method="post" action="/dashboard/extras" enctype="multipart/form-data" style="margin-top:12px"><input type="hidden" name="kind" value={k} />{form}<button class="btn sm" type="submit">Add</button></form>}
        {max === 0 && <p class="small" style="margin-bottom:0"><a class="gold" href="/dashboard/membership">Upgrade to Premium</a> to add offers.</p>}
      </div>
    );
  };
  return shell(c, "Photos, offers, FAQs", (
    <div class="stack">
      {section("gallery", <><label>Photo<input type="file" name="image" accept="image/*" data-resize="1400" required /></label><Field label="Caption (optional)" name="title" max={80} /></>)}
      {section("offer", <><Field label="Offer" name="title" required max={100} placeholder="Zero making charges on bangles" /><Field label="Details" name="body" area max={400} /></>)}
      {section("faq", <><Field label="Question" name="title" required max={140} placeholder="Do you make custom designs?" /><Field label="Answer" name="body" area required max={600} /></>)}
    </div>
  ));
});
account.post("/dashboard/extras", async (c) => {
  const b = await myBiz(c);
  if (!b) return c.redirect("/dashboard", 303);
  const f = await c.req.parseBody();
  const kind = str(f.kind, 10) as Kind;
  if (!(kind in KINDS)) return go(c, "/dashboard/extras", "Unknown item", true);
  const n = (await c.env.DB.prepare(`SELECT count(*) AS n FROM extras WHERE business_id = ? AND kind = ?`).bind(b.id, kind).first<{ n: number }>())?.n ?? 0;
  if (n >= kindLimit(b, kind)) return go(c, "/dashboard/extras", "Limit reached for your plan", true);
  const title = nul(f.title, 140), body = nul(f.body, 600);
  let img: number | null = null;
  if (kind === "gallery") {
    const r = await saveImage(c, b, f.image);
    if (r === "bad" || r === null) return go(c, "/dashboard/extras", IMG_ERR, true);
    img = r;
  } else if (!title || (kind === "faq" && !body)) return go(c, "/dashboard/extras", "Please fill in the fields", true);
  await c.env.DB.prepare(`INSERT INTO extras (business_id, kind, title, body, image_id, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(b.id, kind, title, body, img, n, now()).run();
  return go(c, "/dashboard/extras", "Added");
});
account.post("/dashboard/extras/:id/delete", async (c) => {
  const b = await myBiz(c);
  if (b) {
    const r = await c.env.DB.prepare(`SELECT image_id FROM extras WHERE id = ? AND business_id = ?`).bind(Number(c.req.param("id")), b.id).first<{ image_id: number | null }>();
    if (r) { await c.env.DB.prepare(`DELETE FROM extras WHERE id = ? AND business_id = ?`).bind(Number(c.req.param("id")), b.id).run(); await dropImage(c, b, r.image_id); }
  }
  return go(c, "/dashboard/extras", "Removed");
});

// ───────────────────────── Enquiries ─────────────────────────
account.get("/dashboard/reviews", async (c) => {
  const b = await myBiz(c);
  if (!b) return c.redirect("/dashboard", 302);
  const rows = (await c.env.DB.prepare(`SELECT r.id, r.rating, r.body, r.reply, r.created_at, u.name AS uname FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.business_id = ? AND r.status = 'live' ORDER BY r.created_at DESC LIMIT 50`).bind(b.id).all<{ id: number; rating: number; body: string | null; reply: string | null; created_at: number; uname: string }>()).results;
  const link = `${siteUrl(c)}/b/${b.slug}#reviews`;
  const ask = `https://wa.me/?text=${encodeURIComponent(`Thank you for dealing with ${b.name}. It would help us a lot if you could rate us here (takes a minute):\n${link}`)}`;
  return shell(c, "Reviews", (<>
    <div class="card">
      <b>Ask customers for a review</b>
      <p class="small muted" style="margin:6px 0 10px">Reviews show on your listing and lift you in the "Top rated" sort. Send this link to customers you have dealt with.</p>
      <div class="row"><a class="btn sm" href={ask} target="_blank" rel="noopener">Share on WhatsApp</a><button class="btn ghost sm" type="button" data-copy={link}>Copy link</button></div>
    </div>
    {rows.length === 0 ? <div class="card muted" style="margin-top:12px">No reviews yet.</div> : rows.map((r) => (
      <div class="card" style="margin-top:12px">
        <div class="small"><b class="gold">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</b> <b>{r.uname.split(/\s+/)[0]}</b> <span class="tiny muted">{new Date(r.created_at * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span></div>
        {r.body && <p class="small" style="margin:6px 0;white-space:pre-line">{r.body}</p>}
        {r.reply ? <div class="small muted">Your reply: {r.reply}</div>
          : <form method="post" action={`/b/${b.slug}/review/${r.id}/reply`} class="row"><input name="reply" maxlength={400} placeholder="Write a public reply" required style="flex:1" /><button class="btn ghost sm" type="submit">Reply</button></form>}
      </div>
    ))}
  </>));
});

account.get("/dashboard/enquiries", async (c) => {
  const b = await myBiz(c);
  if (!b) return needBiz(c);
  const rows = (await c.env.DB.prepare(`SELECT e.id, e.name, e.phone, e.message, e.status, e.created_at, p.name AS product FROM enquiries e LEFT JOIN products p ON p.id = e.product_id WHERE e.business_id = ? ORDER BY e.created_at DESC LIMIT 200`).bind(b.id).all<{ id: number; name: string; phone: string; message: string | null; status: string; created_at: number; product: string | null }>()).results;
  return shell(c, "Enquiries", rows.length === 0 ? <div class="card muted">No enquiries yet. Share your bio link and catalogue to start getting them.</div> : (
    <div class="card"><table><tr><th>From</th><th>Message</th><th>When</th><th>Status</th></tr>
      {rows.map((e) => (
        <tr style={e.status === "new" ? undefined : "opacity:.65"}>
          <td><b>{e.name}</b><br /><a class="gold small" href={`https://wa.me/${e.phone.length === 10 ? "91" + e.phone : e.phone}`} target="_blank" rel="noopener">WhatsApp {e.phone}</a></td>
          <td class="small">{e.product && <span class="badge soft">{e.product}</span>} {e.message}</td>
          <td class="tiny muted">{new Date(e.created_at * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</td>
          <td><form method="post" action={`/dashboard/enquiries/${e.id}`}><select name="status" data-autosubmit>{["new", "contacted", "closed"].map((s) => <option value={s} selected={e.status === s}>{s}</option>)}</select></form></td>
        </tr>
      ))}
    </table></div>
  ));
});
account.post("/dashboard/enquiries/:id", async (c) => {
  const b = await myBiz(c);
  const s = str((await c.req.parseBody()).status, 12);
  if (b && ["new", "contacted", "closed"].includes(s)) await c.env.DB.prepare(`UPDATE enquiries SET status = ? WHERE id = ? AND business_id = ?`).bind(s, Number(c.req.param("id")), b.id).run();
  return c.redirect("/dashboard/enquiries", 303);
});

// ───────────────────────── Membership ─────────────────────────
const cfBase = (env: AppEnv["Bindings"]) => ((env.CASHFREE_ENV ?? "production").toLowerCase() === "sandbox" ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg");
const cfHeaders = (env: AppEnv["Bindings"]) => ({ "content-type": "application/json", "x-api-version": "2023-08-01", "x-client-id": env.CASHFREE_APP_ID!, "x-client-secret": env.CASHFREE_SECRET! });

export async function activatePlan(db: D1Database, businessId: number, plan: PlanKey) {
  cacheBust.home = Date.now();
  const cur = await db.prepare(`SELECT plan, plan_expires FROM businesses WHERE id = ?`).bind(businessId).first<{ plan: string; plan_expires: number | null }>();
  const from = cur && cur.plan === "premium" && cur.plan_expires && cur.plan_expires > now() ? cur.plan_expires : now();
  await db.prepare(`UPDATE businesses SET plan = 'premium', plan_expires = ? WHERE id = ?`).bind(from + PLANS[plan].days * 86400, businessId).run();
}

account.get("/dashboard/membership", async (c) => {
  const b = await myBiz(c);
  if (!b) return needBiz(c);
  const premium = isPremium(b);
  const pending = await c.env.DB.prepare(`SELECT plan FROM payments WHERE business_id = ? AND status = 'requested' ORDER BY id DESC LIMIT 1`).bind(b.id).first<{ plan: PlanKey }>();
  const online = !!(c.env.CASHFREE_APP_ID && c.env.CASHFREE_SECRET);
  return shell(c, "Membership", (
    <div class="stack">
      <div class="card"><b>Current plan: {premium ? "Premium ★" : "Free"}</b>
        {premium && b.plan_expires && <div class="small muted">Valid until {new Date(b.plan_expires * 1000).toLocaleDateString("en-IN", { dateStyle: "long" })}</div>}</div>
      {pending && !online && <div class="flash ok">Your request for {PLANS[pending.plan].label} has been received. We'll contact you with payment details and activate it.</div>}
      <div class="grid g2">
        {(Object.keys(PLANS) as PlanKey[]).map((k) => (
          <form class="card" method="post" action="/dashboard/membership">
            <input type="hidden" name="plan" value={k} />
            <h2 style="font-size:18px">{PLANS[k].label}</h2>
            <div class="stat"><b>₹{PLANS[k].amount.toLocaleString("en-IN")}</b></div>
            <p class="small muted">Featured badge, top placement, bigger catalogue, offers, no "Powered by".</p>
            <button class="btn block" type="submit">{premium ? "Extend" : "Upgrade"}{online ? " — pay online" : ""}</button>
          </form>
        ))}
      </div>
      <a class="small gold" href="/pricing">Compare plans</a>
    </div>
  ));
});

account.post("/dashboard/membership", async (c) => {
  const b = await myBiz(c);
  const u = c.get("user")!;
  if (!b) return c.redirect("/dashboard", 303);
  const plan = str((await c.req.parseBody()).plan, 30) as PlanKey;
  if (!(plan in PLANS)) return go(c, "/dashboard/membership", "Unknown plan", true);
  if (!(await allow(c.env, `pay:${u.id}`, 10, 3600))) return go(c, "/dashboard/membership", "Too many attempts. Try later.", true);
  const online = !!(c.env.CASHFREE_APP_ID && c.env.CASHFREE_SECRET);
  const r = await c.env.DB.prepare(`INSERT INTO payments (user_id, business_id, plan, amount, status, provider, created_at) VALUES (?, ?, ?, ?, 'requested', ?, ?)`)
    .bind(u.id, b.id, plan, PLANS[plan].amount, online ? "cashfree" : "manual", now()).run();
  const payId = Number(r.meta.last_row_id);
  if (!online) return go(c, "/dashboard/membership", "Request received. We'll contact you to complete payment.");
  const orderId = `jsh_${payId}_${Date.now().toString(36)}`;
  const resp = await fetch(`${cfBase(c.env)}/orders`, { method: "POST", headers: cfHeaders(c.env), body: JSON.stringify({
    order_id: orderId, order_amount: PLANS[plan].amount, order_currency: "INR",
    customer_details: { customer_id: `u${u.id}`, customer_email: u.email, customer_phone: (u.phone || "9999999999").replace(/\D/g, "").slice(-10), customer_name: u.name },
    order_meta: { return_url: `${siteUrl(c)}/dashboard/membership/return?order_id={order_id}` },
    order_note: PLANS[plan].label,
  }) });
  const j = (await resp.json().catch(() => ({}))) as { payment_session_id?: string };
  if (!resp.ok || !j.payment_session_id) return go(c, "/dashboard/membership", "Couldn't start the payment. Please try again.", true);
  await c.env.DB.prepare(`UPDATE payments SET ref = ? WHERE id = ?`).bind(orderId, payId).run();
  const mode = (c.env.CASHFREE_ENV ?? "production").toLowerCase() === "sandbox" ? "sandbox" : "production";
  return page(c, { title: "Redirecting to payment", noindex: true }, (
    <main class="wrap narrow center" style="padding-top:60px">
      <p>Opening secure payment…</p>
      <script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
      <script dangerouslySetInnerHTML={{ __html: `Cashfree({mode:${JSON.stringify(mode)}}).checkout({paymentSessionId:${JSON.stringify(j.payment_session_id)},redirectTarget:"_self"});` }} />
    </main>
  ));
});

account.get("/dashboard/membership/return", async (c) => {
  const orderId = str(c.req.query("order_id"), 80);
  const u = c.get("user")!;
  const pay = await c.env.DB.prepare(`SELECT id, business_id, plan, status FROM payments WHERE ref = ? AND user_id = ?`).bind(orderId, u.id).first<{ id: number; business_id: number; plan: PlanKey; status: string }>();
  if (!pay || !c.env.CASHFREE_APP_ID) return go(c, "/dashboard/membership", "Payment not found", true);
  if (pay.status === "paid") return go(c, "/dashboard/membership", "Premium is active");
  const resp = await fetch(`${cfBase(c.env)}/orders/${encodeURIComponent(orderId)}`, { headers: cfHeaders(c.env) });
  const j = (await resp.json().catch(() => ({}))) as { order_status?: string };
  if (j.order_status !== "PAID") return go(c, "/dashboard/membership", "Payment not completed. You have not been charged twice; try again if needed.", true);
  // Mark paid first (only once), then extend the plan.
  const upd = await c.env.DB.prepare(`UPDATE payments SET status = 'paid' WHERE id = ? AND status = 'requested'`).bind(pay.id).run();
  if (upd.meta.changes === 1) await activatePlan(c.env.DB, pay.business_id, pay.plan);
  return go(c, "/dashboard/membership", "Payment received. Premium is active!");
});
