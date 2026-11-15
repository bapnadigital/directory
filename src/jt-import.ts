import { JT_ALLIED, JT_CHUNKS, JT_TOTAL } from "./data/jt-index";
import { type Env, getMeta, now, setMeta } from "./db";
import { citySlug } from "./import";

// One-time load of the trade-directory listings bundled with the app.
// Name, city and address become public listings; mobile, landline and email
// go to private_contacts, which only paid members can reveal.
type Row = [slug: string, name: string, city: string, address: string, mobile: string, tel: string, email: string];

export const jtTotal = JT_TOTAL;

export async function importJtBatch(env: Env, chunks = 1): Promise<{ done: boolean; chunk: number; of: number }> {
  let i = Number((await getMeta(env, "jt_chunk")) ?? 0);
  for (let k = 0; k < chunks && i < JT_CHUNKS.length; k++, i++) {
    const rows = JSON.parse(JT_CHUNKS[i]) as Row[];
    const t = now();
    const stmts: D1PreparedStatement[] = [];
    for (const r of rows) {
      stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO businesses (slug, name, city, city_slug, address, source, created_at) VALUES (?, ?, ?, ?, ?, 'jt2023', ?)`)
        .bind(r[0], r[1], r[2] || null, citySlug(r[2] || null), r[3] || null, t - 100000 - i));
      if (r[4] || r[5] || r[6]) stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO private_contacts (business_id, mobile, tel, email) SELECT id, ?, ?, ? FROM businesses WHERE slug = ? AND source = 'jt2023'`)
        .bind(r[4] || null, r[5] || null, r[6] || null, r[0]));
    }
    for (let s = 0; s < stmts.length; s += 100) await env.DB.batch(stmts.slice(s, s + 100));
    await setMeta(env, "jt_chunk", String(i + 1));
  }
  return { done: i >= JT_CHUNKS.length, chunk: i, of: JT_CHUNKS.length };
}

/** One-time: tag listings from the directory's Allied Section so they appear under "Allied services". */
export async function tagAllied(env: Env): Promise<void> {
  if ((await getMeta(env, "jt_allied")) === "1") return;
  const slugs = JSON.parse(JT_ALLIED) as string[];
  if (!slugs.length) return;
  const stmts = slugs.map((s) => env.DB.prepare(`INSERT OR IGNORE INTO business_types (business_id, type) SELECT id, 'allied' FROM businesses WHERE slug = ? AND source = 'jt2023'`).bind(s));
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  await setMeta(env, "jt_allied", "1");
}
