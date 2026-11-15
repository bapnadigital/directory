/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../auth";
import { RATE_SOURCE, getRates, inr, keyRates, perGram } from "../rates";
import { page, siteUrl } from "../ui";

export const ratesApp = new Hono<AppEnv>();
const when = (t: number) => new Date(t * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

ratesApp.get("/api/rates", async (c) => {
  const r = await getRates(c.env);
  const k = keyRates(r);
  return c.json({ ok: !!r, at: r?.at ?? null, stale: r?.stale ?? true, source: RATE_SOURCE.name, key: k, per_gram: perGram(k), items: r?.items ?? [] }, 200, { "cache-control": "public, max-age=5" });
});

/** Compact strip for the home page and tool pages. */
export async function RateStrip({ c }: { c: Context<AppEnv> }) {
  const r = await getRates(c.env);
  const k = keyRates(r);
  if (!r || (!k.gold995gst && !k.silverGst)) return <></>;
  const cell = (label: string, key: string, v: number | null, unit: string) => (
    <a class="rate" href="/rates"><span class="tiny muted">{label}</span><b data-rate={key}>{inr(v)}</b><span class="tiny muted">{unit}</span></a>
  );
  return (
    <div class="rates-strip">
      {cell("Gold 995 with GST", "gold995gst", k.gold995gst, "per 10 g")}
      {cell("Gold 995 without GST", "gold995", k.gold995, "per 10 g")}
      {cell("Silver 999 with GST", "silverGst", k.silverGst, "per kg")}
      <a class="rate src" href="/rates"><span class="tiny muted"><i class="dot" /> Live rates by</span><b style="font-size:14px">{RATE_SOURCE.name}</b><span class="tiny gold">See all rates →</span></a>
    </div>
  );
}

function spark(points: number[], w = 600, h = 120): string {
  if (points.length < 2) return "";
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  return points.map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * w).toFixed(1)} ${(h - 8 - ((p - min) / span) * (h - 16)).toFixed(1)}`).join("");
}

ratesApp.get("/rates", async (c) => {
  const r = await getRates(c.env);
  const k = keyRates(r);
  const g = perGram(k);
  const base = siteUrl(c);
  const hist = (await c.env.DB.prepare(`SELECT ts, gold995gst, silver_gst FROM rate_history WHERE ts > ? ORDER BY ts`).bind(Math.floor(Date.now() / 1000) - 7 * 86400).all<{ ts: number; gold995gst: number | null; silver_gst: number | null }>()).results;
  const gp = hist.map((x) => x.gold995gst).filter((x): x is number => x != null), sp = hist.map((x) => x.silver_gst).filter((x): x is number => x != null);
  const days = (await c.env.DB.prepare(`SELECT date(ts + 19800, 'unixepoch') AS d, min(gold995gst) AS glo, max(gold995gst) AS ghi, min(silver_gst) AS slo, max(silver_gst) AS shi,
      (SELECT h2.gold995gst FROM rate_history h2 WHERE date(h2.ts + 19800, 'unixepoch') = date(h.ts + 19800, 'unixepoch') AND h2.gold995gst IS NOT NULL ORDER BY h2.ts DESC LIMIT 1) AS gclose,
      (SELECT h2.silver_gst FROM rate_history h2 WHERE date(h2.ts + 19800, 'unixepoch') = date(h.ts + 19800, 'unixepoch') AND h2.silver_gst IS NOT NULL ORDER BY h2.ts DESC LIMIT 1) AS sclose
    FROM rate_history h WHERE ts > ? GROUP BY d ORDER BY d DESC LIMIT 15`).bind(Math.floor(Date.now() / 1000) - 16 * 86400).all<{ d: string; glo: number | null; ghi: number | null; slo: number | null; shi: number | null; gclose: number | null; sclose: number | null }>()).results;
  const dlabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" });
  const chart = (title: string, pts: number[], unit: string) => pts.length >= 4 ? (
    <div class="card"><div class="row between"><b>{title}</b><span class="tiny muted">Low {inr(Math.min(...pts))} · High {inr(Math.max(...pts))} {unit}</span></div>
      <svg viewBox="0 0 600 120" preserveAspectRatio="none" style="width:100%;height:120px;margin-top:8px"><path d={spark(pts)} fill="none" stroke="#b8860b" stroke-width="2" vector-effect="non-scaling-stroke" /></svg>
      <div class="tiny muted">Last 7 days, a point every 15 minutes while the desk is live.</div></div>
  ) : null;
  return page(c, {
    title: "Live gold and silver rates today — bullion rates by Shree Kalptaru Bullion",
    desc: "Live gold 995, gold 999 and silver rates in India with and without GST, updated every few seconds from Shree Kalptaru Bullion, Mumbai. Per gram rates for 24K, 22K and 18K.",
    path: "/rates",
  }, (
    <main class="wrap" style="padding-top:26px">
      <div class="eyebrow"><i class="dot" /> Live bullion rates</div>
      <h1 style="font-size:30px;margin:6px 0">Gold and silver rates today</h1>
      <p class="muted small" style="max-width:680px">Rates are published by <a class="gold" href={RATE_SOURCE.url} target="_blank" rel="noopener">{RATE_SOURCE.name}</a>, Mumbai, and refresh on this page every few seconds. {r ? <>Last update: <span data-rate-at>{when(r.at)}</span>{r.stale ? " (desk feed is not responding right now; showing the last rate received)" : ""}.</> : "The desk feed is not responding right now."}</p>

      {r && (
        <div class="grid g2" style="margin-top:18px">
          <div class="card">
            <b>Bullion desk rates</b>
            <table class="fit" style="margin-top:8px"><tr><th>Product</th><th>Buy</th><th>Sell</th><th class="opt">High</th><th class="opt">Low</th></tr>
              {r.items.filter((x) => !/\(\$\)/.test(x.name)).map((x) => <tr><td>{x.name}</td><td data-item={`${x.id}:buy`}>{x.buy ?? "—"}</td><td data-item={`${x.id}:sell`}><b>{x.sell ?? "—"}</b></td><td class="opt" data-item={`${x.id}:high`}>{x.high ?? "—"}</td><td class="opt" data-item={`${x.id}:low`}>{x.low ?? "—"}</td></tr>)}
            </table>
            <p class="tiny muted">Gold is per 10 g and silver per kg, in rupees. "Costing" is the landed cost worked from international prices.</p>
          </div>
          <div class="stack">
            {g && (
              <div class="card">
                <b>Indicative rate per gram (GST included)</b>
                <table class="fit" style="margin-top:8px"><tr><th>Purity</th><th>Per gram</th><th>Per 10 g</th></tr>
                  {([["24K (999)", "k24", g.k24], ["22K (916)", "k22", g.k22], ["18K (750)", "k18", g.k18], ["14K (585)", "k14", g.k14]] as const).map(([l, key, v]) => <tr><td>{l}</td><td data-gram={key}><b>{inr(v)}</b></td><td data-gram10={key}>{inr(v * 10)}</td></tr>)}
                  {g.silver != null && <tr><td>Silver 999</td><td data-gram="silver"><b>{inr(g.silver, 2)}</b></td><td data-gram10="silver">{inr(g.silver * 10)}</td></tr>}
                </table>
                <p class="tiny muted">Worked out from the 995 bullion rate including GST. Jewellery prices also include making charges and vary by shop.</p>
              </div>
            )}
            <div class="card">
              <b>International</b>
              <div class="row" style="gap:22px;margin-top:8px">
                <div><div class="tiny muted">Gold $/oz</div><b data-rate="goldUsd">{k.goldUsd ?? "—"}</b></div>
                <div><div class="tiny muted">Silver $/oz</div><b data-rate="silverUsd">{k.silverUsd ?? "—"}</b></div>
                <div><div class="tiny muted">USD / INR</div><b data-rate="usdInr">{k.usdInr ?? "—"}</b></div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div class="grid g2" style="margin-top:16px">{chart("Gold 995 with GST, per 10 g", gp, "")}{chart("Silver 999 with GST, per kg", sp, "")}</div>

      {days.length > 0 && (
        <div class="card" style="margin-top:16px">
          <b>Day by day</b>
          <table class="fit" style="margin-top:8px"><tr><th>Date</th><th>Gold last</th><th class="opt">Gold low – high</th><th>Silver last</th><th class="opt">Silver low – high</th></tr>
            {days.map((d, i) => { const prev = days[i + 1]; const ch = prev?.gclose && d.gclose ? d.gclose - prev.gclose : null; return (
              <tr><td>{dlabel(d.d)}</td><td><b>{inr(d.gclose)}</b>{ch != null && ch !== 0 ? <span class="tiny" style={`margin-left:6px;color:${ch > 0 ? "#34d399" : "#f87171"}`}>{ch > 0 ? "▲" : "▼"} {Math.abs(Math.round(ch)).toLocaleString("en-IN")}</span> : null}</td><td class="opt">{inr(d.glo)} – {inr(d.ghi)}</td><td><b>{inr(d.sclose)}</b></td><td class="opt">{inr(d.slo)} – {inr(d.shi)}</td></tr>
            ); })}
          </table>
          <p class="tiny muted">Gold 995 with GST per 10 g and silver 999 with GST per kg. "Last" is the final rate recorded that day.</p>
        </div>
      )}

      <div class="band" style="margin-top:20px;padding:26px">
        <div class="eyebrow">Rate partner</div>
        <h2 style="font-size:22px;margin-top:6px">Book bullion at these rates with {RATE_SOURCE.name}</h2>
        <p class="muted small">Gold 995 and 999 bars, silver 999, T+0 and fixed-date delivery in Mumbai.</p>
        <div class="row" style="justify-content:center"><a class="btn" href={RATE_SOURCE.url} target="_blank" rel="noopener">Open the bullion desk</a><a class="btn ghost" href={RATE_SOURCE.outlook} target="_blank" rel="noopener">Daily gold and silver outlook</a></div>
      </div>

      <div class="grid g2" style="margin-top:16px">
        <div class="card">
          <b>Share today's rate</b>
          <p class="small muted">Send the current rate to your customers or groups on WhatsApp.</p>
          <a class="btn wa sm" target="_blank" rel="noopener" href={`https://wa.me/?text=${encodeURIComponent(`Gold and silver rates (${r ? when(r.at) : "today"})\nGold 995 with GST: ${inr(k.gold995gst)} per 10 g\nGold 995 without GST: ${inr(k.gold995)} per 10 g\nSilver 999 with GST: ${inr(k.silverGst)} per kg\n\nLive rates by ${RATE_SOURCE.name}: ${base}/rates`)}`}>Share on WhatsApp</a>
        </div>
        <div class="card">
          <b>Show live rates on your website</b>
          <p class="small muted">Free for jewellers. Copy this code into your website and the rates update by themselves.</p>
          <textarea readonly rows={3} style="font-family:monospace;font-size:12px" onclick="this.select()">{`<iframe src="${base}/widget/rates" width="100%" height="230" style="border:0;max-width:420px" loading="lazy" title="Live gold and silver rates"></iframe>`}</textarea>
          <button class="btn ghost sm" style="margin-top:8px" data-copy={`<iframe src="${base}/widget/rates" width="100%" height="230" style="border:0;max-width:420px" loading="lazy" title="Live gold and silver rates"></iframe>`}>Copy code</button>
        </div>
      </div>

      <div class="grid g3" style="margin-top:16px">
        <a class="card" href="/tools/gold-price-calculator"><b>🧮 Gold price calculator</b><p class="small muted">Weight, purity, making and GST at today's rate.</p></a>
        <a class="card" href="/tools/bullion-rate-converter"><b>🔁 995 / 999 rate converter</b><p class="small muted">Compare rates with and without GST on one basis.</p></a>
        <a class="card" href="/category/bullion"><b>🪙 Bullion dealers</b><p class="small muted">Find bullion dealers in the directory.</p></a>
      </div>
      <p class="tiny muted" style="margin-top:16px">Rates are indicative and for information only. Confirm the final rate with the dealer before any transaction.</p>
    </main>
  ));
});

