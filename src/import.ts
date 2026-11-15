import { stateFromGst } from "./content";
import { type Env, getMeta, now, setMeta, slugify } from "./db";

// One-time import of public directory data (name, GSTIN, city, registration
// date/status) from the previous site. Runs in small batches from the cron
// trigger until finished. Only fields already shown publicly are copied.

type Row = { slug: string | null; name: string; display_name?: string; gst: string; city: string | null; gst_registration_date?: string | null; gst_registration_status?: string | null };

const CITY_ALIAS: Record<string, string> = { bangalore: "bengaluru", bombay: "mumbai", "new-delhi": "delhi", calcutta: "kolkata", madras: "chennai", cochin: "kochi", ernakulam: "kochi", trichur: "thrissur" };
export const citySlug = (city?: string | null) => { const s = slugify(city ?? ""); return city ? (CITY_ALIAS[s] ?? s) : null; };
const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase());

const PAGE = 100;

export async function importBatch(env: Env, pages = 4): Promise<{ done: boolean; offset: number; note?: string }> {
  if (!env.IMPORT_URL || !env.IMPORT_KEY) return { done: true, offset: 0, note: "import not configured" };
  if ((await getMeta(env, "import_done")) === "1") return { done: true, offset: Number((await getMeta(env, "import_offset")) ?? 0) };
  let offset = Number((await getMeta(env, "import_offset")) ?? 0);
  for (let i = 0; i < pages; i++) {
    const res = await fetch(`${env.IMPORT_URL}/rest/v1/rpc/directory_search`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: env.IMPORT_KEY, authorization: `Bearer ${env.IMPORT_KEY}` },
      body: JSON.stringify({ _q: null, _city: null, _verified_only: false, _claimed_only: false, _min_score: null, _limit: PAGE, _offset: offset, _min_years: null }),
    });
    if (!res.ok) { const note = `source returned ${res.status}`; await setMeta(env, "import_note", note); return { done: false, offset, note }; }
    const data = (await res.json()) as { total?: number; results?: Row[] };
    const rows = data.results ?? [];
    if (data.total != null) await setMeta(env, "import_total", String(data.total));
    const t = now();
    const stmts = rows.filter((r) => r.gst && r.name).map((r) => {
      const name = (r.display_name || r.name).trim().slice(0, 120);
      const slug = (r.slug || `${slugify(name)}-${r.gst.slice(-4).toLowerCase()}`).toLowerCase();
      const city = r.city ? titleCase(r.city.trim()).slice(0, 60) : null;
      return env.DB.prepare(`INSERT OR IGNORE INTO businesses (slug, name, gst, city, city_slug, gst_status, gst_since, state, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'import', ?)`)
        .bind(slug, name, r.gst.toUpperCase(), city, citySlug(city), r.gst_registration_status ?? null, r.gst_registration_date ?? null, stateFromGst(r.gst), t - offset);
    });
    if (stmts.length) await env.DB.batch(stmts);
    offset += rows.length;
    await setMeta(env, "import_offset", String(offset));
    if (rows.length < PAGE) { await setMeta(env, "import_done", "1"); await setMeta(env, "import_note", "finished"); return { done: true, offset }; }
  }
  return { done: false, offset };
}
