/*
 * FILE: site/public/track.js
 * VERSION: 2.0.0
 * START_MODULE_CONTRACT
 *   PURPOSE: Consent-gated GA4 events for the site — the portfolio layer
 *            (download_click, outbound_click, share_to_mac, kofi_click,
 *            snippet_copy, diagram_copy, diagram_filter, doc_read) plus the
 *            C-64 T-009 P3 deep layer (os on install intent, nav_click,
 *            section_view, stage_drag, prompt_open, appearance_toggle,
 *            scroll_depth, code_copy, doc_nav, diagram_code_view,
 *            not_found), every one through the same send/markTrack path.
 *   SCOPE: delegated click listener for [data-track] (download_click with
 *          method/placement + os, outbound_click, nav_click with
 *          target/placement), Ko-fi links, the appearance switches
 *          (landing/gallery .toggle, docs .VPSwitchAppearance), the
 *          VitePress code-block copy buttons and doc nav links; one passive
 *          scroll listener carrying doc_read (75%, /guide/*, per route) and
 *          scroll_depth (25/50/75/100, once per threshold per page, on /,
 *          /diagrams/, /changelog only — never /guide/*, where doc_read
 *          already covers 75%); section_view through an IntersectionObserver
 *          over [data-section] (silently skipped without IO); not_found on
 *          the VitePress .NotFound layout, once per route, no path; the
 *          window.markTrack() entry point for code-driven events
 *          (share_to_mac, snippet_copy, diagram_copy, stage_drag,
 *          prompt_open). The docs are an SPA: history.pushState is wrapped
 *          once and popstate watched so the per-page "once" flags re-arm on
 *          every route change. Paths are read relative to the base this
 *          script was loaded from (its own src). Events fired while consent
 *          is granted send through a live window.gtag; events fired BEFORE
 *          a decision (markConsent.decided() false, card unanswered) are
 *          held in an in-memory queue (max 10, no storage of any kind,
 *          nothing persists across pages) and flushed on grant — consent.js
 *          asks for the GA script before the onChange(true) listeners run.
 *          An explicit deny clears the queue and later events are dropped.
 *          Navigation is never blocked (no preventDefault, beacon
 *          transport). No PII, no free text, no full URLs/query/hash and no
 *          referrer ever leave as event params (language is set globally by
 *          consent.js, never per event).
 *   DEPENDS: site/public/consent.js (window.markConsent, window.gtag)
 *   LINKS: M-053 SiteBuild; C-64 T-003 R-7/D-7, T-006 M-1, T-007 P-1,
 *          T-009 (P3); site/.vitepress/landing.mjs analyticsTags (emits the
 *          tag right after consent.js)
 *   ROLE: SCRIPT
 *   MAP_MODE: LOCALS
 * END_MODULE_CONTRACT
 *
 * START_MODULE_MAP
 *   window.markTrack - (name, params) -> consent-gated GA4 event (undecided events queue in memory)
 * END_MODULE_MAP
 *
 * Inner helpers (inside the IIFE, not module locals):
 *   QUEUE_MAX - cap for the undecided in-memory event queue (10)
 *   queue - undecided events held in this page's memory only
 *   consent - () -> window.markConsent
 *   undecided - () -> true while the consent card is still unanswered
 *   send - (name, params) -> gtag event; stamps os on download_click/share_to_mac
 *   flush - resend the held queue once consent is granted
 *   osParam - html classes -> mac|win|linux|ios|android (android/ios beat os-*)
 *   BASE - site base prefix read from this script's own src ("" at the root)
 *   relPath - () -> window.location.pathname relative to BASE (base-tolerant helpers)
 *   navTarget - internal href -> nav_click target enum (unknown -> "other")
 *   docId - () -> current guide/reference page slug (doc_read/code_copy/doc_nav)
 *   isGuidePage - () -> true on /guide/* pages
 *   pageType - () -> landing|gallery|changelog, "" elsewhere (scroll_depth)
 *   areaPlacement - () -> landing|gallery|docs (appearance_toggle placement)
 *   isCopyButton/watchCopy - copy buttons report once .is-copied appears
 *   checkNotFound - one not_found per route while the .NotFound layout is up
 *   onRoute - re-arm the per-page once flags after pushState/popstate
 *   onDocScroll/onDepthScroll/armScroll - doc_read at 75% on guide pages (self-removing, re-armed per route) and scroll_depth thresholds on landing/gallery/changelog
 *
 *   <a data-track="download_click" data-method="app_store|homebrew_copy|dmg|windows"
 *      data-placement="hero|hero_alt|install|bar|footer|docs" ...>
 *   <a data-track="outbound_click" data-target="github"
 *      data-placement="nav|footer|docs|gallery_nav" ...>
 *   <a data-track="nav_click" data-target="diagrams|docs|changelog|privacy|editions|faq|home|all_downloads|guide|other"
 *      data-placement="nav|footer|hero|install|hero_alt|gallery_nav" ...>
 *   <section data-section="hero|agents|diagrams|page|native|install" ...>
 *   window.markTrack('share_to_mac', { result: 'shared' | 'copied' | 'dismissed' })
 *   window.markTrack('stage_drag', { method: 'pointer' | 'keyboard' })
 *   window.markTrack('prompt_open', { placement: 'agents' })
 *   window.markTrack('diagram_copy', { doc_id }) / ('diagram_filter', { kind, placement })
 *   window.markTrack('diagram_code_view', { doc_id }) / ('snippet_copy', {})
 *
 * P3 — deep layer (C-64 T-009). Same consent gate, queue and beacon path as
 * the portfolio layer; params stay enums/slugs, language stays global.
 *
 *   event              | params                                        | trigger
 *   -------------------|-----------------------------------------------|----------------------------------------------
 *   download_click     | method, placement, + os (mac/win/linux/ios/   | existing event; os stamped from the pre-paint
 *                      | android, from the html classes, mobile wins)  | html classes on every send
 *   share_to_mac       | result, + os (as above)                       | existing event; os stamped on every send
 *   nav_click          | target, placement                             | internal nav chrome (header/mobile/footer nav,
 *                      |                                               | editions links, gallery folio nav); target from
 *                      |                                               | data-target or derived from the href path,
 *                      |                                               | unknown internal paths -> "other"
 *   section_view       | section (hero/agents/diagrams/page/native/    | landing section >= 50% visible (IO over
 *                      | install)                                      | [data-section]), once per page per section
 *   stage_drag         | method (pointer/keyboard)                     | first move of the before/after hero handle
 *   prompt_open        | placement (agents)                            | visitor opens the agent-prompt details
 *   diagram_filter     | kind, + placement (landing/gallery)           | existing event; landing wall chips and gallery
 *                      |                                               | strip/filters now say where they live
 *   appearance_toggle  | mode (light/dark), placement (landing/gallery/ | appearance switch click (landing .toggle,
 *                      | docs)                                         | gallery .toggle, docs .VPSwitchAppearance)
 *   scroll_depth       | percent (25/50/75/100), page_type (landing/   | per threshold, at most once per page, only on
 *                      | gallery/changelog)                            | /, /diagrams/ and /changelog (never /guide/*)
 *   code_copy          | doc_id, lang (slug <= 20)                     | VitePress code-block copy button click
 *   doc_nav            | kind (sidebar/prev_next/outline), doc_id      | clicks inside .VPSidebar, .VPDocFooter .pager,
 *                      | (current page slug)                           | .VPDocAsideOutline
 *   diagram_code_view  | doc_id                                        | gallery card "Source" details opened by user
 *   not_found          | (none — the path is never sent)               | VitePress .NotFound layout, once per route
 *
 * START_CHANGE_SUMMARY
 *   LAST_CHANGE: [v2.0.0 - 2026-10-21 C-64 T-009 (P3 deep layer): os
 *                 stamped on every download_click/share_to_mac from the
 *                 pre-paint html classes (android/ios beat os-*); nav_click
 *                 for the internal nav chrome (data-target or the href
 *                 path, unknown -> other); section_view via Intersection-
 *                 Observer over [data-section]; one passive scroll listener
 *                 carrying the per-route doc_read and scroll_depth
 *                 (25/50/75/100 on /, /diagrams/, /changelog only);
 *                 code_copy/doc_nav/not_found for the VitePress docs, SPA-
 *                 aware (pushState wrapped once, popstate watched, once
 *                 flags re-arm per route); appearance_toggle for the
 *                 landing/gallery/docs switches; paths read relative to the
 *                 script's own base; header documents the P3 table. The
 *                 START_BLOCK_DOC_READ anchor is intentionally replaced by
 *                 START_BLOCK_ROUTE + START_BLOCK_SCROLL.]
 *   PREV: [v1.2.0 - 2026-10-18 C-64 T-007 (P-1): events fired
 *                 before a consent decision are held in an in-memory
 *                 queue (max 10, no storage, nothing crosses pages),
 *                 flushed through gtag on grant after consent.js has
 *                 asked for the GA script, and cleared on deny. Events
 *                 after an explicit deny are dropped as before.]
 *   PREV: [v1.1.0 - 2026-10-18 C-64 T-006: DMG links report
 *                 method "dmg" so downloads are distinguishable from
 *                 repository visits, and the GitHub nav/footer links move
 *                 to the new outbound_click event (link_target +
 *                 placement) sent through the same consent-gated helper.]
 *   PREV: [v1.0.0 - 2026-10-18 C-64 T-003: first version.]
 * END_CHANGE_SUMMARY
 */