// Embeddable rate card for jewellers' own websites.
ratesApp.get("/widget/rates", async (c) => {
  const r = await getRates(c.env);
  const k = keyRates(r), g = perGram(k), base = siteUrl(c);
  return page(c, { title: "Live gold and silver rates", noindex: true, bare: true, bodyStyle: "background:#ffffff;margin:0" }, (
    <div style="padding:14px;font-size:14px">
      <div class="row between"><b><i class="dot" /> Live rates</b><span class="tiny muted" data-rate-at>{r ? when(r.at) : ""}</span></div>
      <div class="kv"><span>Gold 995 with GST / 10 g</span><b class="gold" data-rate="gold995gst">{inr(k.gold995gst)}</b></div>
      <div class="kv"><span>22K (916) per gram</span><b class="gold" data-gram="k22">{g ? inr(g.k22) : "—"}</b></div>
      <div class="kv"><span>24K (999) per gram</span><b class="gold" data-gram="k24">{g ? inr(g.k24) : "—"}</b></div>
      <div class="kv"><span>Silver 999 with GST / kg</span><b class="gold" data-rate="silverGst">{inr(k.silverGst)}</b></div>
      <div class="tiny muted" style="margin-top:8px">Rates by <a class="gold" href={RATE_SOURCE.url} target="_blank" rel="noopener">{RATE_SOURCE.name}</a> · <a class="gold" href={`${base}/rates`} target="_blank" rel="noopener">jewellerysahihai.com</a></div>
    </div>
  ));
});
