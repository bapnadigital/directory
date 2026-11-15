// Calculators for /tools pages and live rate refresh for any page with data-rate.
(function () {
  var R = null;
  var fmt = function (n, d) { return isFinite(n) ? "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d }) : "—"; };
  var num = function (n, d) { return isFinite(n) ? Number(n).toLocaleString("en-IN", { maximumFractionDigits: d == null ? 3 : d }) : "—"; };
  var row = function (l, v, big) { return '<div class="kv' + (big ? " big" : "") + '"><span>' + l + "</span><b>" + v + "</b></div>"; };
  function live() {
    if (!R || !R.key) return {};
    var k = R.key, o = { gold995: k.gold995, gold995gst: k.gold995gst, silverGst: k.silverGst };
    var base995 = k.gold995 || (k.gold995gst ? k.gold995gst / 1.03 : null);
    if (base995) o.fine10 = Math.round(base995 / 0.995);
    if (k.silverGst) o.silverKg = Math.round(k.silverGst / 1.03);
    return o;
  }
  var CALC = {
    "gold-price-calculator": function (v) {
      var gold = v.weight * v.purity * v.rate / 10;
      var mk = v.makingType === "pct" ? gold * v.making / 100 : v.makingType === "gram" ? v.weight * v.making : v.making;
      var sub = gold + mk + (v.stone || 0), gst = sub * v.gst / 100;
      return row("Gold value", fmt(gold)) + row("Making charge", fmt(mk)) + (v.stone ? row("Stone / other", fmt(v.stone)) : "") + row("GST", fmt(gst)) + row("Total price", fmt(sub + gst), 1) + row("Effective price per gram", fmt((sub + gst) / v.weight));
    },
    "old-gold-exchange-calculator": function (v) {
      var net = Math.max(0, v.weight - (v.less || 0)), fine = net * v.purityPct / 100, val = fine * v.rate / 10, ded = val * v.deduct / 100;
      return row("Net weight", num(net) + " g") + row("Fine gold content", num(fine) + " g") + row("Value at 24K rate", fmt(val)) + row("Deduction", "− " + fmt(ded)) + row("Estimated value", fmt(val - ded), 1);
    },
    "bullion-rate-converter": function (v) {
      var ex = (v.gstIn === "1" ? v.rate / 1.03 : v.rate) + (v.premium || 0), p = parseFloat(v.from);
      var r999 = ex * 0.999 / p, r995 = ex * 0.995 / p;
      return row("999 without GST", fmt(r999), 1) + row("999 with 3% GST", fmt(r999 * 1.03)) + row("995 without GST", fmt(r995)) + row("995 with 3% GST", fmt(r995 * 1.03)) + row("Fine gold per gram (without GST)", fmt(r999 / 9.99, 2));
    },
    "gold-purity-converter": function (v) {
      var p = v.karat / 24, fine = v.weight * p;
      return row("Purity", num(p * 100, 2) + " %", 1) + row("Fineness", num(p * 1000, 0)) + row("Fine gold in " + num(v.weight) + " g", num(fine) + " g") + row("Same gold as", num(fine / v.target) + " g of the selected purity");
    },
    "gold-weight-converter": function (v) {
      var g = v.value * parseFloat(v.unit);
      return row("Grams", num(g, 4), 1) + row("Tola", num(g / 11.6638, 4)) + row("Troy ounces", num(g / 31.1035, 4)) + row("Kilograms", num(g / 1000, 5)) + row("Sovereign (8 g)", num(g / 8, 4)) + row("Carats", num(g / 0.2, 2)) + row("Ratti", num(g / 0.1215, 2)) + row("Pennyweight", num(g / 1.55517, 3));
    },
    "gst-calculator": function (v) {
      var r = parseFloat(v.rate) / 100, base = v.mode === "inc" ? v.amount / (1 + r) : v.amount, tax = base * r;
      return row("Amount without GST", fmt(base, 2)) + row("GST at " + v.rate + "%", fmt(tax, 2)) + row("CGST + SGST (within state)", fmt(tax / 2, 2) + " + " + fmt(tax / 2, 2)) + row("Total including GST", fmt(base + tax, 2), 1);
    },
    "silver-price-calculator": function (v) {
      var val = v.weight * v.purity * v.rate / 1000, mk = v.weight * (v.making || 0), gst = (val + mk) * v.gst / 100;
      return row("Silver value", fmt(val)) + row("Making charge", fmt(mk)) + row("GST", fmt(gst)) + row("Total price", fmt(val + mk + gst), 1);
    },
    "making-charge-calculator": function (v) {
      var gold = v.weight * v.purity * v.rate / 10, mk = gold * v.pct / 100, w = gold * (v.wastage || 0) / 100;
      return row("Gold value", fmt(gold)) + row("Making charge", fmt(mk)) + (w ? row("Wastage", fmt(w)) : "") + row("Making + wastage per gram", fmt((mk + w) / v.weight), 1) + row("Total before GST", fmt(gold + mk + w)) + row("Total with 3% GST", fmt((gold + mk + w) * 1.03));
    }
  };
  function run(form) {
    var v = {}, ok = true;
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      if (el.tagName === "SELECT") { var f = parseFloat(el.value); v[el.name] = /^[0-9.]+$/.test(el.value) && el.name !== "from" && el.name !== "unit" && el.name !== "rate" && el.name !== "gstIn" ? f : el.value; }
      else { v[el.name] = parseFloat(el.value); if (el.value === "" && el.hasAttribute("data-live")) ok = false; if (isNaN(v[el.name])) v[el.name] = 0; }
    });
    var out = form.querySelector("[data-result]"), fn = CALC[form.getAttribute("data-tool")];
    if (!fn || !out) return;
    out.innerHTML = ok ? fn(v) : '<span class="muted small">Waiting for the live rate. You can also type a rate.</span>';
  }
  function fillLive() {
    var l = live();
    document.querySelectorAll("input[data-live]").forEach(function (el) { if (!el.dataset.touched && l[el.dataset.live]) el.value = l[el.dataset.live]; });
    document.querySelectorAll("form.tool").forEach(run);
  }
  function paint() {
    if (!R || !R.ok) return;
    var k = R.key || {}, g = R.per_gram || {};
    document.querySelectorAll("[data-rate]").forEach(function (el) { var x = k[el.dataset.rate]; if (x != null) el.textContent = /Usd|usdInr/.test(el.dataset.rate) ? x : fmt(x); });
    document.querySelectorAll("[data-gram]").forEach(function (el) { var x = g[el.dataset.gram]; if (x != null) el.innerHTML = "<b>" + fmt(x, el.dataset.gram === "silver" ? 2 : 0) + "</b>"; });
    document.querySelectorAll("[data-gram10]").forEach(function (el) { var x = g[el.dataset.gram10]; if (x != null) el.textContent = fmt(x * 10); });
    var byId = {}; (R.items || []).forEach(function (i) { byId[i.id] = i; });
    document.querySelectorAll("[data-item]").forEach(function (el) { var p = el.dataset.item.split(":"), i = byId[p[0]]; if (i && i[p[1]] != null) { var t = String(i[p[1]]); if (el.textContent !== t) { el.textContent = t; el.classList.add("tick"); setTimeout(function () { el.classList.remove("tick"); }, 600); } } });
    var at = document.querySelector("[data-rate-at]"); if (at && R.at) at.textContent = new Date(R.at * 1000).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", second: "2-digit" });
  }
  function load() {
    fetch("/api/rates").then(function (r) { return r.json(); }).then(function (j) { R = j; paint(); fillLive(); }).catch(function () {});
  }
  document.addEventListener("input", function (e) { var f = e.target.closest && e.target.closest("form.tool"); if (!f) return; if (e.target.hasAttribute("data-live")) e.target.dataset.touched = "1"; run(f); });
  document.addEventListener("change", function (e) { var f = e.target.closest && e.target.closest("form.tool"); if (f) run(f); });
  if (document.querySelector("[data-rate],[data-item],form.tool")) { load(); setInterval(function () { if (!document.hidden) load(); }, 10000); }
  document.querySelectorAll("form.tool").forEach(run);
})();
