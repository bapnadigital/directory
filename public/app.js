// Small helpers: copy buttons, confirm dialogs, auto-submit selects, and
// shrinking photos in the browser before upload (keeps uploads small and fast).
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-copy]");
  if (!b) return;
  e.preventDefault();
  navigator.clipboard.writeText(b.getAttribute("data-copy")).then(function () {
    var t = b.textContent; b.textContent = "Copied"; setTimeout(function () { b.textContent = t; }, 1500);
  });
});
document.addEventListener("submit", function (e) {
  var m = e.target.getAttribute && e.target.getAttribute("data-confirm");
  if (m && !window.confirm(m)) e.preventDefault();
});
document.addEventListener("change", function (e) {
  var el = e.target;
  if (el.hasAttribute && el.hasAttribute("data-autosubmit")) { el.form.submit(); return; }
  if (!(el.matches && el.matches("input[type=file][data-resize]")) || !el.files || !el.files[0]) return;
  var max = parseInt(el.getAttribute("data-resize"), 10) || 1200, file = el.files[0];
  if (!/^image\//.test(file.type)) return;
  var img = new Image(), url = URL.createObjectURL(file);
  img.onload = function () {
    URL.revokeObjectURL(url);
    var s = Math.min(1, max / Math.max(img.width, img.height));
    var c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    (function attempt(q) {
      c.toBlob(function (blob) {
        if (!blob) return;
        if (blob.size > 550 * 1024 && q > 0.5) return attempt(q - 0.12);
        var dt = new DataTransfer(); dt.items.add(new File([blob], "photo.jpg", { type: "image/jpeg" })); el.files = dt.files;
      }, "image/jpeg", q);
    })(0.84);
  };
  img.src = url;
});

// Filters open by default on wide screens.
if (window.innerWidth > 900) document.querySelectorAll("details.flt").forEach(function (d) { d.open = true; });
