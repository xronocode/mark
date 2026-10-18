/*
 * FILE: site/public/consent.js
 * VERSION: 2.0.0
 * START_MODULE_CONTRACT
 *   PURPOSE: Google Analytics loader with Consent Mode v2 and a slim brand
 *            consent card that never covers the landing hero (C-64 R-6/D-4).
 *   SCOPE: read data-ga/data-geo/data-privacy off its own tag, default every
 *          consent signal to denied (wait_for_update), load GA4 only then,
 *          decide via the geo endpoint (time-zone fallback) whether opt-in
 *          is required, auto-grant where it is not, and show the card only
 *          after the [data-consent-after] element has fully left the
 *          viewport (IntersectionObserver, scroll fallback) or, on pages
 *          without such an element, after the first scroll or 6 s.
 *   DEPENDS: none (self-contained; sibling public/track.js reads markConsent)
 *   LINKS: M-053 SiteBuild; C-64 T-003; site/.vitepress/landing.mjs
 *          analyticsTags (emits the tag); site/public/track.js (consumer)
 *   ROLE: SCRIPT
 *   MAP_MODE: LOCALS
 * END_MODULE_CONTRACT
 *
 * START_MODULE_MAP
 *   window.markConsent - { granted(), onChange(cb), open() } consent API (avenexConsent alias)
 * END_MODULE_MAP
 *
 *   <script src="/consent.js" data-ga="G-XXXXXXX" data-geo="https://avenex.xronocode.com/api/geo" data-privacy="/privacy"></script>
 *
 * data-geo     optional endpoint returning {"consent": true|false}; without it the browser
 *              time zone (Europe/*, Atlantic/Reykjavik…) decides. Until the answer arrives,
 *              consent is denied, so no cookies are set before the decision.
 * data-privacy link shown in the card. Text follows <html lang> (en, es, pt, ru, zh, de, fr, it).
 * Reopen: any link with href="#cookie-settings", or window.markConsent.open().
 * Read state: window.markConsent.granted() / .onChange(cb); window.avenexConsent is an alias
 * kept for older embeds and also carries .required.
 *
 * START_CHANGE_SUMMARY
 *   LAST_CHANGE: [v2.0.0 - 2026-10-18 C-64 T-003: the card is slim, in the
 *                 brand tokens (paper/ink/rule, IBM Plex, radius 14), sits
 *                 bottom-left (full-width bottom on <=520px with
 *                 safe-area insets) and never appears on first paint: with
 *                 [data-consent-after] on the page it waits until that
 *                 element has fully left the viewport, otherwise for the
 *                 first scroll or 6 s. window.markConsent exposes
 *                 granted()/onChange()/open(). Consent Mode v2 mechanics,
 *                 the storage key, the #cookie-settings link, the geo gate
 *                 and the auto-grant path are unchanged.]
 *   PREV: [v1.x - deferred loader, Consent Mode v2, geo-gated banner]
 * END_CHANGE_SUMMARY
 */
