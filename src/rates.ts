import { type Env, getMeta, now, setMeta } from "./db";

// Live bullion rates from Shree Kalptaru Bullion's public broadcast feed.
// Gold lines are per 10 g, silver lines per kg, as published by the desk.
const FEED = "https://bcast.shreekalptarubullion.xyz:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/kalptarubullion";
export const RATE_SOURCE = { name: "Shree Kalptaru Bullion", url: "https://shreekalptarubullion.com/?utm_source=jewellerysahihai&utm_medium=rates", outlook: "https://shreekalptaru.com/?utm_source=jewellerysahihai&utm_medium=rates" };

export type RateItem = { id: string; name: string; buy: number | null; sell: number | null; high: number | null; low: number | null };
export type Rates = { at: number; items: RateItem[]; stale: boolean };
export type KeyRates = { gold995gst: number | null; gold995: number | null; goldCost: number | null; silverGst: number | null; goldUsd: number | null; silverUsd: number | null; usdInr: number | null };

function parseFeed(text: string): RateItem[] {
  const n = (v: string) => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };
  return text.split(/\r?\n/).map((l) => l.split("\t").map((c) => c.trim())).filter((c) => c.length >= 7 && c[2])
    .map((c) => ({ id: c[1], name: c[2].replace(/\s+/g, " "), buy: n(c[3]), sell: n(c[4]), high: n(c[5]), low: n(c[6]) }));
}

let mem: Rates | null = null;
let savedAt = 0;

export async function getRates(env: Env): Promise<Rates | null> {
  if (mem && Date.now() / 1000 - mem.at < 5) return mem;
  try {
    const r = await fetch(`${env.RATES_URL || FEED}?_=${Date.now()}`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(`feed ${r.status}`);
    const items = parseFeed(await r.text());
    if (!items.length) throw new Error("empty feed");
    mem = { at: now(), items, stale: false };
    if (now() - savedAt > 120) { savedAt = now(); await setMeta(env, "rates_last", JSON.stringify(mem)); }
    return mem;
  } catch (e) {
    if (mem) return { ...mem, stale: true };
    const last = await getMeta(env, "rates_last");
    if (last) { try { return { ...(JSON.parse(last) as Rates), stale: true }; } catch { /* ignore */ } }
    return null;
  }
}

const val = (i?: RateItem) => (i ? i.sell ?? i.buy : null);
export function keyRates(r: Rates | null): KeyRates {
  const it = r?.items ?? [];
  const f = (re: RegExp, not?: RegExp) => val(it.find((x) => re.test(x.name) && !(not && not.test(x.name))));
  return {
    gold995gst: f(/GOLD.*995.*GST/i), gold995: f(/GOLD.*995/i, /GST/i), goldCost: f(/GOLD COSTING/i),
    silverGst: f(/SILVER.*GST/i), goldUsd: f(/^GOLD\(\$\)/i), silverUsd: f(/^SILVER\(\$\)/i), usdInr: f(/^INR/i),
  };
}
/** Indicative retail-style rates per gram, worked out from the desk's 995 rate including GST. */
export function perGram(k: KeyRates) {
  if (!k.gold995gst) return null;
  const fine = k.gold995gst / 10 / 0.995; // 1 g of pure gold, GST included
  return { k24: fine * 0.999, k22: fine * 0.916, k18: fine * 0.75, k14: fine * 0.585, silver: k.silverGst ? k.silverGst / 1000 : null };
}
export const inr = (n: number | null | undefined, digits = 0) => (n == null ? "—" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`);

/** Called from the cron trigger: keep a point every 15 minutes for the charts. */
export async function snapshotRates(env: Env): Promise<void> {
  const last = Number((await getMeta(env, "rates_snap_at")) ?? 0);
  if (now() - last < 880) return;
  const r = await getRates(env);
  if (!r || r.stale) return;
  const k = keyRates(r);
  if (!k.gold995gst && !k.silverGst) return;
  await env.DB.prepare(`INSERT INTO rate_history (ts, gold995gst, silver_gst, gold_usd, usd_inr) VALUES (?, ?, ?, ?, ?)`).bind(now(), k.gold995gst, k.silverGst, k.goldUsd, k.usdInr).run();
  await setMeta(env, "rates_snap_at", String(now()));
}
