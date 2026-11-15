/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Child } from "hono/jsx";
import { type AppEnv, clientIp } from "../auth";
import { allow, now } from "../db";
import { RATE_SOURCE } from "../rates";
import { Field, Flash, page } from "../ui";
import { PLACEMENTS } from "./ads";

// About, advertising, terms and privacy.
export const info = new Hono<AppEnv>();
const doc = (title: string, intro: string, sections: [string, Child][]) => (
  <main class="wrap narrow" style="padding-top:30px">
    <h1 style="font-size:30px">{title}</h1>
    <p class="muted">{intro}</p>
    {sections.map(([h, body]) => <div class="card" style="margin-top:12px"><h2 style="font-size:17px;margin-bottom:6px">{h}</h2><div class="small" style="line-height:1.65">{body}</div></div>)}
    <p class="tiny muted" style="margin-top:14px">Last updated: 15 November 2026.</p>
  </main>
);

info.get("/about", (c) => page(c, { title: `About ${c.env.BRAND_NAME}`, desc: "An industry-neutral platform for India's jewellery, bullion and allied trade: directory, live rates, tools and buy requirements.", path: "/about" }, doc(
  `About ${c.env.BRAND_NAME}`,
  "An industry-neutral platform for India's jewellery, bullion and allied trade.",
  [
    ["What this is", <p>{c.env.BRAND_NAME} brings the trade onto one page: a directory of manufacturers, wholesalers, retailers, bullion dealers and allied services across India, live bullion rates, free calculators, buy requirements from real buyers, industry news and events.</p>],
    ["Who it is for", <ul style="padding-left:18px;margin:0"><li><b>Jewellers and manufacturers:</b> claim your listing, show your catalogue, receive enquiries and share one bio link.</li><li><b>Bullion and allied businesses:</b> be found by city, state and category.</li><li><b>Buyers:</b> search freely, compare, and post what you need so suppliers contact you.</li></ul>],
    ["How listings get here", <p>Listings come from public business registration details, trade directories we have permission to publish, and business owners who add or claim their own listing. If a detail is wrong, use the "Report or request removal" link on that listing.</p>],
    ["Rates", <p>Live bullion rates are published by our rate partner, <a class="gold" href={RATE_SOURCE.url} target="_blank" rel="noopener">{RATE_SOURCE.name}</a>, Mumbai. They are indicative.</p>],
    ["Get involved", <p><a class="gold" href="/signup">List or claim your business</a> · <a class="gold" href="/requirements/new">Post a buy requirement</a> · <a class="gold" href="/advertise">Advertise with us</a></p>],
  ],
)));

