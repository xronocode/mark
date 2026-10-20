/*
 * FILE: site/public/track.js
 * VERSION: 1.3.0
 * START_MODULE_CONTRACT
 *   PURPOSE: Consent-gated GA4 events for the site — download and outbound
 *            clicks, donations, content interactions, and guide completion
 *            through delegated tags or window.markTrack (C-64 R-7/D-7,
 *            T-006 M-1, T-007 P-1).
 *   SCOPE: delegated click listener for [data-track="download_click"]
 *          (method/placement from data-method/data-placement; copy buttons
 *          report only once their copy succeeded) and for
 *          [data-track="outbound_click"] (link_target from data-target,
 *          placement from data-placement) plus the markTrack() entry
 *          point; kofi_click is derived from Ko-fi anchors and doc_read is
 *          emitted once at 75% scroll depth on guide pages under either the
 *          root or a configured deployment base. Events fired
 *          while consent is granted send through a
 *          live window.gtag as before; events fired BEFORE a decision
 *          (markConsent.decided() false, card unanswered) are held in an
 *          in-memory queue (max 10, no storage of any kind, nothing
 *          persists across pages) and flushed on grant — consent.js asks
 *          for the GA script before the onChange(true) listeners run, and
 *          gtag's dataLayer queues calls made before the script arrives,
 *          so pushing after loadGA is enough. An explicit deny clears the
 *          queue and later events are dropped. Navigation is never
 *          blocked (no preventDefault, beacon transport).
 *   DEPENDS: site/public/consent.js (window.markConsent, window.gtag)
 *   LINKS: M-053 SiteBuild; C-64 T-003 R-7/D-7, T-006 M-1, T-007 P-1;
 *          site/.vitepress/landing.mjs analyticsTags (emits the tag right
 *          after consent.js)
 *   ROLE: SCRIPT
 *   MAP_MODE: LOCALS
 * END_MODULE_CONTRACT
 *
 * START_MODULE_MAP
 *   window.markTrack - (name, params) -> consent-gated GA4 event (undecided events queue in memory)
 * END_MODULE_MAP
 *
 *   <a data-track="download_click" data-method="app_store|homebrew_copy|dmg|windows"
 *      data-placement="hero|install|bar|footer|docs" ...>
 *   <a data-track="outbound_click" data-target="github"
 *      data-placement="nav|footer|docs" ...>
 *   window.markTrack('share_to_mac', { result: 'shared' | 'copied' | 'dismissed' })
 *
 * START_CHANGE_SUMMARY
 *   LAST_CHANGE: [v1.3.0 - 2026-10-21 GA4 tracking regression: use the
 *                 injected window.location and window event APIs for guide
 *                 completion tracking, including a prefixed deployment
 *                 base; this keeps browser dependencies explicit and makes
 *                 doc_read independently verifiable.]
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
  "use strict";

  // START_BLOCK_SEND
  // P-1 (C-64 T-007): until the visitor answers the card, events are held
  // in this page's memory only (max 10; no storage of any kind, nothing
  // persists across pages). Grant flushes them through gtag — consent.js
  // has already asked for the GA script by the time onChange(true) fires,
  // and gtag() itself queues into dataLayer until the script arrives. An
  // explicit deny clears the queue; later events are dropped as before.
  var QUEUE_MAX = 10;
  var queue = [];
  function consent() { return window.markConsent; }
  function undecided() {
    var c = consent();
    return !!c && typeof c.decided === "function" && !c.decided();
  }
  function send(name, params) {
    var c = consent();
    if (!c || typeof c.granted !== "function" || !c.granted()) {
      if (undecided() && queue.length < QUEUE_MAX) queue.push([name, params || {}]);
      return false;
    }
    if (typeof window.gtag !== "function") return false;
    try {
      window.gtag("event", name, Object.assign({ transport_type: "beacon" }, params || {}));
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
  document.addEventListener("click", function (e) {
    // Ko-fi donations (tracking plan 2026-10): placement defaults to footer.
    var kofi = e.target && e.target.closest ? e.target.closest('a[href*="ko-fi.com"]') : null;
    if (kofi) send("kofi_click", { placement: kofi.getAttribute("data-placement") || "footer" });
    var el = e.target && e.target.closest ? e.target.closest("[data-track]") : null;
    if (!el) return;
    var kind = el.getAttribute("data-track");
    if (kind === "outbound_click") {
      send("outbound_click", {
        link_target: el.getAttribute("data-target") || "",
        placement: el.getAttribute("data-placement") || ""
      });
      return;
    }
    if (kind !== "download_click") return;
    var params = {
      method: el.getAttribute("data-method") || "",
      placement: el.getAttribute("data-placement") || ""
    };
    if (isCopyButton(el)) watchCopy(el, params);
    else send("download_click", params);
  }, false);
  // END_BLOCK_DOWNLOAD_CLICK

  // START_BLOCK_DOC_READ
  // Guide pages: one doc_read per page at 75% scroll depth (tracking plan
  // 2026-10); undecided visitors are covered by the consent queue.
  var guideMatch = window.location.pathname.match(/(?:^|\/)guide(?:\/([^/]+))?(?:\/|$)/);
  if (guideMatch) {
    var docSent = false;
    var onDocScroll = function () {
      if (docSent) return;
      var h = document.documentElement;
      if (h.scrollTop + window.innerHeight >= h.scrollHeight * 0.75) {
        docSent = true;
        window.removeEventListener("scroll", onDocScroll);
        send("doc_read", { doc_id: guideMatch[1] || "guide" });
      }
    };
    window.addEventListener("scroll", onDocScroll, { passive: true });
  }
  // END_BLOCK_DOC_READ
})();
