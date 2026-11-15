import { type Env, getMeta, now, setMeta } from "./db";

// Industry headlines on autopilot: titles and links only, always pointing to the publisher.
const QUERIES = ["jewellery industry India", "gold price India today", "GJEPC gems jewellery exports", "BIS hallmarking gold HUID", "silver price India MCX", "diamond industry Surat"];
const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/<[^>]+>/g, "").trim();
const tag = (xml: string, t: string) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? decode(m[1]) : ""; };

export async function refreshNews(env: Env): Promise<number> {
  const last = Number((await getMeta(env, "news_at")) ?? 0);
  if (now() - last < 1100) return 0;
  await setMeta(env, "news_at", String(now()));
  const turn = Number((await getMeta(env, "news_turn")) ?? 0);
  await setMeta(env, "news_turn", String((turn + 1) % QUERIES.length));
  const q = QUERIES[turn % QUERIES.length];
  const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:7d`)}&hl=en-IN&gl=IN&ceid=IN:en`, { headers: { "user-agent": "Mozilla/5.0 (compatible; JewellerySahiHai/1.0)" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) { await setMeta(env, "news_note", `${q}: source returned ${res.status}`); return 0; }
  const xml = await res.text();
  const items = xml.split("<item>").slice(1, 26);
  const stmts = [];
  for (const it of items) {
    let title = tag(it, "title"); const link = tag(it, "link"), source = tag(it, "source"), pub = Date.parse(tag(it, "pubDate")) / 1000;
    if (!title || !/^https?:\/\//.test(link)) continue;
    if (/^top \d+|best \d+|\bOEM\b|coupon|promo code|horoscope|press release/i.test(title)) continue;
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO news (title, url, source, topic, published_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(title.slice(0, 220), link.slice(0, 900), source.slice(0, 80) || null, q, Number.isFinite(pub) ? Math.floor(pub) : now(), now()));
  }
  if (stmts.length) await env.DB.batch(stmts);
  await setMeta(env, "news_note", `${q}: ${items.length} items read, ${stmts.length} kept`);
  await env.DB.prepare(`DELETE FROM news WHERE id NOT IN (SELECT id FROM news ORDER BY published_at DESC LIMIT 800)`).run();
  return stmts.length;
}