info.get("/terms", (c) => page(c, { title: "Terms of use", path: "/terms" }, doc("Terms of use", "Plain-language terms for using this site.", [
  ["The directory", <p>Listings are compiled from public business registration details, trade directories we have permission to publish, and information supplied by business owners. They are provided for information only. We do not verify every detail, and a listing is not a recommendation. Check a business yourself before you deal with it. We are not a party to any transaction between users.</p>],
  ["Owners and claims", <p>Only the owner or an authorised person may claim a listing. We may ask for a code sent to the contact on record or a GST registration certificate, and we may refuse or reverse a claim. Owners are responsible for what they publish, including products, prices, offers and photos.</p>],
  ["Contact details and fair use", <p>Some phone numbers and email addresses are shown only to paid members, one listing at a time and up to a daily limit. They are for genuine trade enquiries by the member. Copying them in bulk, automated collection, resale, and unsolicited bulk messaging are not allowed, and accounts doing so may be paused or closed without refund.</p>],
  ["Buy requirements", <p>Buyers post requirements at their own choice. Their name and number are shown to signed-in suppliers with a claimed listing. Suppliers must use them only to respond to that requirement.</p>],
  ["Reviews", <p>Reviews must describe your own dealings with the business. Do not post abuse, private information, web links or anything false. A business owner may reply publicly. We may hide a review that breaks these rules, and we do not edit ratings in return for payment.</p>],
  ["Trade board", <p>Buy requirements, offers, job vacancies and work-wanted posts are published at the poster's own choice and risk. Check the other party yourself before paying, shipping goods or hiring. We are not a party to any deal or employment.</p>],
  ["Rates and calculators", <p>Bullion rates come from our rate partner and are indicative. Calculator results are estimates. Neither is an offer to buy or sell or financial, tax or legal advice. Confirm rates, charges and tax before any transaction.</p>],
  ["Advertising", <p>Banners marked "Sponsored" are paid placements. Lines marked "Partner" promote businesses connected with the operators of this site. Neither is an endorsement of quality.</p>],
  ["Membership", <p>Premium is billed for the period chosen and gives the benefits shown on the Membership page for that period. Features and limits may change over time.</p>],
  ["Removal and misuse", <p>We may remove content or close accounts that are misleading, unlawful or abusive. To report a listing or ask for a correction or removal, use the "Report or request removal" link on the listing.</p>],
])));

info.get("/privacy", (c) => page(c, { title: "Privacy", path: "/privacy" }, doc("Privacy", "What we hold, why, and who can see it.", [
  ["Business listings", <p>Listings show business information: name, city, address, registration details and, where an owner adds them, contact buttons, products and photos. Some listings also carry a business phone number or email that came from a trade directory. Those are not shown on public pages or to search engines. They are shown to paid members, one listing at a time, with a daily limit and a record of every view.</p>],
  ["Your account", <p>When you sign up we store your name, email, mobile number and a protected (hashed) form of your password. We use them to run your account, verify claims and send you messages about your listing.</p>],
  ["Enquiries and requirements", <p>An enquiry you send to a business is shown to that business only. A buy requirement you post is public, but your name and number are shown only to signed-in suppliers with a claimed listing.</p>],
  ["Claim documents", <p>A GST certificate uploaded to prove ownership is seen only by our verification team and is never published.</p>],
  ["Emails", <p>We email owners about enquiries and claims, and a weekly summary of new buy requirements. Every weekly email has an unsubscribe link.</p>],
  ["Rate emails and alerts", <p>If you ask for the daily rate email we store your email address and send it only after you confirm by link. Every email has a one-click stop link. Rate alerts are sent to your account email once, when your target is crossed.</p>],
  ["Reviews and saved listings", <p>A review is shown publicly with your first name. Your saved listings are private to you.</p>],
  ["Cookies", <p>We use one sign-in cookie to keep you logged in. We do not use advertising trackers. Sponsored banners count views and clicks without identifying you.</p>],
  ["Correction and removal", <p>If you are the owner of a listed business and want a detail corrected or the listing or its contact details removed, use the "Report or request removal" link on the listing, or claim the listing and edit it yourself. We act on genuine requests.</p>],
])));

info.get("/advertise", (c) => page(c, { title: "Advertise to the jewellery trade", desc: "Banner and sponsor placements on India's jewellery, bullion and allied trade platform.", path: "/advertise" }, (
  <main class="wrap narrow" style="padding-top:30px">
    <div class="eyebrow">Advertise</div>
    <h1 style="font-size:30px;margin:6px 0">Reach the jewellery trade</h1>
    <p class="muted">Put your brand in front of jewellers, manufacturers, bullion dealers and buyers who use this site for rates, tools and suppliers.</p>
    <div class="card" style="margin-top:12px"><h2 style="font-size:17px;margin-bottom:6px">Placements</h2>
      <table class="fit"><tr><th>Where</th><th>Best size</th></tr>
        <tr><td>{PLACEMENTS.home}</td><td>1200 × 250</td></tr><tr><td>{PLACEMENTS.showcase}</td><td>1200 × 550</td></tr>
        <tr><td>{PLACEMENTS.directory}</td><td>1200 × 250</td></tr><tr><td>{PLACEMENTS.listing}</td><td>600 × 500</td></tr><tr><td>{PLACEMENTS.sponsor}</td><td>300 × 150</td></tr>
      </table>
      <p class="tiny muted">Every banner is labelled "Sponsored" and comes with view and click counts.</p>
    </div>
    <div class="card" style="margin-top:12px"><h2 style="font-size:17px;margin-bottom:6px">Tell us what you need</h2>
      <Flash ok={c.req.query("ok")} err={c.req.query("err")} />
      <form method="post" action="/advertise">
        <div class="grid g2"><Field label="Your name" name="name" required max={80} /><Field label="Business name" name="business" required max={120} /></div>
        <div class="grid g2"><Field label="Mobile number" name="phone" type="tel" required max={16} /><Field label="Email (optional)" name="email" type="email" max={160} /></div>
        <Field label="Which placement, and for how long?" name="message" area max={800} />
        <input name="website" tabindex={-1} autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true" />
        <button class="btn" type="submit">Send</button>
      </form>
    </div>
  </main>
)));

info.post("/advertise", async (c) => {
  const f = await c.req.parseBody();
  const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  const to = (q: string) => c.redirect(`/advertise?${q}`, 303);
  if (s(f.website, 10)) return to("ok=Thanks");
  if (!s(f.name, 80) || !s(f.business, 120) || s(f.phone, 16).replace(/\D/g, "").length < 10) return to(`err=${encodeURIComponent("Please fill in your name, business name and a valid mobile number")}`);
  if (!(await allow(c.env, `adl:${clientIp(c)}`, 3, 86400))) return to(`err=${encodeURIComponent("Please try again tomorrow")}`);
  await c.env.DB.prepare(`INSERT INTO ad_leads (name, business, phone, email, message, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(s(f.name, 80), s(f.business, 120), s(f.phone, 16), s(f.email, 160) || null, s(f.message, 800) || null, now()).run();
  return to(`ok=${encodeURIComponent("Thank you. We will call you about placements and rates.")}`);
});
