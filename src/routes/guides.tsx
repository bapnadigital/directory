/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Child } from "hono/jsx";
import type { AppEnv } from "../auth";
import { page } from "../ui";

// Short, plain-language trade guides. General information only.
export const guides = new Hono<AppEnv>();
type Guide = { slug: string; title: string; desc: string; sections: [string, Child][]; tool?: [string, string] };
const T = ({ rows, head }: { head: string[]; rows: (string | number)[][] }) => <table><tr>{head.map((h) => <th>{h}</th>)}</tr>{rows.map((r) => <tr>{r.map((x) => <td>{x}</td>)}</tr>)}</table>;

export const GUIDES: Guide[] = [
  { slug: "bis-hallmark-huid", title: "BIS hallmark and HUID: what the marks mean and how to check them", desc: "The three marks on hallmarked gold jewellery, how to verify a HUID, current hallmarking fees and what to do if purity falls short.",
    tool: ["/tools/gold-purity-converter", "Convert karat, fineness and percentage"],
    sections: [
      ["The three marks", <>Every hallmarked gold article carries three marks: the BIS logo, the purity in karat and fineness (for example 22K916), and a six-character alphanumeric HUID that is unique to that one piece. The HUID links the article to the jeweller and the assaying centre that tested it.</>],
      ["How to verify a HUID", <ol><li>Install the BIS Care app from the official app store.</li><li>Open “Verify HUID” and type the six characters marked on the piece.</li><li>Compare the article type, purity and jeweller shown in the app with the piece and the invoice.</li></ol>],
      ["Hallmarking fees", <>BIS revised the fee for gold articles in September 2026 to ₹75 per article, with a minimum of ₹200 per consignment. The fee for silver articles is ₹35 per article, with a minimum of ₹150 per consignment. The fee is per piece and does not depend on weight. Taxes are extra. Check the BIS website for the current figure before quoting it to a customer.</>],
      ["Common purity grades", <T head={["Karat", "Fineness", "Gold content"]} rows={[["24K", "999 / 995", "99.9% / 99.5%"], ["22K", "916", "91.6%"], ["18K", "750", "75.0%"], ["14K", "585", "58.5%"]]} />],
      ["If purity is below the mark", <>Under the BIS rules a buyer of hallmarked jewellery found below the marked purity can claim compensation of twice the value of the shortfall, plus the testing charges. Keep the itemised invoice: it should show purity, net weight, making charges, GST and the hallmarking fee.</>],
    ] },
  { slug: "gst-on-gold-jewellery", title: "GST on gold, silver and jewellery: a plain guide", desc: "How GST applies to bullion, jewellery, making charges and job work, with a worked example.",
    tool: ["/tools/gst-calculator", "Open the GST calculator"],
    sections: [
      ["The basic rate", <>Gold, silver and platinum, as bars, coins or jewellery, carry 3% GST (1.5% CGST + 1.5% SGST within a state, or 3% IGST across states).</>],
      ["Making charges", <>When making charges are part of the sale of a finished ornament, the common trade practice is to charge 3% on the full invoice value, metal plus making. When making, job work or repair is supplied on its own as a service (for example, a karigar working on gold supplied by the customer), the rate is 5%. Invoicing practice differs between businesses, so follow your chartered accountant's advice for your own billing.</>],
      ["A worked example", <>10 g of 22K at ₹12,000 per gram of fine gold: gold value 10 × 12,000 × 0.916 = ₹1,09,920. Making at 10% = ₹10,992. GST at 3% on ₹1,20,912 = ₹3,627. Total ₹1,24,539 before any hallmarking fee.</>],
      ["Old gold exchange", <>When a customer gives old jewellery against a new purchase, GST is charged on the new article. How the old gold is valued and shown on the invoice has tax consequences; take professional advice on your invoice format.</>],
      ["This is general information", <>Tax rules change and depend on the facts of each transaction. This page is not tax advice.</>],
    ] },
  { slug: "how-gold-jewellery-price-is-calculated", title: "How the price of gold jewellery is calculated", desc: "The formula jewellers use: gold rate, purity, weight, making or wastage, GST and hallmarking, with an example.",
    tool: ["/tools/gold-price-calculator", "Open the gold price calculator"],
    sections: [
      ["The formula", <>Price = (rate per gram for the purity × net weight) + making charges + GST + hallmarking fee. Stones are weighed and priced separately; the gold is charged on net weight only.</>],
      ["Rate for the purity", <>Start from the day's fine gold rate. 22K is 91.6% of it, 18K is 75%, 14K is 58.5%. Our <a class="gold" href="/rates">live rates page</a> shows per-gram rates for each karat.</>],
      ["Making and wastage", <>Making is charged as a percentage of the gold value, as a fixed amount per gram, or as a mix of both. “Wastage” is the same idea expressed as extra gold weight. Ask which one is being quoted before comparing two shops.</>],
      ["Why two quotes differ", <ul><li>Different rate used (995 or 999, with or without GST).</li><li>Gross weight charged instead of net weight.</li><li>Making quoted before or after a discount.</li><li>Stone weight not deducted.</li></ul>],
    ] },
  { slug: "995-vs-999-gold", title: "995 and 999 gold: the difference and how to convert", desc: "What 995 and 999 fineness mean in the bullion trade, where each is used and how to convert rates between them.",
    tool: ["/tools/bullion-rate-converter", "Open the 995 / 999 converter"],
    sections: [
      ["What the numbers mean", <>Fineness is parts of pure gold per thousand. A 995 bar is 99.5% gold; a 999 bar is 99.9% gold. Both are called 24K in everyday use.</>],
      ["Where each is used", <>Much of India's wholesale bullion trade quotes 995 for standard bars, while coins, small bars and many retail quotes use 999. Always confirm which one a quoted rate refers to.</>],
      ["Converting a rate", <>999 rate = 995 rate × 999 ÷ 995. On ₹1,35,000 per 10 g of 995 that is about ₹543 more for 999. Rates may be quoted with or without 3% GST, so check that too.</>],
    ] },
  { slug: "gold-weight-units", title: "Tola, gram, ounce and other gold weight units", desc: "Conversion table for tola, grams, troy ounces, sovereign, carat and ratti used in the Indian jewellery trade.",
    tool: ["/tools/gold-weight-converter", "Open the weight converter"],
    sections: [
      ["Conversion table", <T head={["Unit", "Grams"]} rows={[["1 tola", "11.6638"], ["1 troy ounce", "31.1035"], ["1 sovereign / pavan", "8"], ["1 carat (stones)", "0.2"], ["1 ratti (trade)", "0.1215"], ["1 kilogram", "1,000"]]} />],
      ["Tola in practice", <>The traditional tola is 11.6638 g. In many markets a “tola” bar is sold as a rounded 10 g, so confirm the gram weight on the bar or invoice.</>],
      ["Ounce and international prices", <>International gold is quoted in US dollars per troy ounce (31.1035 g), not the 28.35 g ounce used for food. To compare with Indian rates, convert to rupees per 10 g and remember that duty, premium and GST are added locally.</>],
    ] },
];

guides.get("/guides", (c) => page(c, { title: "Jewellery trade guides — hallmarking, GST, pricing and weights", desc: "Short, plain-language guides for jewellers and buyers: BIS hallmark and HUID, GST on gold, how jewellery is priced, 995 vs 999 and weight units.", path: "/guides" }, (
  <main class="wrap" style="padding-top:26px">
    <div class="head"><div><div class="eyebrow">Guides</div><h1 style="font-size:30px;margin-top:6px">Trade guides in plain language</h1></div></div>
    <div class="grid g3">{GUIDES.map((g) => <a class="card" href={`/guides/${g.slug}`}><b>{g.title}</b><p class="small muted" style="margin:6px 0 0">{g.desc}</p></a>)}</div>
  </main>
)));

guides.get("/guides/:slug", (c) => {
  const g = GUIDES.find((x) => x.slug === c.req.param("slug"));
  if (!g) return c.notFound();
  return page(c, { title: g.title, desc: g.desc, path: `/guides/${g.slug}` }, (
    <main class="wrap narrow" style="padding-top:26px">
      <a class="small muted" href="/guides">← All guides</a>
      <h1 style="font-size:28px;margin-top:8px">{g.title}</h1>
      <p class="muted">{g.desc}</p>
      {g.sections.map(([h, body]) => <div class="card" style="margin-top:12px"><h2 style="font-size:17px;margin-bottom:6px">{h}</h2><div class="small" style="line-height:1.65">{body}</div></div>)}
      {g.tool && <p style="margin-top:14px"><a class="btn" href={g.tool[0]}>{g.tool[1]}</a></p>}
      <p class="tiny muted" style="margin-top:14px">General information for the trade, last reviewed 15 November 2026. Not legal or tax advice.</p>
      <div class="row" style="gap:6px;margin-top:10px">{GUIDES.filter((x) => x.slug !== g.slug).map((x) => <a class="badge" href={`/guides/${x.slug}`}>{x.title.split(":")[0]}</a>)}</div>
    </main>
  ));
});