(function () {
  "use strict";
  var me = document.currentScript;
  var GA = me && me.getAttribute("data-ga");
  var GEO = me && me.getAttribute("data-geo");
  var PRIVACY = (me && me.getAttribute("data-privacy")) || "";
  var KEY = "consent.v1";
  var DELAY_MS = 6000;
  var DENIED = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" };
  var GRANTED = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "granted" };

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
    en: ["We use analytics cookies to understand how the site is used.", "Allow", "No thanks", "Privacy"],
    es: ["Usamos cookies de analítica para entender cómo se usa el sitio.", "Permitir", "No, gracias", "Privacidad"],
    pt: ["Usamos cookies de análise para entender como o site é usado.", "Permitir", "Não, obrigado", "Privacidade"],
    ru: ["Мы используем аналитические cookies, чтобы понимать, как пользуются сайтом.", "Принять", "Нет, спасибо", "Конфиденциальность"],
    zh: ["我们使用分析类 Cookie 来了解网站的使用情况。", "允许", "不用了", "隐私"],
    de: ["Wir verwenden Analyse-Cookies, um zu verstehen, wie die Website genutzt wird.", "Erlauben", "Nein, danke", "Datenschutz"],
    fr: ["Nous utilisons des cookies d'analyse pour comprendre l'utilisation du site.", "Autoriser", "Non merci", "Confidentialité"],
    it: ["Usiamo cookie analitici per capire come viene usato il sito.", "Consenti", "No, grazie", "Privacy"],
  };
  var lang = (document.documentElement.lang || "en").slice(0, 2).toLowerCase();
  var t = L[lang] || L.en;

  /* ---------- state + public API ---------- */
  var state = saved === "granted";
  var listeners = [];
  function setState(v) {
    if (state === v) return;
    state = v;
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](v); } catch (e) {}
    }
  }
  function granted() { return state; }
  function onChange(cb) {
    if (typeof cb === "function") listeners.push(cb);
    return function () {
      var i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    };
  }
  window.markConsent = { granted: granted, onChange: onChange, open: function () { open(); }, required: false };
  window.avenexConsent = window.markConsent;

  /* ---------- card look (brand tokens; dark via the site's theme hooks) ---------- */
  function css() {
    if (document.getElementById("cc-css")) return;
    var st = document.createElement("style"); st.id = "cc-css";
    st.textContent = ".xcc{position:fixed;left:max(16px,env(safe-area-inset-left,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));z-index:2147483000;max-width:380px;background:#F5EFE4;color:#17191E;border:1px solid #D6CCB9;border-radius:14px;box-shadow:0 12px 32px rgba(23,25,30,.16);padding:12px 14px;font:400 13.5px/1.4 'IBM Plex Sans',system-ui,-apple-system,sans-serif;display:flex;align-items:center;gap:10px;flex-wrap:wrap;animation:xcc-in .22s ease-out}" +
      ".xcc p{margin:0;flex:1 1 160px;min-width:0}" +
      ".xcc a{color:inherit;text-decoration:underline;text-underline-offset:2px}" +
      ".xcc .y{flex:none;border:0;border-radius:9px;background:#17191E;color:#F5EFE4;font:600 13.5px/1 'IBM Plex Sans',system-ui,sans-serif;padding:9px 14px;cursor:pointer}" +
      ".xcc .n{flex:none;border:0;background:transparent;color:inherit;font:500 13.5px/1 'IBM Plex Sans',system-ui,sans-serif;padding:9px 6px;cursor:pointer;text-decoration:underline;text-underline-offset:2px}" +
      ".xcc .y:focus-visible,.xcc .n:focus-visible,.xcc a:focus-visible{outline:2px solid #FFCF1A;outline-offset:2px}" +
      ":root[data-theme=\"dark\"] .xcc,.dark .xcc,:root.dark .xcc{background:#17191E;color:#F5EFE4;border-color:#33353C}" +
      ":root[data-theme=\"dark\"] .xcc .y,.dark .xcc .y,:root.dark .xcc .y{background:#F5EFE4;color:#17191E}" +
      "@media(max-width:520px){.xcc{left:10px;right:10px;bottom:max(10px,env(safe-area-inset-bottom,0px));max-width:none;padding:10px 12px}}" +
      "@keyframes xcc-in{from{opacity:0;transform:translateY(10px)}}" +
      "@media(prefers-reduced-motion:reduce){.xcc{animation:none}}";
    document.head.appendChild(st);
  }

  var box = null;
  function decide(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
    saved = v;
    gtag("consent", "update", v === "granted" ? GRANTED : DENIED);
    setState(v === "granted");
    shown = true;   // a decision also ends the delayed-show lifecycle
    disarm();
    if (box) { box.remove(); box = null; }
  }
  function open() {
    if (box) return;
    css();
    box = document.createElement("div"); box.className = "xcc"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", t[3]);
    var p = document.createElement("p"); p.textContent = t[0] + " ";
    if (PRIVACY) { var a = document.createElement("a"); a.href = PRIVACY; a.textContent = t[3]; p.appendChild(a); }
    var y = document.createElement("button"); y.type = "button"; y.className = "y"; y.textContent = t[1]; y.onclick = function () { decide("granted"); };
    var n = document.createElement("button"); n.type = "button"; n.className = "n"; n.textContent = t[2]; n.onclick = function () { decide("denied"); };
    box.appendChild(p); box.appendChild(y); box.appendChild(n);
    (document.body || document.documentElement).appendChild(box);
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href="#cookie-settings"]');
    if (a) { e.preventDefault(); open(); }
  });

  /* ---------- timing: never on first paint over the hero ---------- */
  var armed = false, shown = false, timer = null, io = null, onScroll = null;
  function show() {
    if (shown) return;
    shown = true;
    disarm();
    if (document.body) open(); else document.addEventListener("DOMContentLoaded", open);
  }
  function disarm() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (io) { io.disconnect(); io = null; }
    if (onScroll) { window.removeEventListener("scroll", onScroll); onScroll = null; }
  }
  function arm() {
    if (armed) return;
    armed = true;
    var anchor = document.querySelector("[data-consent-after]");
    if (anchor) {
      // The card waits until the hero has fully left the viewport, so the
      // first paint is never covered. An element taller than the window is
      // still "intersecting"; threshold 0 fires once no pixel is visible.
      if ("IntersectionObserver" in window) {
        io = new IntersectionObserver(function (entries) {
          if (!entries[0].isIntersecting) show();
        });
        io.observe(anchor);
      } else {
        onScroll = function () {
          if (anchor.getBoundingClientRect().bottom < 0) show();
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
      }
    } else {
      onScroll = function () {
        if ((window.pageYOffset || document.documentElement.scrollTop || 0) > 0) show();
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      timer = setTimeout(show, DELAY_MS);
    }
  }

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
    if (!required) { gtag("consent", "update", GRANTED); setState(true); return; }
    arm();
  }
  if (GEO && window.fetch) {
    fetch(GEO).then(function (r) { return r.json(); }).then(function (j) { apply(!!j.consent); }).catch(function () { apply(byTimeZone()); });
  } else {
    apply(byTimeZone());
  }
})();
