/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { raw } from "hono/html";
import qrcode from "qrcode-generator";
import type { AppEnv } from "../auth";
import { page, siteUrl } from "../ui";
import { getRates, inr, keyRates, perGram, RATE_SOURCE } from "../rates";

// QR code for a listing, a printable counter standee, and a full-screen rate board for a shop TV.
export const growth = new Hono<AppEnv>();
const BOT = /bot|crawl|spider|slurp|preview|fetch|monitor|curl|wget|python|headless|lighthouse|scrapy|httpclient|okhttp|axios|go-http|java\//i;
export const isBot = (ua?: string | null) => !ua || ua.length < 20 || BOT.test(ua);
export const today = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

export function qrSvg(text: string, size = 320): string {
  const q = qrcode(0, "M"); q.addData(text); q.make();
  const n = q.getModuleCount(), m = 2, total = n + m * 2;
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + m} ${y + m}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#0b1f44"/></svg>`;
}

const biz = (db: D1Database, slug: string) => db.prepare(`SELECT id, slug, name, city, owner_id, logo_image FROM businesses WHERE slug = ?`).bind(slug.toLowerCase()).first<{ id: number; slug: string; name: string; city: string | null; owner_id: number | null; logo_image: string | null }>();

growth.get("/b/:slug/qr.svg", async (c) => {
  const b = await biz(c.env.DB, c.req.param("slug"));
  if (!b) return c.notFound();
  return c.body(qrSvg(`${siteUrl(c)}/b/${b.slug}?s=qr`), 200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" });
});

growth.get("/b/:slug/standee", async (c) => {
  const b = await biz(c.env.DB, c.req.param("slug"));
  if (!b) return c.notFound();
  const url = `${siteUrl(c)}/b/${b.slug}`;
  return c.html(<html lang="en-IN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex" /><title>{`Standee — ${b.name}`}</title>
    <style>{raw(`@page{size:A5;margin:0}*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#14213d;background:#eef0f5}.sheet{width:148mm;min-height:210mm;margin:16px auto;background:#fff;padding:14mm 12mm;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:space-between;border:1px solid #dfe3ec}h1{font-size:26px;margin:0 0 4px}h2{font-size:20px;margin:0;color:#9a6a0c}.qr{width:84mm;height:84mm;border:3px solid #0b1f44;border-radius:14px;padding:6px}.qr svg{width:100%;height:100%}ul{list-style:none;padding:0;margin:0;font-size:15px;line-height:1.9}.foot{font-size:12px;color:#5b6478}.bar{position:fixed;top:0;left:0;right:0;background:#0b1f44;color:#fff;padding:10px;text-align:center}.bar button{background:#e6b84a;border:0;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer}@media print{.bar{display:none}body{background:#fff}.sheet{margin:0;border:0}}@media screen{body{padding-top:52px}}`)}</style></head>
    <body><div class="bar">Print this on A5 or A4 and keep it at your counter. <button type="button" onclick="window.print()">Print</button></div>
      <div class="sheet">
        <div><h2>Find us on Jewellery Sahi Hai</h2><h1>{b.name}</h1>{b.city && <div class="foot">{b.city}</div>}</div>
        <div class="qr">{raw(qrSvg(`${url}?s=qr`, 320))}</div>
        <ul><li>📷 Scan with your phone camera</li><li>💎 See our catalogue</li><li>⭐ Rate your experience</li><li>💬 Enquire on WhatsApp</li></ul>
        <div class="foot">{url.replace(/^https?:\/\//, "")}</div>
      </div></body></html>);
});

// Full-screen live rate board for a shop TV or tablet. Refreshes itself every minute.
growth.get("/b/:slug/rate-board", async (c) => {
  const b = await biz(c.env.DB, c.req.param("slug"));
  if (!b || !b.owner_id) return c.notFound();
  const r = await getRates(c.env), k = keyRates(r), g = perGram(k);
  const when = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(11, 16);
  const rows: [string, string][] = g ? [["24K gold", inr(g.k24)], ["22K gold", inr(g.k22)], ["18K gold", inr(g.k18)], ["Silver", g.silver != null ? inr(g.silver, 2) : "—"]] : [];
  return c.html(<html lang="en-IN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta http-equiv="refresh" content="60" /><meta name="robots" content="noindex" /><title>{`Today's rates — ${b.name}`}</title>
    <style>{raw(`*{box-sizing:border-box}html,body{height:100%}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0b1f44;color:#fff;display:flex;flex-direction:column;padding:4vh 5vw}header{display:flex;align-items:center;gap:2vw}header img{height:11vh;border-radius:2vh;background:#fff}h1{font-size:6vh;margin:0}.sub{color:#e6b84a;font-size:3vh;letter-spacing:.12em;text-transform:uppercase}main{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:3vh 3vw;margin:4vh 0}.c{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:3vh;padding:3vh 3vw;display:flex;flex-direction:column;justify-content:center}.c span{font-size:3.4vh;color:#cfd6e6}.c b{font-size:10vh;line-height:1.1;color:#f3d27a}.c small{font-size:2.4vh;color:#9fb0cf}footer{display:flex;justify-content:space-between;font-size:2.2vh;color:#9fb0cf}@media(max-width:700px){main{grid-template-columns:1fr}.c b{font-size:7vh}}`)}</style></head>
    <body>
      <header>{b.logo_image && <img src={`/img/${b.logo_image}`} alt="" />}<div><div class="sub">Today's rates</div><h1>{b.name}</h1></div></header>
      <main>{rows.length ? rows.map(([l, v]) => <div class="c"><span>{l}</span><b>{v}</b><small>per gram, GST included</small></div>) : <div class="c"><span>Rates are loading. This screen refreshes every minute.</span></div>}</main>
      <footer><span>Indicative rates at {when}. Making charges extra. Confirm at the counter.</span><span>Rates by {RATE_SOURCE.name}</span></footer>
    </body></html>);
});
