/*
 * Drop-in Google Analytics loader with Consent Mode v2 and a cookie banner that appears only
 * where opt-in consent is required (EEA, UK, Switzerland). Everywhere else GA runs as usual.
 *
 *   <script src="/consent.js" data-ga="G-XXXXXXX" data-geo="/api/geo" data-privacy="/privacy/"></script>
 *
 * data-geo     optional endpoint returning {"consent": true|false}; without it the browser
 *              time zone (Europe/*, Atlantic/Reykjavik…) decides. Until the answer arrives,
 *              consent is denied, so no cookies are set before the decision.
 * data-privacy link shown in the banner. Text follows <html lang> (en, es, pt, ru, zh, de, fr, it).
 * Any link with href="#cookie-settings" (or window.avenexConsent.open()) reopens the banner.
 */
(function () {
  "use strict";
  var me = document.currentScript;
  var GA = me && me.getAttribute("data-ga");
  var GEO = me && me.getAttribute("data-geo");
  var PRIVACY = (me && me.getAttribute("data-privacy")) || "";
  var KEY = "consent.v1";
  var DENIED = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" };
  var GRANTED = { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted", analytics_storage: "granted" };

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  var gtag = window.gtag;
  // Denied by default everywhere until we know where the visitor is; Google holds hits for up
  // to 1.5 s waiting for the update below, so nothing is stored before the decision.
  gtag("consent", "default", Object.assign({ wait_for_update: 1500 }, DENIED));
  gtag("set", "ads_data_redaction", true);

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved === "granted" || saved === "denied") gtag("consent", "update", saved === "granted" ? GRANTED : DENIED);

  if (GA) {
    var s = document.createElement("script");
    s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA;
    document.head.appendChild(s);
    gtag("js", new Date());
    gtag("config", GA);
  }

  var L = {
    en: ["We use analytics cookies to understand how the site is used. You can accept or decline.", "Accept", "Decline", "Privacy"],
    es: ["Usamos cookies de analítica para entender cómo se usa el sitio. Puede aceptarlas o rechazarlas.", "Aceptar", "Rechazar", "Privacidad"],
    pt: ["Usamos cookies de análise para entender como o site é usado. Você pode aceitar ou recusar.", "Aceitar", "Recusar", "Privacidade"],
    ru: ["Мы используем аналитические cookies, чтобы понимать, как пользуются сайтом. Можно согласиться или отказаться.", "Принять", "Отклонить", "Конфиденциальность"],
    zh: ["我们使用分析类 Cookie 来了解网站的使用情况。您可以接受或拒绝。", "接受", "拒绝", "隐私"],
    de: ["Wir verwenden Analyse-Cookies, um zu verstehen, wie die Website genutzt wird. Sie können zustimmen oder ablehnen.", "Akzeptieren", "Ablehnen", "Datenschutz"],
    fr: ["Nous utilisons des cookies d'analyse pour comprendre l'utilisation du site. Vous pouvez accepter ou refuser.", "Accepter", "Refuser", "Confidentialité"],
    it: ["Usiamo cookie analitici per capire come viene usato il sito. Puoi accettare o rifiutare.", "Accetta", "Rifiuta", "Privacy"],
  };
  var lang = (document.documentElement.lang || "en").slice(0, 2).toLowerCase();
  var t = L[lang] || L.en;

  function css() {
    if (document.getElementById("cc-css")) return;
    var st = document.createElement("style"); st.id = "cc-css";
    st.textContent = ".xcc{position:fixed;left:16px;bottom:16px;z-index:2147483000;max-width:420px;background:var(--bg,#fff);color:var(--fg,#161616);border:1px solid var(--b,#c6c6c6);border-radius:10px;box-shadow:0 12px 36px rgba(0,0,0,.25);padding:14px 16px;font:14px/1.45 system-ui,-apple-system,sans-serif}" +
      ".xcc p{margin:0 0 12px}.xcc a{color:var(--acc,#9f1853)}.xcc div{display:flex;gap:8px;flex-wrap:wrap}" +
      ".xcc button{flex:1;min-width:110px;padding:9px 12px;font:600 14px system-ui,sans-serif;border-radius:6px;cursor:pointer;border:1px solid var(--acc,#9f1853)}" +
      ".xcc .y{background:var(--acc,#9f1853);color:var(--on,#fff)}.xcc .n{background:transparent;color:var(--acc,#9f1853)}" +
      "@media(max-width:560px){.xcc{left:8px;right:8px;bottom:8px;max-width:none}}";
    document.head.appendChild(st);
  }

  var box = null;
  function decide(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
    gtag("consent", "update", v === "granted" ? GRANTED : DENIED);
    if (box) { box.remove(); box = null; }
  }
  function open() {
    if (box) return;
    css();
    box = document.createElement("div"); box.className = "xcc"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", t[3]);
    var p = document.createElement("p"); p.textContent = t[0] + " ";
    if (PRIVACY) { var a = document.createElement("a"); a.href = PRIVACY; a.textContent = t[3]; p.appendChild(a); }
    var row = document.createElement("div");
    var y = document.createElement("button"); y.type = "button"; y.className = "y"; y.textContent = t[1]; y.onclick = function () { decide("granted"); };
    var n = document.createElement("button"); n.type = "button"; n.className = "n"; n.textContent = t[2]; n.onclick = function () { decide("denied"); };
    row.appendChild(y); row.appendChild(n);
    box.appendChild(p); box.appendChild(row);
    (document.body || document.documentElement).appendChild(box);
  }
  window.avenexConsent = { open: open, required: false };
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href="#cookie-settings"]');
    if (a) { e.preventDefault(); open(); }
  });

  function byTimeZone() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      return /^Europe\//.test(tz) && !/^Europe\/(Moscow|Kirov|Volgograd|Samara|Ulyanovsk|Astrakhan|Saratov|Kaliningrad|Minsk|Istanbul|Kiev|Kyiv|Simferopol|Chisinau|Belgrade|Sarajevo|Skopje|Tirane|Podgorica)$/.test(tz)
        || /^Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe)$/.test(tz);
    } catch (e) { return false; }
  }
  function apply(required) {
    window.avenexConsent.required = required;
    if (saved !== null) return;               // the visitor already chose
    if (!required) { gtag("consent", "update", GRANTED); return; }
    if (document.body) open(); else document.addEventListener("DOMContentLoaded", open);
  }
  if (GEO && window.fetch) {
    fetch(GEO).then(function (r) { return r.json(); }).then(function (j) { apply(!!j.consent); }).catch(function () { apply(byTimeZone()); });
  } else {
    apply(byTimeZone());
  }
})();
