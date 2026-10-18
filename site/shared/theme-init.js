/* FILE: site/shared/theme-init.js */
/* VERSION: 1.0.0 */
/* START_MODULE_CONTRACT */
/*   PURPOSE: Resolve the saved theme choice (VitePress's storage key) or
/*            the system preference before first paint and set BOTH the
/*            VitePress dark class and data-theme on <html>, so every part
/*            of the site (docs, gallery, landing) paints dark/light with
/*            no flash and shares one choice (C-64 R-2).
/*   SCOPE: exactly this IIFE — no dependencies, no exports. Inlined into
/*          <head> before any CSS by the gallery build (and later the
/*          landing) through THEME_INIT_JS; the docs get it from the
/*          VitePress head config.
/*   DEPENDS: none (localStorage and matchMedia access is try/catch-guarded
/*            for private-mode/quota errors and for the test harness)
/*   LINKS: site/shared/brand.css (the CSS keys off what this sets);
/*          site/shared/theme-init.mjs (THEME_INIT_JS export);
/*          .grace/changes/active/C-64 R-2, corner-4
/*   ROLE: RUNTIME
/*   MAP_MODE: NONE
/* END_MODULE_CONTRACT */
/*
/* START_CHANGE_SUMMARY
/*   LAST_CHANGE: [v1.0.0 - 2026-10-18 C-64 T-001: first version.]
/* END_CHANGE_SUMMARY */
(function () {
  var preference = null;
  try { preference = localStorage.getItem('vitepress-theme-appearance'); } catch (e) {}
  var system = null;
  try { system = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) {}
  var dark = preference === 'dark' ||
    ((!preference || preference === 'auto') && !!system && system.matches);
  var root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
