/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { page } from "../ui";
import { RateStrip } from "./rates";

// Free calculators. The maths runs in the browser (public/tools.js); live
// rates are filled in from /api/rates.
type Fld = { id: string; label: string; type?: "number" | "select"; value?: string; step?: string; options?: [string, string][]; hint?: string; live?: string };
type Tool = { slug: string; icon: string; name: string; short: string; desc: string; fields: Fld[]; how: string[]; faq: [string, string][] };

const PURITY: [string, string][] = [["0.999", "24K (999)"], ["0.995", "24K (995)"], ["0.916", "22K (916)"], ["0.75", "18K (750)"], ["0.585", "14K (585)"]];

export const TOOLS: Tool[] = [
  { slug: "gold-price-calculator", icon: "🧮", name: "Gold price calculator", short: "Jewellery price from weight, purity, making and GST.",
    desc: "Work out the price of gold jewellery from its weight, purity, making charges and 3% GST, using today's live gold rate.",
    fields: [
      { id: "weight", label: "Weight (grams)", value: "10", step: "0.001" },
      { id: "purity", label: "Purity", type: "select", options: PURITY, value: "0.916" },
      { id: "rate", label: "24K gold rate per 10 g, without GST (₹)", live: "fine10", hint: "Filled from the live rate. Change it to use your own." },
      { id: "making", label: "Making charge", value: "10", step: "0.1" },
      { id: "makingType", label: "Making charge type", type: "select", options: [["pct", "% of gold value"], ["gram", "₹ per gram"], ["flat", "₹ flat"]] },
      { id: "stone", label: "Stone or other charges (₹)", value: "0" },
      { id: "gst", label: "GST %", value: "3", step: "0.1" },
    ],
    how: ["Gold value = weight × purity × 24K rate per gram.", "Making charge is added as a percentage, per gram or flat amount.", "GST at 3% is charged on gold value plus making and stone charges."],
    faq: [["Is GST charged on making charges?", "Yes. When jewellery is sold, 3% GST applies to the full invoice value, including making charges."], ["Why does my jeweller's rate differ?", "Shops set their own daily rate and making charges. Use this as a reference and enter the shop's rate to check a bill."]] },
  { slug: "old-gold-exchange-calculator", icon: "♻️", name: "Old gold exchange calculator", short: "Value of old gold after purity test and deduction.",
    desc: "Estimate what old gold jewellery is worth on exchange or sale, from its tested purity, weight and the dealer's deduction.",
    fields: [
      { id: "weight", label: "Gross weight (grams)", value: "20", step: "0.001" },
      { id: "less", label: "Stone, wax or dust weight to remove (grams)", value: "0", step: "0.001" },
      { id: "purityPct", label: "Tested purity %", value: "91.6", step: "0.01", hint: "From the karatmeter or fire assay report." },
      { id: "rate", label: "24K gold rate per 10 g, without GST (₹)", live: "fine10" },
      { id: "deduct", label: "Dealer deduction %", value: "2", step: "0.1" },
    ],
    how: ["Net weight = gross weight minus stones and other material.", "Fine gold = net weight × tested purity.", "Value = fine gold × 24K rate, less the dealer's deduction for melting and refining."],
    faq: [["Is GST charged when I sell old gold?", "A consumer selling old jewellery to a jeweller does not charge GST. GST applies on the new jewellery you buy in exchange."], ["What deduction is normal?", "It varies by dealer and city. Ask for the purity test result and the deduction in writing before agreeing."]] },
  { slug: "gold-landed-cost-calculator", icon: "🚢", name: "Gold landed cost calculator", short: "International price to rupees per 10 g and per kg, with duty and premium.",
    desc: "Work out the landed cost of gold in India from the international price in dollars per ounce, the dollar-rupee rate, import duty and local premium, and compare it with the market rate.",
    fields: [
      { id: "usd", label: "International gold price ($ per troy ounce)", live: "goldUsd", step: "0.01" },
      { id: "inr", label: "USD / INR", live: "usdInr", step: "0.01" },
      { id: "duty", label: "Total import duty and cess (%)", value: "15", step: "0.01", hint: "15% has applied to commercial imports since 13 May 2026. Duty changes by notification, so confirm the rate in force today." },
      { id: "premium", label: "Premium or discount ($ per ounce)", value: "0", step: "0.01" },
      { id: "purity", label: "Bar purity", type: "select", options: [["0.995", "995"], ["0.999", "999"]] },
    ],
    how: ["Price per gram of fine gold in rupees = (international price + premium) × USD/INR ÷ 31.1035.", "Multiply by the bar purity, then add import duty on that value.", "3% GST is added on top to compare with a with-GST market quote. Bank charges, freight and insurance are not included."],
    faq: [["Why is my dealer's rate different from this?", "Local rates also carry bank and logistics costs, the day's demand and supply premium or discount, and the dealer's margin. Use this as a parity check, not a quote."], ["Which duty rate should I enter?", "The total of basic customs duty and any cess that applies on the day. Check the latest customs notification or ask your bullion dealer."]] },
  { slug: "bullion-rate-converter", icon: "🔁", name: "995 / 999 bullion rate converter", short: "Put 995 and 999 rates, with or without GST, on one basis.",
    desc: "Convert a gold bullion rate between 995 and 999 purity and between with-GST and without-GST, so two quotes can be compared like for like.",
    fields: [
      { id: "rate", label: "Quoted rate per 10 g (₹)", live: "gold995" },
      { id: "from", label: "Quoted purity", type: "select", options: [["0.995", "995"], ["0.999", "999"]] },
      { id: "gstIn", label: "Quoted rate is", type: "select", options: [["0", "Without GST"], ["1", "Including 3% GST"]] },
      { id: "premium", label: "Premium or discount per 10 g (₹)", value: "0" },
    ],
    how: ["A rate without GST is converted to the other purity in proportion: 999 rate = 995 rate × 999 ÷ 995.", "GST of 3% is added on top of a without-GST rate, or worked back from a with-GST rate.", "All four results are shown so any two quotes can be compared on the 999 without-GST basis."],
    faq: [["Why compare on a 999 basis?", "A 995 bar contains slightly less fine gold than a 999 bar. Converting both to 999 shows the true cost of the gold itself."]] },
  { slug: "gold-purity-converter", icon: "💠", name: "Gold purity and karat converter", short: "Karat, fineness and percentage, with fine gold content.",
    desc: "Convert gold purity between karat, fineness (parts per thousand) and percentage, and see the fine gold content of any weight.",
    fields: [
      { id: "karat", label: "Karat", value: "22", step: "0.01" },
      { id: "weight", label: "Weight of the item (grams)", value: "10", step: "0.001" },
      { id: "target", label: "Convert this weight to", type: "select", options: PURITY, value: "0.999" },
    ],
    how: ["Purity % = karat ÷ 24 × 100. Fineness = karat ÷ 24 × 1000.", "Fine gold = weight × purity.", "Equivalent weight in another purity = fine gold ÷ that purity."],
    faq: [["What is 916 gold?", "916 is 22 karat gold: 91.6% pure gold and the rest alloy. It is the usual standard for hallmarked jewellery in India."]] },
  { slug: "gold-weight-converter", icon: "⚖️", name: "Gold weight converter", short: "Grams, tola, troy ounce, kg, carat and more.",
    desc: "Convert gold and silver weights between grams, tola, troy ounces, kilograms, carats, bhori, ratti and pennyweight.",
    fields: [
      { id: "value", label: "Weight", value: "1", step: "0.0001" },
      { id: "unit", label: "Unit", type: "select", options: [["11.6638", "Tola"], ["1", "Gram"], ["31.1035", "Troy ounce"], ["1000", "Kilogram"], ["0.2", "Carat"], ["11.664", "Bhori"], ["0.1215", "Ratti"], ["1.55517", "Pennyweight"], ["8", "Sovereign (pavan)"]] },
    ],
    how: ["1 tola = 11.6638 g. 1 troy ounce = 31.1035 g. 1 carat = 0.2 g.", "1 sovereign (pavan) = 8 g, commonly used in South India.", "Ratti is taken here as 0.1215 g, the traditional jewellers' ratti."],
    faq: [["Is an ounce of gold 28 or 31 grams?", "Gold is traded in troy ounces, which are 31.1035 g. The 28.35 g ounce is the everyday (avoirdupois) ounce and is not used for precious metals."]] },
  { slug: "gst-calculator", icon: "🧾", name: "Jewellery GST calculator", short: "Add or remove 3% GST; job work at 5%.",
    desc: "Add GST to a jewellery or bullion amount, or work the GST back out of a total. Includes 3% on gold and silver and 5% on job work.",
    fields: [
      { id: "amount", label: "Amount (₹)", value: "100000" },
      { id: "rate", label: "GST rate", type: "select", options: [["3", "3% (gold, silver, jewellery)"], ["5", "5% (job work / making as a service)"], ["18", "18% (other services)"], ["0.25", "0.25% (rough diamonds)"]] },
      { id: "mode", label: "The amount is", type: "select", options: [["ex", "Without GST (add GST)"], ["inc", "Including GST (remove GST)"]] },
    ],
    how: ["Adding GST: tax = amount × rate. Removing GST: base = total ÷ (1 + rate).", "Within a state the tax is split equally into CGST and SGST. Between states it is charged as IGST."],
    faq: [["What is the GST on gold jewellery?", "3% on the value of the jewellery including making charges when sold. Making charged separately as job work to another business attracts 5%."]] },
  { slug: "silver-price-calculator", icon: "🥈", name: "Silver price calculator", short: "Silver value by weight and purity at today's rate.",
    desc: "Work out the price of silver articles, coins and bars from weight and purity using today's live silver rate, with making and GST.",
    fields: [
      { id: "weight", label: "Weight (grams)", value: "100", step: "0.01" },
      { id: "purity", label: "Purity", type: "select", options: [["0.999", "999 (fine silver)"], ["0.925", "925 (sterling)"], ["0.9", "900"], ["0.8", "800"]] },
      { id: "rate", label: "Silver 999 rate per kg, without GST (₹)", live: "silverKg" },
      { id: "making", label: "Making charge (₹ per gram)", value: "0", step: "0.1" },
      { id: "gst", label: "GST %", value: "3", step: "0.1" },
    ],
    how: ["Silver value = weight × purity × rate per gram.", "Making is added per gram, then GST is charged on the total."],
    faq: [["What is 925 silver?", "Sterling silver: 92.5% silver and 7.5% alloy, used for most silver jewellery."]] },
  { slug: "making-charge-calculator", icon: "🛠️", name: "Making charge calculator", short: "Compare % making with per-gram making.",
    desc: "See what a making charge really costs: convert a percentage making charge to rupees per gram and the other way round.",
    fields: [
      { id: "weight", label: "Weight (grams)", value: "10", step: "0.001" },
      { id: "purity", label: "Purity", type: "select", options: PURITY, value: "0.916" },
      { id: "rate", label: "24K gold rate per 10 g, without GST (₹)", live: "fine10" },
      { id: "pct", label: "Making charge %", value: "12", step: "0.1" },
      { id: "wastage", label: "Wastage % (if charged separately)", value: "0", step: "0.1" },
    ],
    how: ["Making in rupees = gold value × making %.", "Wastage, where charged, is added as extra gold weight at the same rate.", "The per-gram figure lets you compare with shops that quote making per gram."],
    faq: [["Making % or per gram: which is cheaper?", "When gold prices rise, a percentage charge rises with them, while a per-gram charge stays fixed. Convert both to rupees for the piece you are buying."]] },
];

