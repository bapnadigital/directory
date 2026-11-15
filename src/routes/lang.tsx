/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { page } from "../ui";
import { RATE_SOURCE, getRates, inr, keyRates } from "../rates";

// Hindi and Gujarati landing pages: what the platform does, with links into the main (English) pages.
export const lang = new Hono<AppEnv>();
type L = { code: string; name: string; title: string; desc: string; eyebrow: string; h1: string; sub: string; search: string; ph: string; rates: string; gold: string; silver: string; by: string; cards: [string, string, string][]; ownerH: string; ownerP: string; ownerBtn: string; note: string };
const T: Record<string, L> = {
  hi: { code: "hi", name: "हिन्दी", title: "ज्वेलरी सही है — भारत की ज्वेलरी, बुलियन और सहायक व्यापार की डायरेक्टरी", desc: "पूरे भारत के ज्वेलर्स, मैन्युफैक्चरर, होलसेलर और बुलियन डीलर खोजें। लाइव सोना-चांदी भाव, कैलकुलेटर और ट्रेड बोर्ड।",
    eyebrow: "भारत की ज्वेलरी, बुलियन और सहायक व्यापार डायरेक्टरी", h1: "सौदे से पहले सही ज्वेलर खोजें", sub: "नाम, GSTIN या शहर से खोजें। कैटलॉग देखें, पूछताछ भेजें और WhatsApp पर ऑर्डर करें — मुफ़्त।", search: "खोजें", ph: "व्यापार का नाम, GSTIN या शहर",
    rates: "आज के भाव", gold: "सोना 995 (GST सहित), प्रति 10 ग्राम", silver: "चांदी 999 (GST सहित), प्रति किलो", by: "भाव स्रोत",
    cards: [["/directory", "डायरेक्टरी", "मैन्युफैक्चरर, होलसेलर, रिटेलर, बुलियन डीलर और सहायक सेवाएं — शहर, राज्य और श्रेणी के अनुसार।"], ["/rates", "लाइव सोना-चांदी भाव", "चार्ट, रोज़ सुबह ईमेल पर भाव और आपके लक्ष्य भाव पर अलर्ट।"], ["/tools", "कैलकुलेटर", "ज्वेलरी कीमत, पुराना सोना, 995/999, GST, मेकिंग चार्ज और लैंडेड कॉस्ट।"], ["/requirements", "ट्रेड बोर्ड", "खरीद की ज़रूरत, बिक्री के लिए स्टॉक, नौकरियां और काम की तलाश — मुफ़्त पोस्ट करें।"], ["/guides", "गाइड", "हॉलमार्क और HUID, सोने पर GST, आयात शुल्क और कीमत की गणना — सरल भाषा में।"], ["/news", "उद्योग समाचार और इवेंट", "ज्वेलरी उद्योग की ताज़ा खबरें और ट्रेड शो की तारीखें।"]],
    ownerH: "आपका व्यापार शायद पहले से लिस्टेड है", ownerP: "अपनी लिस्टिंग खोजें, क्लेम करें और कुछ ही मिनट में अपना बनाएं। लोगो, फोटो, कैटलॉग जोड़ें और ग्राहकों की पूछताछ पाएं। शुरुआत मुफ़्त है।", ownerBtn: "अपना व्यापार लिस्ट या क्लेम करें", note: "बाकी पेज अभी अंग्रेज़ी में हैं।" },
  gu: { code: "gu", name: "ગુજરાતી", title: "જ્વેલરી સહી હૈ — ભારતની જ્વેલરી, બુલિયન અને સંલગ્ન વેપારની ડિરેક્ટરી", desc: "સમગ્ર ભારતના જ્વેલર્સ, મેન્યુફેક્ચરર, હોલસેલર અને બુલિયન ડીલર શોધો. લાઇવ સોના-ચાંદીના ભાવ, કેલ્ક્યુલેટર અને ટ્રેડ બોર્ડ.",
    eyebrow: "ભારતની જ્વેલરી, બુલિયન અને સંલગ્ન વેપાર ડિરેક્ટરી", h1: "સોદા પહેલાં યોગ્ય જ્વેલર શોધો", sub: "નામ, GSTIN અથવા શહેરથી શોધો. કેટલોગ જુઓ, પૂછપરછ મોકલો અને WhatsApp પર ઓર્ડર કરો — મફત.", search: "શોધો", ph: "વેપારનું નામ, GSTIN અથવા શહેર",
    rates: "આજના ભાવ", gold: "સોનું 995 (GST સાથે), પ્રતિ 10 ગ્રામ", silver: "ચાંદી 999 (GST સાથે), પ્રતિ કિલો", by: "ભાવ સ્ત્રોત",
    cards: [["/directory", "ડિરેક્ટરી", "મેન્યુફેક્ચરર, હોલસેલર, રિટેલર, બુલિયન ડીલર અને સંલગ્ન સેવાઓ — શહેર, રાજ્ય અને શ્રેણી પ્રમાણે."], ["/rates", "લાઇવ સોના-ચાંદીના ભાવ", "ચાર્ટ, દરરોજ સવારે ઇમેલ પર ભાવ અને તમારા લક્ષ્ય ભાવ પર એલર્ટ."], ["/tools", "કેલ્ક્યુલેટર", "જ્વેલરી કિંમત, જૂનું સોનું, 995/999, GST, મેકિંગ ચાર્જ અને લેન્ડેડ કોસ્ટ."], ["/requirements", "ટ્રેડ બોર્ડ", "ખરીદીની જરૂરિયાત, વેચાણ માટે સ્ટોક, નોકરીઓ અને કામની શોધ — મફત પોસ્ટ કરો."], ["/guides", "માર્ગદર્શિકા", "હોલમાર્ક અને HUID, સોના પર GST, આયાત ડ્યુટી અને કિંમતની ગણતરી — સરળ ભાષામાં."], ["/news", "ઉદ્યોગ સમાચાર અને ઇવેન્ટ", "જ્વેલરી ઉદ્યોગના તાજા સમાચાર અને ટ્રેડ શોની તારીખો."]],
    ownerH: "તમારો વેપાર કદાચ પહેલેથી લિસ્ટેડ છે", ownerP: "તમારી લિસ્ટિંગ શોધો, ક્લેમ કરો અને થોડી મિનિટોમાં તમારી બનાવો. લોગો, ફોટા, કેટલોગ ઉમેરો અને ગ્રાહકોની પૂછપરછ મેળવો. શરૂઆત મફત છે.", ownerBtn: "તમારો વેપાર લિસ્ટ અથવા ક્લેમ કરો", note: "બાકીનાં પેજ હાલ અંગ્રેજીમાં છે." },
};

