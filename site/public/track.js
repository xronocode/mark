/*
 * FILE: site/public/track.js
 * VERSION: 1.0.0
 * START_MODULE_CONTRACT
 *   PURPOSE: Consent-gated GA4 events for the site — download_click from
 *            any element marked data-track, share_to_mac from the iPhone
 *            bar via window.markTrack (C-64 R-7/D-7).
 *   SCOPE: delegated click listener for [data-track="download_click"]
 *          (method/placement from data-method/data-placement; copy buttons
 *          report only once their copy succeeded) plus the markTrack()
 *          entry point. Every send requires markConsent.granted() and a
 *          live window.gtag; otherwise it is a no-op (nothing is queued).
 *          Navigation is never blocked (no preventDefault, beacon transport).
 *   DEPENDS: site/public/consent.js (window.markConsent, window.gtag)
 *   LINKS: M-053 SiteBuild; C-64 T-003 R-7/D-7; site/.vitepress/landing.mjs
 *          analyticsTags (emits the tag right after consent.js)
 *   ROLE: RUNTIME
 *   MAP_MODE: NONE
 * END_MODULE_CONTRACT
 *
 *   <a data-track="download_click" data-method="app_store|homebrew_copy|windows|github"
 *      data-placement="hero|install|bar|footer|docs" ...>
 *   window.markTrack('share_to_mac', { result: 'shared' | 'copied' | 'dismissed' })
 *
 * START_CHANGE_SUMMARY
 *   LAST_CHANGE: [v1.0.0 - 2026-10-18 C-64 T-003: first version.]
 * END_CHANGE_SUMMARY
 */
(function () {
  "use strict";

  // START_BLOCK_SEND
  function send(name, params) {
    var c = window.markConsent;
    if (!c || typeof c.granted !== "function" || !c.granted()) return false;
    if (typeof window.gtag !== "function") return false;
    try {
      window.gtag("event", name, Object.assign({ transport_type: "beacon" }, params || {}));
      return true;
    } catch (e) { return false; }
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
    var el = e.target && e.target.closest ? e.target.closest("[data-track]") : null;
    if (!el || el.getAttribute("data-track") !== "download_click") return;
    var params = {
      method: el.getAttribute("data-method") || "",
      placement: el.getAttribute("data-placement") || ""
    };
    if (isCopyButton(el)) watchCopy(el, params);
    else send("download_click", params);
  }, false);
  // END_BLOCK_DOWNLOAD_CLICK
})();