export const toolsApp = new Hono<AppEnv>();

toolsApp.get("/tools", (c) => page(c, {
  title: "Free jewellery calculators and tools", path: "/tools",
  desc: "Free tools for jewellers and buyers: gold price calculator, old gold exchange value, 995/999 rate converter, purity, weight, GST and making charge calculators, with live rates.",
}, (
  <main class="wrap" style="padding-top:26px">
    <div class="eyebrow">Free tools</div>
    <h1 style="font-size:30px;margin:6px 0 4px">Calculators for the jewellery trade</h1>
    <p class="muted small">Free to use, no sign-in. Rates are filled in live from the bullion desk.</p>
    <div style="margin-top:16px"><RateStrip c={c} /></div>
    <div class="grid g3" style="margin-top:6px">
      {TOOLS.map((t) => <a class="card" href={`/tools/${t.slug}`}><b>{t.icon} {t.name}</b><p class="small muted" style="margin-bottom:0">{t.short}</p></a>)}
    </div>
  </main>
)));

toolsApp.get("/tools/:slug", (c) => {
  const t = TOOLS.find((x) => x.slug === c.req.param("slug"));
  if (!t) return c.notFound();
  return page(c, {
    title: `${t.name} — free, with live rates`, desc: t.desc, path: `/tools/${t.slug}`,
    jsonld: [{ "@context": "https://schema.org", "@type": "WebApplication", name: t.name, description: t.desc, applicationCategory: "FinanceApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "INR" } },
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: t.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }],
  }, (
    <main class="wrap" style="padding-top:26px">
      <a class="small muted" href="/tools">← All tools</a>
      <h1 style="font-size:28px;margin:8px 0 4px">{t.icon} {t.name}</h1>
      <p class="muted small" style="max-width:680px">{t.desc}</p>
      <div class="layout listing" style="margin-top:16px">
        <div class="stack">
          <form class="card tool" data-tool={t.slug} onsubmit="return false">
            <div class="grid g2">
              {t.fields.map((f) => (
                <label>{f.label}
                  {f.type === "select"
                    ? <select name={f.id}>{f.options!.map(([v, l]) => <option value={v} selected={v === f.value}>{l}</option>)}</select>
                    : <input name={f.id} type="number" inputmode="decimal" step={f.step ?? "1"} min="0" value={f.value ?? ""} data-live={f.live} />}
                  {f.hint && <span class="tiny muted" style="display:block;margin-top:4px">{f.hint}</span>}
                </label>
              ))}
            </div>
            <div class="result" data-result aria-live="polite"><span class="muted small">Enter the details to see the result.</span></div>
          </form>
          <div class="card"><h2 style="font-size:18px">How it is worked out</h2><ul class="small muted" style="margin:8px 0 0;padding-left:18px">{t.how.map((h) => <li>{h}</li>)}</ul></div>
          <div class="card"><h2 style="font-size:18px;margin-bottom:6px">Questions</h2>{t.faq.map(([q, a]) => <details style="padding:8px 0;border-top:1px solid var(--border)"><summary>{q}</summary><p class="small muted">{a}</p></details>)}</div>
        </div>
        <aside class="stack">
          <div class="card small"><b>Today's rate</b><p class="muted" style="margin:6px 0">Gold 995 with GST: <b class="gold" data-rate="gold995gst">—</b> per 10 g<br />Silver 999 with GST: <b class="gold" data-rate="silverGst">—</b> per kg</p><a class="gold" href="/rates">All live rates →</a></div>
          <div class="card small"><b>More tools</b>{TOOLS.filter((x) => x.slug !== t.slug).map((x) => <a style="display:block;padding:6px 0;border-top:1px solid var(--border)" href={`/tools/${x.slug}`}>{x.icon} {x.name}</a>)}</div>
          <a class="card small" href="/directory"><b>Find a jeweller</b><p class="muted" style="margin:4px 0 0">Search manufacturers, wholesalers, bullion dealers and retailers across India.</p></a>
        </aside>
      </div>
      <p class="tiny muted" style="margin-top:14px">Results are estimates for guidance. Confirm rates, charges and tax with your jeweller or accountant.</p>
    </main>
  ));
});
