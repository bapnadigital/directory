export const TRADE_TYPES = [
  { slug: "manufacturer", label: "Manufacturers", keyword: "manufactur", icon: "🏭" },
  { slug: "wholesaler", label: "Wholesalers", keyword: "wholesale", icon: "📦" },
  { slug: "retailer", label: "Retail jewellers", keyword: "jewellers", icon: "🏬" },
  { slug: "exporter", label: "Exporters", keyword: "export", icon: "🚢" },
  { slug: "bullion", label: "Bullion dealers", keyword: "bullion", icon: "🪙" },
  { slug: "diamonds", label: "Diamonds", keyword: "diam", icon: "💎" },
  { slug: "gemstones", label: "Gems & stones", keyword: "gems", icon: "🔮" },
  { slug: "silver", label: "Silver", keyword: "silver", icon: "⚪" },
  { slug: "chains", label: "Chains", keyword: "chain", icon: "🔗" },
  { slug: "hallmarking", label: "Hallmarking centres", keyword: "hallmark", icon: "✅" },
  { slug: "refiner", label: "Refiners", keyword: "refin", icon: "🔥" },
  { slug: "cad_casting", label: "CAD & casting", keyword: "casting", icon: "🖥️" },
  { slug: "tools", label: "Tools & machinery", keyword: "tools", icon: "🛠️" },
  { slug: "pearls", label: "Pearls", keyword: "pearl", icon: "🦪" },
  { slug: "packaging", label: "Packaging & display", keyword: "packag", icon: "🎁" },
  { slug: "allied", label: "Allied services", keyword: "\u0000allied", icon: "🤝" },
] as const;
export const findType = (slug?: string | null) => TRADE_TYPES.find((t) => t.slug === slug);

export const CITIES = [
  ["mumbai", "Mumbai", "Zaveri Bazaar, Opera House, Bhuleshwar"],
  ["surat", "Surat", "Mahidharpura, Varachha, Diamond Bourse"],
  ["delhi", "Delhi", "Karol Bagh, Chandni Chowk, Dariba Kalan"],
  ["chennai", "Chennai", "T. Nagar, Sowcarpet, Mint Street"],
  ["kolkata", "Kolkata", "Bowbazar, Burrabazar"],
  ["jaipur", "Jaipur", "Johari Bazaar, MI Road"],
  ["bengaluru", "Bengaluru", "Commercial Street, Avenue Road"],
  ["hyderabad", "Hyderabad", "Basheer Bagh, Charminar, Pathargatti"],
  ["ahmedabad", "Ahmedabad", "Manek Chowk, CG Road"],
  ["rajkot", "Rajkot", "Soni Bazaar, Palace Road"],
  ["thrissur", "Thrissur", "Gold capital of Kerala"],
  ["kochi", "Kochi", "Broadway, MG Road"],
  ["coimbatore", "Coimbatore", "Big Bazaar Street, Raja Street"],
  ["madurai", "Madurai", "South Masi Street"],
  ["pune", "Pune", "Laxmi Road, Ravivar Peth"],
  ["nagpur", "Nagpur", "Itwari, Sarafa Bazaar"],
  ["indore", "Indore", "Sarafa Bazaar, Rajwada"],
  ["lucknow", "Lucknow", "Chowk, Aminabad"],
  ["kanpur", "Kanpur", "Naya Ganj, Sarafa"],
  ["amritsar", "Amritsar", "Guru Bazaar"],
  ["ludhiana", "Ludhiana", "Chaura Bazaar"],
  ["kolhapur", "Kolhapur", "Gujri"],
  ["vijayawada", "Vijayawada", "One Town, Besant Road"],
  ["patna", "Patna", "Bakarganj"],
].map(([slug, label, note]) => ({ slug, label, note }));
export const findCity = (slug?: string | null) => CITIES.find((c) => c.slug === slug);

export const THEMES: Record<string, { label: string; bg: string; accent: string; text: string }> = {
  gold: { label: "Gold", bg: "#0f1020", accent: "#e9c46a", text: "#f5f1e6" },
  emerald: { label: "Emerald", bg: "#06201a", accent: "#34d399", text: "#eafff7" },
  rose: { label: "Rose gold", bg: "#1f1015", accent: "#f4a6a0", text: "#fff1ef" },
  ivory: { label: "Ivory", bg: "#f7f2e7", accent: "#9a7422", text: "#1d1a14" },
  midnight: { label: "Midnight", bg: "#0a1022", accent: "#93c5fd", text: "#eef4ff" },
};

export function waNumber(raw?: string | null): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  return d.length >= 11 && d.length <= 13 ? d : null;
}
export function safeUrl(raw?: string | null): string | null {
  const u = (raw ?? "").trim();
  if (!u) return null;
  try {
    const p = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
    return p.protocol === "http:" || p.protocol === "https:" ? p.toString() : null;
  } catch { return null; }
}
export const initials = (name: string) =>
  name.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w[0] ?? "")).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "J";

// States and union territories with their GSTIN prefix.
export const STATES = [
  ["27", "Maharashtra"], ["24", "Gujarat"], ["07", "Delhi"], ["29", "Karnataka"], ["19", "West Bengal"], ["32", "Kerala"], ["08", "Rajasthan"],
  ["37", "Andhra Pradesh"], ["33", "Tamil Nadu"], ["36", "Telangana"], ["03", "Punjab"], ["10", "Bihar"], ["09", "Uttar Pradesh"], ["06", "Haryana"],
  ["22", "Chhattisgarh"], ["23", "Madhya Pradesh"], ["18", "Assam"], ["05", "Uttarakhand"], ["30", "Goa"], ["02", "Himachal Pradesh"], ["20", "Jharkhand"],
  ["21", "Odisha"], ["01", "Jammu and Kashmir"], ["04", "Chandigarh"], ["34", "Puducherry"], ["16", "Tripura"], ["17", "Meghalaya"], ["14", "Manipur"],
  ["13", "Nagaland"], ["11", "Sikkim"], ["12", "Arunachal Pradesh"], ["15", "Mizoram"], ["26", "Dadra and Nagar Haveli and Daman and Diu"], ["38", "Ladakh"], ["35", "Andaman and Nicobar Islands"],
].map(([code, label]) => ({ code, label, slug: label.toLowerCase().replace(/[^a-z]+/g, "-") }));
export const findState = (slug?: string | null) => STATES.find((s) => s.slug === slug);
export const stateFromGst = (gst?: string | null) => STATES.find((s) => s.code === (gst ?? "").slice(0, 2))?.label ?? null;
