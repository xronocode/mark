/* Avenex first-party counters.
 * No cookies, no third-party SDK: page views, section views, clicks, downloads and
 * chat facts go to our own collector; the key is public but bound to this host by
 * the server's Origin check. See docs/tracking.md for the event list. */
(function () {
  var script = document.currentScript;
  var key = script && script.getAttribute("data-key");
  var endpoint = (script && script.getAttribute("data-endpoint")) || "https://dash.xronocode.com/api/v1/collect";
  if (!key) return;

  /* Avenex already instruments clicks in app.js with richer placement; the generic
     handlers stay for pages that have no explicit instrumentation. */
  var GENERIC_CLICKS = !(script && script.getAttribute("data-clicks") === "off");
  var MAX_BATCH = 10;
  var queue = [];
  var flushTimer = null;

  function sid() {
    try {
      var id = sessionStorage.getItem("ax_sid");
      if (!id) {
        id = Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem("ax_sid", id);
      }
      return id;
    } catch (e) {
      return "anon";
    }
  }

  function lastPath(update) {
    try {
      var previous = sessionStorage.getItem("ax_path") || "";
      if (update) sessionStorage.setItem("ax_path", location.pathname);
      return previous;
    } catch (e) {
      return "";
    }
  }

  function clamp(value, size) {
    return String(value == null ? "" : value).slice(0, size || 120);
  }

  function track(name, props) {
    if (typeof name !== "string" || !name) return;
    var event = {
      id: "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: name,
      ts: Date.now(),
      session: sid(),
      path: location.pathname
    };
    if (props && typeof props === "object") {
      var clean = {};
      for (var prop in props) {
        if (!Object.prototype.hasOwnProperty.call(props, prop)) continue;
        if (!/^[a-z][a-z0-9_]{0,31}$/.test(prop)) continue;
        var value = props[prop];
        if (typeof value === "string") clean[prop] = clamp(value, 120);
        else if (typeof value === "number" && isFinite(value)) clean[prop] = value;
        else if (typeof value === "boolean") clean[prop] = value;
      }
      if (Object.keys(clean).length) event.props = clean;
    }
    queue.push(event);
    if (queue.length >= MAX_BATCH) flush();
    else if (!flushTimer) flushTimer = setTimeout(flush, 900);
  }

  function flush() {
    flushTimer = null;
    if (!queue.length) return;
    var batch = queue.splice(0, MAX_BATCH);
    var body = JSON.stringify({ events: batch });
    try {
      if (navigator.sendBeacon) {
        /* text/plain keeps the beacon a simple request: no preflight, no CORS dance. */
        var blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
        if (navigator.sendBeacon(endpoint + "?key=" + encodeURIComponent(key), blob)) return;
      }
    } catch (e) {}
    try {
      fetch(endpoint, {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json", "x-collect-key": key },
        body: body
      });
    } catch (e) {}
  }

  function param(name) {
    try {
      return new URLSearchParams(location.search).get(name) || "";
    } catch (e) {
      return "";
    }
  }

  function sectionOf(node) {
    var element = node.closest ? node.closest("section[id]") : null;
    return element ? element.id : "";
  }

  /* Page view: source and the previous page of this visit. */
  var from = lastPath(true);
  var props = {};
  if (from) props.from = from;
  var referrer = "";
  try {
    referrer = document.referrer ? new URL(document.referrer).host : "";
  } catch (e) {}
  if (referrer) props.referrer = referrer;
  ["utm_source", "utm_medium", "utm_campaign"].forEach(function (name) {
    var value = param(name);
    if (value) props[name] = value;
  });
  props.lang = document.documentElement.getAttribute("data-lang") || document.documentElement.lang || "";
  track("pageview", props);
  if (document.body && document.body.getAttribute("data-status") === "404") track("not_found", {});

  /* Sections: once each, when half of the block has been on screen. */
  if (window.IntersectionObserver) {
    var seen = {};
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var id = entry.target.id;
        if (!entry.isIntersecting || seen[id]) return;
        seen[id] = true;
        track("section_view", { section: id });
      });
    }, { threshold: 0.5 });
    var sections = document.querySelectorAll("section[id]");
    for (var i = 0; i < sections.length; i++) observer.observe(sections[i]);
  }

  /* Section depth: the block was read to 90%, once per section. */
  var deep = {};
  var depthSections = [].slice.call(document.querySelectorAll("section[id]"));
  window.addEventListener("scroll", function () {
    for (var i = 0; i < depthSections.length; i++) {
      var section = depthSections[i];
      if (deep[section.id]) continue;
      var rect = section.getBoundingClientRect();
      if (rect.height <= 0) continue;
      var reached = (window.innerHeight - rect.top) / rect.height;
      if (reached >= 0.9) {
        deep[section.id] = true;
        track("section_depth", { section: section.id });
      }
    }
  }, { passive: true });

  /* Clicks: CTA, download, outbound, internal navigation. */
  if (GENERIC_CLICKS) document.addEventListener("click", function (event) {
    var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!link) return;
    var href = link.getAttribute("href") || "";
    if (href.charAt(0) === "#") return;
    var url;
    try {
      url = new URL(href, location.href);
    } catch (e) {
      return;
    }
    var section = sectionOf(link);
    var cta = link.getAttribute("data-cta");
    var file = url.pathname.match(/\.(pdf|pptx|xlsx|zip|docx)$/i);
    if (cta) track("cta_click", { cta: cta, ...(section ? { section: section } : {}) });
    if (file) track("file_download", { file: url.pathname.split("/").pop(), ...(section ? { section: section } : {}) });
    if (url.host && url.host !== location.host) {
      track("outbound", { host: url.host });
    } else if (url.pathname !== location.pathname) {
      track("nav_click", { to: url.pathname });
    }
  }, true);

  /* Language switch: links to the other locale on the same page. */
  if (GENERIC_CLICKS) document.addEventListener("click", function (event) {
    var link = event.target && event.target.closest ? event.target.closest("a[hreflang]") : null;
    if (!link) return;
    track("lang_switch", { lang: link.getAttribute("hreflang") || "" });
  }, true);

  window.addEventListener("pagehide", flush);
  window.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
  });

  /* Chat and other modules report through this one door. */
  window.avenexTrack = function (name, props) {
    track(name, props);
  };
  /* Drop-in replacement for the gtag("event", …) calls the site already has. */
  window.avenexGtag = function () {
    if (arguments[0] === "event" && typeof arguments[1] === "string") track(arguments[1], arguments[2] || {});
  };
})();