(function () {
  // Test harnesses evaluate this file without browser globals; real pages
  // always have them.
  "use strict";
  // Browser dependencies come through window (test harnesses inject them).
  var loc = window.location || { pathname: "/", search: "", origin: "", href: "" };
  var onWin = typeof window.addEventListener === "function" ? window.addEventListener.bind(window) : function () {};
  var offWin = typeof window.removeEventListener === "function" ? window.removeEventListener.bind(window) : function () {};

  // START_BLOCK_SEND
  // P-1 (C-64 T-007): until the visitor answers the card, events are held
  // in this page's memory only (max 10; no storage of any kind, nothing
  // persists across pages). Grant flushes them through gtag — consent.js
  // has already asked for the GA script by the time onChange(true) fires,
  // and gtag() itself queues into dataLayer until the script arrives. An
  // explicit deny clears the queue; later events are dropped as before.
  // T-009 (P3): install intent carries the visitor's system — os is read
  // from the pre-paint html classes (never the UA string) and omitted when
  // the page sets none (docs pages), so existing assertions on the param
  // set stay valid wherever os does not apply.
  var QUEUE_MAX = 10;
  var queue = [];
  function consent() { return window.markConsent; }
  function undecided() {
    var c = consent();
    return !!c && typeof c.decided === "function" && !c.decided();
  }
  function send(name, params) {
    var p = params || {};
    if ((name === "download_click" || name === "share_to_mac") && !p.os) {
      var os = osParam();
      if (os) p = Object.assign({}, p, { os: os });
    }
    var c = consent();
    if (!c || typeof c.granted !== "function" || !c.granted()) {
      if (undecided() && queue.length < QUEUE_MAX) queue.push([name, p]);
      return false;
    }
    if (typeof window.gtag !== "function") return false;
    try {
      window.gtag("event", name, Object.assign({ transport_type: "beacon" }, p));
      return true;
    } catch (e) { return false; }
  }
  function flush() {
    var held = queue;
    queue = [];
    for (var i = 0; i < held.length; i++) send(held[i][0], held[i][1]);
  }
  var c0 = consent();
  if (c0 && typeof c0.onChange === "function") {
    c0.onChange(function (granted) {
      if (granted) flush();
      else queue = [];
    });
  }
  // END_BLOCK_SEND
  window.markTrack = send;

  // START_BLOCK_OS
  // The landing's pre-paint script sets os-mac/os-win/os-linux plus
  // ios/android on <html>. Mobile classes win over the desktop os-* pair
  // (an Android phone also matches the linux branch of that script).
  function osParam() {
    var de = document.documentElement;
    var cl = de && de.classList;
    if (!cl || typeof cl.contains !== "function") return "";
    if (cl.contains("android")) return "android";
    if (cl.contains("ios")) return "ios";
    if (cl.contains("os-win")) return "win";
    if (cl.contains("os-linux")) return "linux";
    if (cl.contains("os-mac")) return "mac";
    return "";
  }
  // END_BLOCK_OS

  // START_BLOCK_ROUTE
  // The docs are a VitePress SPA and track.js loads once, so every per-page
  // "once" flag (doc_read, scroll_depth thresholds, not_found) re-arms on
  // each route change: history.pushState is wrapped exactly once, popstate
  // is watched, and both re-check one tick later because the SPA paints the
  // new layout after the history call. Paths are read relative to the base
  // this script was loaded from, so a /mark/-based mirror behaves like the
  // root site.
  var BASE = "";
  try {
    var cs = document.currentScript;
    var src = cs && cs.getAttribute ? cs.getAttribute("src") || "" : "";
    var at = src.indexOf("track.js");
    if (at > 0) BASE = src.slice(0, at);            // "/mark/" (root: "")
  } catch (e) {}
  function relPath() {
    var p = loc.pathname;
    if (BASE && BASE !== "/" && p.indexOf(BASE) === 0) p = p.slice(BASE.length - 1);
    return p || "/";
  }
  function navTarget(href) {
    if (!href) return "other";
    if (href.charAt(0) === "#") return href === "#all-downloads" ? "all_downloads" : "other";
    var path = href.split("?")[0].split("#")[0];
    var known = { "": "home", diagrams: "diagrams", changelog: "changelog", privacy: "privacy", editions: "editions", faq: "faq", guide: "docs" };
    var last = path.replace(/\/+$/, "").split("/").pop();
    if (Object.prototype.hasOwnProperty.call(known, last)) return known[last];
    return /(^|\/)guide(\/|$)/.test(path) ? "guide" : "other";
  }
  // Same guide rule as the portfolio doc_read (root or a deployment base).
  var GUIDE_RE = /(?:^|\/)guide(?:\/([^/]+))?(?:\/|$)/;
  function docId() { var m = String(loc.pathname || "").match(GUIDE_RE); return (m && m[1]) || "guide"; }
  function isGuidePage() { return GUIDE_RE.test(String(loc.pathname || "")); }
  function pageType() {
    var last = relPath().replace(/\/+$/, "").split("/").pop();
    if (last === "diagrams") return "gallery";
    if (last === "changelog") return "changelog";
    if (last === "") return "landing";
    return "";                                       // /guide/* and everything else
  }
  function areaPlacement() {
    var p = relPath();
    if (/(^|\/)diagrams(\/|$)/.test(p)) return "gallery";
    if (/(^|\/)(guide|reference)(\/|$)/.test(p)) return "docs";
    return "landing";
  }
  var routePath = loc.pathname;
  var docSent = false;
  var depthFired = {};
  var nfSent = false;
  function checkNotFound() {
    if (nfSent) return;
    var found = null;
    if (typeof document.querySelector === "function") {
      try { found = document.querySelector(".NotFound"); } catch (e) {}
    }
    if (found) {
      nfSent = true;
      send("not_found", {});                         // never the path
    }
  }
  function onRoute() {
    if (loc.pathname === routePath) return;
    routePath = loc.pathname;
    docSent = false;
    depthFired = {};
    nfSent = false;
    checkNotFound();
    armScroll();
  }
  if (!window.__markTrackPushWrapped && window.history && typeof window.history.pushState === "function") {
    window.__markTrackPushWrapped = true;
    var push = window.history.pushState.bind(window.history);
    window.history.pushState = function () {
      var r = push.apply(null, arguments);
      onRoute();
      setTimeout(onRoute, 0);                        // SPA paints after the history call
      return r;
    };
  }
  onWin("popstate", function () {
    onRoute();
    setTimeout(onRoute, 0);
  });
  checkNotFound();
  // The 404 layout is painted by the SPA after this script runs on a full load.
  onWin("load", function () { checkNotFound(); setTimeout(checkNotFound, 800); });
  // END_BLOCK_ROUTE

  // START_BLOCK_DOWNLOAD_CLICK
  // Copy buttons (data-copy / data-copy-target) only count once the copy
  // itself succeeded: the page marks the finished copy with .is-copied, so
  // poll briefly for that signal; links fire on click.
  function isCopyButton(el) {
    return el.hasAttribute("data-copy") || el.hasAttribute("data-copy-target");
  }
  function watchCopy(el, params) {
    var tries = 0;
    (function check() {
      var done = el.classList && el.classList.contains("is-copied");
      if (done) { send("download_click", params); return; }
      if (++tries < 20) setTimeout(check, 100);   // give up after ~2 s
    })();
  }
  // END_BLOCK_DOWNLOAD_CLICK

  // START_BLOCK_CLICKS
  // One delegated click listener for every event the page markup can fire:
  // the portfolio layer (kofi/download/outbound), the P3 nav_click branch,
  // and the P3 branches that need no data-track attributes — the appearance
  // switches, the VitePress code-block copy buttons and the docs nav. The
  // appearance mode is read after the click: the page's own element-level
  // listener (landing/gallery toggle, VitePress switch) has already flipped
  // html.dark by the time this bubble-phase listener runs.
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || typeof t.closest !== "function") return;
    // Ko-fi donations (tracking plan 2026-10): placement defaults to footer.
    var kofi = t.closest('a[href*="ko-fi.com"]');
    if (kofi) send("kofi_click", { placement: (kofi.getAttribute && kofi.getAttribute("data-placement")) || "footer" });
    var el = t.closest("[data-track]");
    if (el) {
      var kind = el.getAttribute("data-track");
      if (kind === "outbound_click") {
        send("outbound_click", {
          link_target: el.getAttribute("data-target") || "",
          placement: el.getAttribute("data-placement") || ""
        });
        return;
      }
      if (kind === "nav_click") {
        send("nav_click", {
          target: el.getAttribute("data-target") || navTarget(el.getAttribute("href")),
          placement: el.getAttribute("data-placement") || ""
        });
        return;
      }
      if (kind === "download_click") {
        var params = {
          method: el.getAttribute("data-method") || "",
          placement: el.getAttribute("data-placement") || ""
        };
        if (isCopyButton(el)) watchCopy(el, params);
        else send("download_click", params);
        return;
      }
    }
    var ap = t.closest(".toggle, .VPSwitchAppearance");
    if (ap) {
      var de = document.documentElement;
      send("appearance_toggle", {
        mode: de && de.classList && de.classList.contains("dark") ? "dark" : "light",
        placement: ap.classList && ap.classList.contains && ap.classList.contains("VPSwitchAppearance")
          ? "docs"
          : areaPlacement()
      });
      return;
    }
    var cp = t.closest(".vp-doc button.copy");
    if (cp) {
      var wrap = typeof cp.closest === "function" ? cp.closest('div[class*="language-"]') : null;
      var lang = "";
      if (wrap && wrap.className) {
        var lm = /(?:^|\s)language-([^\s]+)/.exec(String(wrap.className));
        if (lm) lang = lm[1].toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20);
      }
      send("code_copy", { doc_id: docId(), lang: lang });
      return;
    }
  }, false);
  // Docs nav: the VitePress router swallows clicks on internal links before
  // they bubble to document, so doc_nav listens on window in the capture
  // phase (it only reads the link; the router still navigates).
  // The router may already have moved the URL when this runs, so the page
  // the visitor clicked FROM is snapshotted on pointerdown.
  var navFrom = "";
  onWin("pointerdown", function () { navFrom = docId(); }, true);
  onWin("click", function (e) {
    var t = e.target;
    if (!t || typeof t.closest !== "function") return;
    var dn = t.closest(".VPSidebar a, .VPDocFooter .pager a, .VPDocAsideOutline a");
    if (!dn) return;
    var box = typeof dn.closest === "function" ? dn.closest(".VPSidebar, .VPDocFooter .pager, .VPDocAsideOutline") : null;
    var nk = "sidebar";
    if (box && box.classList && box.classList.contains) {
      if (box.classList.contains("VPDocAsideOutline")) nk = "outline";
      else if (box.classList.contains("pager")) nk = "prev_next";
    }
    send("doc_nav", { kind: nk, doc_id: navFrom || docId() });
    navFrom = "";
  }, true);
  // END_BLOCK_CLICKS

  // START_BLOCK_SCROLL
  // One passive scroll listener for both depth signals (T-009): doc_read at
  // 75% on /guide/* (per route) and scroll_depth 25/50/75/100 — each
  // threshold at most once per page — on /, /diagrams/ and /changelog only
  // (never /guide/*, where doc_read already covers 75%). Enhanced
  // measurement is off for this stream, so nothing double-counts.
  function depthPct() {
    var h = document.documentElement;
    var full = (h && h.scrollHeight) || 0;
    if (!full) return -1;
    return ((window.pageYOffset || (h && h.scrollTop) || 0) + (window.innerHeight || 0)) / full * 100;
  }
  // doc_read keeps the portfolio contract: its own listener, removed once it
  // fires; re-armed when the SPA moves to another guide page.
  var docArmed = false;
  function onDocScroll() {
    if (docSent) return;
    if (depthPct() >= 75) {
      docSent = true;
      docArmed = false;
      offWin("scroll", onDocScroll);
      send("doc_read", { doc_id: docId() });
    }
  }
  var depthArmed = false;
  function onDepthScroll() {
    var pt = pageType();
    if (!pt) return;
    var pct = depthPct();
    var marks = [25, 50, 75, 100];
    for (var i = 0; i < marks.length; i++) {
      if (!depthFired[marks[i]] && pct >= marks[i]) {
        depthFired[marks[i]] = true;
        send("scroll_depth", { percent: marks[i], page_type: pt });
      }
    }
  }
  function armScroll() {
    if (isGuidePage() && !docSent && !docArmed) { docArmed = true; onWin("scroll", onDocScroll, { passive: true }); }
    if (pageType() && !depthArmed) { depthArmed = true; onWin("scroll", onDepthScroll, { passive: true }); }
  }
  armScroll();
  // END_BLOCK_SCROLL

  // START_BLOCK_SECTIONS
  // Landing: one section_view per section per page load, once it is at
  // least half visible. Sections carry data-section="hero|agents|diagrams|
  // page|native|install"; without IntersectionObserver this silently does
  // nothing (spec: skip, never polyfill).
  if ("IntersectionObserver" in window && typeof document.querySelectorAll === "function") {
    var sectionsSeen = {};
    try {
      var secEls = document.querySelectorAll("[data-section]");
      var secIo = new window.IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var en = entries[i];
          var id = en.target && en.target.getAttribute ? en.target.getAttribute("data-section") : "";
          if (id && !sectionsSeen[id] && en.intersectionRatio >= 0.5) {
            sectionsSeen[id] = true;
            send("section_view", { section: id });
          }
        }
      }, { threshold: 0.5 });
      for (var si = 0; si < secEls.length; si++) secIo.observe(secEls[si]);
    } catch (e) {}
  }
  // END_BLOCK_SECTIONS
})();