lang.get("/:code{hi|gu}", async (c) => {
  const t = T[c.req.param("code")];
  const k = keyRates(await getRates(c.env));
  return page(c, { title: t.title, desc: t.desc, path: `/${t.code}` }, (
    <main lang={t.code}>
      <section class="hero wrap">
        <div class="eyebrow">{t.eyebrow}</div>
        <h1>{t.h1}</h1>
        <p class="muted" style="max-width:620px;margin:14px auto 0">{t.sub}</p>
        <form class="search" action="/directory" method="get"><input name="q" placeholder={t.ph} aria-label={t.search} /><button class="btn" type="submit">{t.search}</button></form>
      </section>
      <section class="wrap">
        <div class="head"><h2>{t.rates}</h2><a class="gold small" href="/rates">→</a></div>
        <div class="grid g3">
          <div class="card"><div class="tiny muted">{t.gold}</div><b style="font-size:20px">{inr(k.gold995gst)}</b></div>
          <div class="card"><div class="tiny muted">{t.silver}</div><b style="font-size:20px">{inr(k.silverGst)}</b></div>
          <a class="card" href={RATE_SOURCE.url} target="_blank" rel="noopener"><div class="tiny muted">{t.by}</div><b>{RATE_SOURCE.name}</b></a>
        </div>
      </section>
      <section class="wrap"><div class="grid g3">{t.cards.map(([href, h, p]) => <a class="card" href={href}><b>{h}</b><p class="small muted" style="margin:6px 0 0">{p}</p></a>)}</div></section>
      <section class="wrap"><div class="band center" style="padding:26px"><h2 style="font-size:22px">{t.ownerH}</h2><p class="muted">{t.ownerP}</p><a class="btn" href="/signup">{t.ownerBtn}</a><p class="tiny muted" style="margin-top:10px">{t.note} <a class="gold" href="/">English</a></p></div></section>
    </main>
  ));
});
