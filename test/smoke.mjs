// End-to-end smoke test against a local dev server:  npx wrangler dev --port 8799  then  node test/smoke.mjs
const BASE = process.env.BASE || "http://localhost:8799";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`); };

function client() {
  let cookie = "";
  return async function req(path, { method = "GET", form, multipart, origin = BASE } = {}) {
    const headers = { cookie };
    if (method !== "GET" && origin) headers.origin = origin;
    let body;
    if (form) { body = new URLSearchParams(form); }
    if (multipart) { body = new FormData(); for (const [k, v] of Object.entries(multipart)) Array.isArray(v) ? v.forEach((x) => body.append(k, x)) : body.append(k, v); }
    const res = await fetch(BASE + path, { method, headers, body, redirect: "manual" });
    const sc = res.headers.getSetCookie?.() ?? [];
    for (const c of sc) { const [kv] = c.split(";"); if (kv.startsWith("sid=")) cookie = kv.endsWith("=") ? "" : kv; }
    return { status: res.status, loc: res.headers.get("location") ?? "", text: await res.text(), type: res.headers.get("content-type") ?? "" };
  };
}
// 1x1 JPEG
const JPEG = Uint8Array.from(atob("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k="), (c) => c.charCodeAt(0));
const jpg = () => new File([JPEG], "p.jpg", { type: "image/jpeg" });

const anon = client(), adminC = client(), owner = client(), other = client();
const uniq = Date.now().toString(36);

let r = await anon("/"); ok("home page", r.status === 200 && r.text.includes("Find the right jeweller"));
r = await anon("/directory"); ok("directory lists seeded businesses", r.status === 200 && r.text.includes("Test Gold Jewellers"));
r = await anon("/directory?q=diam"); ok("search filters", r.text.includes("Sparkle Diam") && !r.text.includes("Test Gold Jewellers"));
r = await anon("/city/mumbai"); ok("city page", r.status === 200 && r.text.includes("Jewellers in Mumbai"));
r = await anon("/category/diamonds"); ok("category page (keyword match)", r.status === 200 && r.text.includes("Sparkle Diam"));
r = await anon("/b/test-gold-jewellers"); ok("unclaimed listing hides contact + shows claim", r.status === 200 && r.text.includes("Claim this listing") && !r.text.includes("wa.me/9") && !r.text.includes("tel:"));
r = await anon("/nope"); ok("404 page", r.status === 404);
r = await anon("/robots.txt"); ok("robots.txt", r.text.includes("Sitemap:"));
r = await anon("/sitemap.xml"); ok("sitemap index", r.text.includes("/sitemap/b-1.xml"));
r = await anon("/sitemap/b-1.xml"); ok("business sitemap", r.text.includes("/b/test-gold-jewellers"));
r = await anon("/dashboard"); ok("dashboard needs login", r.status === 302 && r.loc.startsWith("/login"));

// accounts
r = await adminC("/signup", { method: "POST", form: { name: "Admin One", email: `admin-${uniq}@example.test`, phone: "9820000001", password: "test-pass-123" } });
ok("first signup works", r.status === 303);
r = await adminC("/admin"); const isFirstRun = r.status === 200; ok("first account is admin (fresh DB only)", isFirstRun, "re-run on a fresh local DB");
r = await owner("/signup", { method: "POST", form: { name: "<script>alert(1)</script> Owner", email: `owner-${uniq}@example.test`, phone: "9820000002", password: "owner-pass-123" } });
ok("second signup", r.status === 303);
r = await owner("/admin"); ok("non-admin blocked from admin", r.status === 403);
r = await anon("/login", { method: "POST", form: { email: `owner-${uniq}@example.test`, password: "wrong-password" } }); ok("wrong password rejected", r.loc.includes("err="));
r = await anon("/signup", { method: "POST", form: { name: "X Y", email: "x@example.test", phone: "9820000009", password: "test-pass-123" }, origin: "https://evil.example" }); ok("cross-site POST blocked", r.status === 403);
r = await anon("/signup", { method: "POST", form: { name: "X Y", email: "bad", phone: "9820000009", password: "short" } }); ok("signup validation", r.loc.includes("err="));

// claim flow
r = await owner("/dashboard/claim?q=Test+Gold"); ok("claim search finds business", r.text.includes("This is mine"));
r = await owner("/dashboard/claim", { method: "POST", form: { b: "test-gold-jewellers", role: "Owner", phone: "9820000002", note: "hello" } }); ok("claim without certificate refused", r.loc.includes("err="));
r = await owner("/dashboard/claim", { method: "POST", multipart: { b: "test-gold-jewellers", role: "Owner", phone: "9820000002", note: "hello", doc: jpg() } }); ok("claim submitted with certificate", r.status === 303 && r.loc.includes("ok="), r.loc);
r = await owner("/dashboard/products"); ok("no access before approval", r.text.includes("don't have a business listing") || r.text.includes("Set up your business"));
if (isFirstRun) {
  r = await adminC("/admin"); const m = /\/admin\/claims\/(\d+)\/approve/.exec(r.text); ok("admin sees claim, owner name escaped", !!m && !r.text.includes("<script>alert(1)"));
  r = await adminC(`/admin/claims/${m[1]}/approve`, { method: "POST" }); ok("claim approved", r.loc.includes("ok="));

  r = await owner("/dashboard"); ok("owner dashboard", r.status === 200 && r.text.includes("Profile views"));
  r = await owner("/dashboard/profile", { method: "POST", multipart: { name: "Test Gold Jewellers", city: "Mumbai", about: "Since 1980 <b>bold</b>", phone: "9820000002", whatsapp: "9820000002", website: "javascript:alert(1)", instagram: "instagram.com/testgold", theme: "emerald", types: ["manufacturer", "retailer", "pizza"], logo: jpg() } });
  ok("profile saved", r.loc.includes("ok="));
  r = await owner("/dashboard/products", { method: "POST", multipart: { name: "22K Temple Necklace", category: "Necklaces", weight: "24.5 g", purity: "22K", image: jpg() } }); ok("product added", r.loc.includes("ok="));
  r = await owner("/dashboard/products", { method: "POST", multipart: { name: "Bad file", image: new File(["<svg onload=alert(1)>"], "x.svg", { type: "image/svg+xml" }) } }); ok("non-image upload rejected", r.loc.includes("err="));
  r = await owner("/dashboard/links", { method: "POST", form: { title: "New collection", url: "example.com/new" } }); ok("link added", r.loc.includes("ok="));
  r = await owner("/dashboard/links", { method: "POST", form: { title: "Evil", url: "javascript:alert(1)" } }); ok("javascript: link rejected", r.loc.includes("err="));
  r = await owner("/dashboard/extras", { method: "POST", multipart: { kind: "faq", title: "Do you make custom designs?", body: "Yes, in 2 weeks." } }); ok("FAQ added", r.loc.includes("ok="));
  r = await owner("/dashboard/extras", { method: "POST", multipart: { kind: "offer", title: "Zero making" } }); ok("offer blocked on free plan", r.loc.includes("err="));
  r = await owner("/dashboard/extras", { method: "POST", multipart: { kind: "gallery", title: "Showroom", image: jpg() } }); ok("gallery photo added", r.loc.includes("ok="));

  r = await anon("/b/test-gold-jewellers");
  ok("claimed listing shows contact, catalogue, FAQ, types", r.text.includes("wa.me/919820000002") && r.text.includes("22K Temple Necklace") && r.text.includes("custom designs") && r.text.includes("Manufacturers") && r.text.includes("Verified owner"));
  ok("HTML in about is escaped; js: website dropped", r.text.includes("&lt;b&gt;bold") && !r.text.includes("javascript:alert"));
  const img = /\/img\/(\d+)/.exec(r.text); r = await anon(img ? img[0] : "/img/0"); ok("image served", r.status === 200 && r.type === "image/jpeg");
  r = await anon("/b/test-gold-jewellers/catalogue"); ok("catalogue page", r.text.includes("Order on WhatsApp"));
  const pid = /\/go\/p\/(\d+)/.exec(r.text)[1];
  r = await anon(`/go/p/${pid}`); ok("WhatsApp order redirect", r.status === 302 && r.loc.startsWith("https://wa.me/919820000002"));
  r = await anon("/bio/test-gold-jewellers"); ok("bio page with theme, links, powered-by", r.text.includes("New collection") && r.text.includes("#06201a") && r.text.includes("Powered by"));
  const lid = /\/go\/l\/(\d+)/.exec(r.text)[1];
  r = await anon(`/go/l/${lid}`); ok("link redirect + tracking", r.status === 302 && r.loc === "https://example.com/new");
  r = await anon("/b/test-gold-jewellers/qr.svg"); ok("QR code", r.type.includes("svg") && r.text.includes("<svg"));
  r = await anon("/b/test-gold-jewellers/vcard.vcf"); ok("vCard", r.text.includes("BEGIN:VCARD") && r.text.includes("TEL"));

  r = await anon("/b/test-gold-jewellers/enquiry", { method: "POST", form: { name: "Ravi", phone: "98200 12345", message: "Need bangles", product_id: pid } }); ok("enquiry sent", r.loc.includes("sent=1"));
  r = await anon("/b/test-gold-jewellers/enquiry", { method: "POST", form: { name: "Ravi", phone: "12", message: "x" } }); ok("enquiry validation", r.loc.includes("err="));
  r = await owner("/dashboard/enquiries"); ok("owner sees enquiry", r.text.includes("Ravi") && r.text.includes("Need bangles"));

  // another user can't touch owner's data
  await other("/signup", { method: "POST", form: { name: "Other User", email: `other-${uniq}@example.test`, phone: "9820000003", password: "other-pass-123" } });
  await other(`/dashboard/products/${pid}/delete`, { method: "POST" });
  r = await anon("/b/test-gold-jewellers/catalogue"); ok("other user cannot delete owner's product", r.text.includes("22K Temple Necklace"));
  r = await other("/dashboard/claim?b=test-gold-jewellers"); ok("already-claimed listing can't be claimed", r.text.includes("already been claimed"));
  r = await other("/dashboard/new", { method: "POST", form: { name: "Fresh Silver House", city: "Jaipur", gst: "" } }); ok("new listing created", r.loc.includes("ok="));
  r = await anon("/directory?q=Fresh+Silver"); ok("new listing in directory", r.text.includes("Fresh Silver House"));

  // membership
  r = await owner("/dashboard/membership", { method: "POST", form: { plan: "premium_yearly" } }); ok("membership request (manual mode)", r.loc.includes("ok="));
  r = await adminC("/admin"); const pm = /\/admin\/payments\/(\d+)\/activate/.exec(r.text); ok("admin sees membership request", !!pm);
  r = await adminC(`/admin/payments/${pm[1]}/activate`, { method: "POST" }); ok("premium activated", r.loc.includes("ok="));
  r = await owner("/dashboard/extras", { method: "POST", multipart: { kind: "offer", title: "Zero making charges" } }); ok("offer allowed on premium", r.loc.includes("ok="));
  r = await anon("/"); ok("featured on homepage", r.text.includes("Premium members") && r.text.includes("Featured"));
  r = await anon("/bio/test-gold-jewellers"); ok("premium bio has no powered-by", !r.text.includes("Powered by"));
  r = await owner("/logout", { method: "POST" }); r = await owner("/dashboard"); ok("logout works", r.status === 302);
}
// newer sections
for (const u of ["/rates", "/api/rates", "/tools", "/tools/gold-price-calculator", "/tools/bullion-rate-converter", "/requirements", "/requirements/new", "/news", "/events", "/states", "/categories", "/cities", "/widget/rates", "/sitemap/pages.xml", "/about", "/advertise", "/terms", "/privacy", "/city/mumbai/bullion", "/city/mumbai/retailer"]) {
  r = await anon(u); ok(`GET ${u}`, r.status === 200, String(r.status));
}
r = await anon("/requirements/new", { method: "POST", form: { title: "Smoke test requirement 22K chains", city: "Mumbai", name: "Smoke", phone: "9800000000" } });
ok("post requirement", r.status === 303 && /\/requirements\/\d+/.test(r.loc), r.loc);
r = await anon(r.loc.split("?")[0].replace(BASE, "")); ok("requirement hides phone from public", r.status === 200 && !r.text.includes("9800000000"));
r = await anon("/category/allied"); ok("allied category is not everything", r.status === 200);
// reviews
r = await other("/b/test-gold-jewellers/review", { method: "POST", form: { rating: "4", body: "Good finish, on-time delivery" } }); ok("review posted", r.loc.includes("rok="), r.loc);
r = await other("/b/test-gold-jewellers/review", { method: "POST", form: { rating: "5", body: "Updated" } });
r = await anon("/b/test-gold-jewellers"); ok("one review per user, shown with rating", r.text.includes("1 review<") && r.text.includes("aggregateRating") && r.text.includes("Updated"));
await owner("/login", { method: "POST", form: { email: `owner-${uniq}@example.test`, password: "owner-pass-123" } });
r = await owner("/b/test-gold-jewellers/review", { method: "POST", form: { rating: "5" } }); ok("owner cannot review own business", r.loc.includes("rerr="));
r = await anon("/b/test-gold-jewellers/review", { method: "POST", form: { rating: "5" } }); ok("review needs sign-in", r.loc.includes("/login"));
r = await other("/b/sparkle-diam/review", { method: "POST", form: { rating: "5" } }); ok("unclaimed listing takes no reviews", r.loc.includes("rerr="));
r = await adminC("/admin?lq=sparkle"); ok("admin listing search", r.text.includes("Sparkle Diam") && r.text.includes("Delete listing"));
r = await other("/admin/listings/1/delete", { method: "POST" }); ok("non-admin cannot delete listing", r.status !== 303 || !r.loc.includes("ok="));
r = await other("/b/sparkle-diam/save", { method: "POST" }); r = await other("/saved"); ok("save listing to shortlist", r.text.includes("Sparkle Diam"));
r = await other("/b/sparkle-diam/save", { method: "POST" }); r = await other("/saved"); ok("unsave listing", !r.text.includes("Sparkle Diam"));
r = await anon("/saved"); ok("saved needs sign-in", r.status === 302);
r = await anon("/requirements/new", { method: "POST", form: { kind: "hire", title: "Hiring CAD designer for gold", city: "Rajkot", name: "Hr Person", phone: "9811111111" } });
const jobPath = r.loc.split("?")[0].replace(BASE, "");
r = await anon("/requirements?kind=hire"); ok("job post listed under Jobs", r.text.includes("Hiring CAD designer"));
r = await anon("/requirements?kind=sell"); ok("kind filter excludes others", !r.text.includes("Hiring CAD designer"));
r = await anon(jobPath); ok("job contact hidden from public", !r.text.includes("9811111111") && r.text.includes("Employer contact"));
r = await other(jobPath); ok("job contact shown to any signed-in member", r.text.includes("9811111111"));
r = await anon("/rates/subscribe", { method: "POST", form: { email: "rates@example.test" } }); ok("rate email sign-up", r.loc.includes("ok="));
r = await anon("/rates/subscribe", { method: "POST", form: { email: "nope" } }); ok("rate email validates address", r.loc.includes("err="));
r = await anon("/rates/confirm?t=bad"); ok("bad confirm link rejected", r.loc.includes("err="));
r = await anon("/guides"); ok("guides index", r.status === 200 && r.text.includes("BIS hallmark"));
r = await anon("/guides/gst-on-gold-jewellery"); ok("guide page", r.status === 200 && r.text.includes("3% GST"));
r = await anon("/guides/nope"); ok("unknown guide 404", r.status === 404);
r = await other("/rates/alerts", { method: "POST", form: { metal: "gold", dir: "below", target: "120000" } }); ok("rate alert set", r.loc.includes("aok="));
r = await other("/rates"); ok("rate alert listed for its owner", r.text.includes("1,20,000"));
r = await anon("/rates"); ok("rate alerts private", !r.text.includes("1,20,000") && r.text.includes("Sign in</a> to set a rate alert"));
r = await other("/rates/alerts", { method: "POST", form: { metal: "tin", dir: "below", target: "5" } }); ok("rate alert validation", r.loc.includes("aerr="));
r = await anon("/directory?sort=rated"); ok("top rated sort shows rating on card", r.status === 200 && /★ 5\.0 \(1\)/.test(r.text) && r.text.indexOf("Test Gold Jewellers") < r.text.indexOf("Sparkle Diam"));
r = await anon("/requirements?q=CAD+designer&city=Raj"); ok("trade board search", r.text.includes("Hiring CAD designer"));
r = await anon("/requirements?q=zzzznothing"); ok("trade board search excludes", !r.text.includes("Hiring CAD designer"));
r = await other("/requirements/new", { method: "POST", form: { kind: "sell", title: "Closing stock of silver payal", city: "Agra", name: "Other User", phone: "9822222222" } });
const ownPath = r.loc.split("?")[0].replace(BASE, "");
r = await owner(ownPath + "/close", { method: "POST" }); r = await anon(ownPath); ok("stranger cannot close a post", !r.text.includes("Closed"));
r = await other(ownPath + "/close", { method: "POST" }); r = await anon(ownPath); ok("poster can close own post", r.text.includes("Closed"));
r = await owner("/dashboard/reviews"); ok("owner reviews page", r.status === 200 && r.text.includes("Ask customers for a review") && r.text.includes("Updated"));
r = await anon("/guides/995-vs-999-gold"); ok("guide has article markup", r.text.includes('"@type":"Article"'));
r = await anon("/tools/gold-landed-cost-calculator"); ok("landed cost calculator", r.status === 200 && r.text.includes("landed cost"));
r = await anon("/city/mumbai"); ok("city page has breadcrumbs", r.text.includes("BreadcrumbList"));
r = await adminC("/admin"); ok("admin shows claim invitations, nothing queued", r.text.includes("Claim invitations") && r.text.includes("<b>0</b> waiting to go"));
r = await other("/admin/invites", { method: "POST", form: { n: "50" } }); r = await adminC("/admin"); ok("non-admin cannot queue invitations", r.text.includes("<b>0</b> waiting to go"));
r = await anon("/optout?e=a@b.co&t=bad"); ok("bad opt-out link rejected", r.text.includes("not valid"));
r = await anon("/hi"); ok("Hindi page", r.status === 200 && r.text.includes("डायरेक्टरी"));
r = await anon("/gu"); ok("Gujarati page", r.status === 200 && r.text.includes("ડિરેક્ટરી"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
