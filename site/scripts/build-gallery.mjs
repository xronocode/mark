// FILE: site/scripts/build-gallery.mjs
// VERSION: 2.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Build the site's /diagrams/ page — every Pele diagram type
//            rendered at build time into inline SVG, recoloured live by
//            any of Mark's themes, wearing the shared ¶ paper/ink/marker
//            brand (site/shared/brand.css inlined at build time) with the
//            same no-flash theme choice as the docs (C-64 R-1/R-2).
//   SCOPE: render site/gallery/examples.mjs through pele (unique idPrefix
//          per card), pack cards (wide diagrams span the row), emit the
//          theme strip / filters / slideshow / fullscreen show controller,
//          inline the shared brand CSS + THEME_INIT_JS head script, and
//          produce the final HTML with the shared site head via
//          landing.mjs renderPage.
//   DEPENDS: pele (site devDependency, pinned to the app's version),
//            ./gallery-theme-vars.mjs, ../.vitepress/landing.mjs,
//            ../gallery/examples.mjs, ../shared/brand.css,
//            ../shared/theme-init.mjs (THEME_INIT_JS)
//   LINKS: .grace/changes/active/C-58 R-1/R-3/R-4; .grace/changes/active/
//          C-64 R-1/R-2/T-001; .grace/graph/features.xml M-053;
//          .grace/verification/features.xml V-M-053; site/shared/brand.css
//          (the single source of the look); site/landing/index.html (brand)
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   GALLERY_PAGE - { path, title, description } for the shared head
//   buildCards - examples + pele renders -> card HTML with visually-hidden group h2s (+ build stats)
//   buildGalleryTemplate - derived theme vars -> the page template (SITE_HEAD + %BASE% tokens)
//   renderGallery - settings (+ optional vars) -> final servable HTML
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.2.0 - 2026-10-21 C-64 T-009 (P3 deep analytics): the
//   folio nav links report nav_click with placement gallery_nav (the repo
//   link stays outbound_click), diagram_filter carries placement "gallery"
//   on both the theme strip and the group filters, and opening a card's
//   Source details sends diagram_code_view with the card's id.
//   PREV: v2.1.0 - 2026-10-18 C-64 T-007: the cards skip
//   layout/paint off-screen (content-visibility: auto; intrinsic size
//   420px, wide cards 480px — anchor links to card ids keep working,
//   the ids sit on the cv'd articles themselves), and a visually-hidden
//   h2 per group (data-group aware, hidden by the same filter) sits
//   between the cards so the H1 no longer jumps to 32 H3 card titles.
//   PREV: v2.0.0 - 2026-10-18 C-64 T-001: the gallery drops its
//   near-miss palette (#F2EDE3/#131418/#FFD21F) for the shared brand
//   tokens — site/shared/brand.css is inlined (fonts under
//   %BASE%fonts/brand/), THEME_INIT_JS runs in <head> before CSS so a
//   dark choice made in the docs paints dark here with no flash, and the
//   folio gains the brand lockup + an appearance toggle on the same
//   storage key.
//   PREV: v1.1.0 - 2026-10-18 orchestrator review: the page wears
//   the approved ¶ proof-sheet look (paper/ink, sun marker headline,
//   Bricolage Grotesque + IBM Plex self-hosted under %BASE%fonts/brand)
//   per the user's choice; solid sticky bar (the oklch color-mix tinted it).
//   v1.0.0 - 2026-10-18 C-58 T-002: first version, ported from the approved
//   prototype (site/gallery/prototype/build.reference.mjs) with the shared
//   site head (canonical/OG/analytics/consent) instead of a bare <title>.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { render } from 'pele'
import { EXAMPLES } from '../gallery/examples.mjs'
import { deriveThemeVars, themeOrder, themeDisplayName } from './gallery-theme-vars.mjs'
import { renderPage } from '../.vitepress/landing.mjs'
import { THEME_INIT_JS } from '../shared/theme-init.mjs'

const GROUPS = ['Process', 'Structure', 'Ideas', 'Plans', 'Data']

export const GALLERY_PAGE = {
  path: 'diagrams/',
  title: 'Mark — Every diagram, in every theme',
  description:
    `All ${EXAMPLES.length} Mark diagram types — flowchart, sequence, gantt, sankey, venn, agentflow and more — ` +
    'each written in a plain mermaid block and recoloured live by every one of Mark\'s themes.'
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The shared brand layer, inlined verbatim. Font urls point at the public
// dir root ("/fonts/brand/..."); here they become %BASE% tokens so
// renderPage substitutes the site base — the same rewrite Vite applies to
// these urls when the docs theme imports the file.
const brandCss = () =>
  readFileSync(new URL('../shared/brand.css', import.meta.url), 'utf8')
    .replace(/url\((['"])\/fonts\//g, 'url($1%BASE%fonts/')

// The fence keyword a reader would type: the first bare directive line.
const fenceKeyword = (code) =>
  code.split('\n').map((l) => l.trim()).find((l) => l && l !== '---' && !l.includes(':')) || ''

// START_BLOCK_GALLERY_CARDS
// One card per example, rendered through the same pele engine as the app
// (unique idPrefix per card so SVG ids never collide — the fullscreen show
// also strips ids when it clones a panel). Wide rule from the prototype:
// width >= 640 spans the full row, except xychart/treemap (aspect), while
// railroad is always wide. EXAMPLES arrive grouped contiguously, so a
// visually-hidden h2 (data-group aware, hidden by the same filter as the
// cards) opens each group — the H1 no longer drops straight into 32 H3
// card titles (C-64 T-007 A-2).
export function buildCards () {
  const stats = { examples: EXAMPLES.length, wide: 0, errors: [] }
  let cards = ''
  let lastGroup = ''
  for (const e of EXAMPLES) {
    const r = render(e.code, { idPrefix: 'g-' + e.id + '-' })
    if (!r || !r.svg || /PeleError/i.test(r.svg)) {
      stats.errors.push(e.id)
      continue
    }
    if (e.group !== lastGroup) {
      lastGroup = e.group
      cards += `<h2 class="ghead" data-group="${e.group}" id="group-${e.group.toLowerCase().replace(/\s+/g, '-')}">${e.group}</h2>\n`
    }
    const wide = ((r.width || 0) >= 640 && !['xychart', 'treemap'].includes(e.id)) || e.id === 'railroad' ? ' wide' : ''
    if (wide) stats.wide++
    cards += `<article class="card${wide}" data-group="${e.group}" id="${e.id}">
  <header><h3>${e.name}</h3><code class="kw">${esc(fenceKeyword(e.code).split(/\s/)[0])}</code></header>
  <div class="panel">${r.svg}</div>
  <details><summary>Source</summary><div class="src"><button type="button" class="copy" data-id="${e.id}">Copy</button><pre><code id="src-${e.id}">\`\`\`mermaid
${esc(e.code)}
\`\`\`</code></pre></div></details>
</article>
`
  }
  if (stats.errors.length) {
    throw new Error(`[SiteBuild][buildGallery][BLOCK_GALLERY_CARDS] pele failed to render: ${stats.errors.join(', ')}`)
  }
  return { cards, stats }
}
// END_BLOCK_GALLERY_CARDS

// START_BLOCK_GALLERY_TEMPLATE
export function buildGalleryTemplate (vars = deriveThemeVars()) {
  const themes = themeOrder(vars).map((id) => ({
    id,
    name: themeDisplayName(id),
    dark: !!vars[id].dark,
    page: vars[id].page,
    v: Object.fromEntries(Object.entries(vars[id]).filter(([k]) => k.startsWith('--pele-')))
  }))
  const { cards, stats } = buildCards()
  const themeData = JSON.stringify(
    Object.fromEntries(themes.map((t) => [t.id, { ...t.v, '--t-page': t.page, dark: t.dark }]))
  )
  const stripChips = themes
    .map(
      (t) =>
        `<button type="button" class="chip" data-t="${t.id}" aria-pressed="false"><i style="background:${t.v['--pele-bg']};box-shadow:inset 0 0 0 4px ${t.page},inset 0 0 0 5px ${t.v['--pele-accent']}"></i>${t.name}</button>`
    )
    .join('')
  const filterChips = GROUPS.map(
    (g) =>
      `<button type="button" data-g="${g}" aria-pressed="false">${g}<span class="n">${EXAMPLES.filter((e) => e.group === g).length}</span></button>`
  ).join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Mark · Every diagram, in every theme</title>
<!-- C-64 R-2: resolve the shared theme choice (docs storage key) before
     any CSS, so a dark choice made in the docs paints dark here with no
     flash. Shared head (canonical, OG, analytics/consent) is injected by
     site/.vitepress/landing.mjs renderPage; %BASE% below is the site base
     path substituted at build/dev time. -->
<script>${THEME_INIT_JS}</script>
<!--SITE_HEAD-->
<link rel="preload" href="%BASE%fonts/brand/BricolageGrotesque-800.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="%BASE%fonts/brand/IBMPlexSans-400.woff2" as="font" type="font/woff2" crossorigin>
<style>
${brandCss()}
</style>
<style>
/* Page chrome on the shared tokens: paper/ink/marker, Bricolage + Plex
   (faces and dark-mode selectors all come from the inlined brand layer
   above), then a "stage" that wears the chosen Mark theme — the diagrams
   recolour live, exactly as in the app. */
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:400 16px/1.6 var(--body);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.wrap{max-width:1240px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.skip{position:absolute;left:-9999px}
.skip:focus{left:16px;top:12px;z-index:60;background:var(--ink);color:var(--paper);padding:8px 12px;border-radius:8px}
.folio{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding-block:22px 12px;border-bottom:1px solid var(--rule);font:500 13px/1.4 var(--mono);color:var(--mute)}
.folio .brand{display:inline-flex;align-items:center;gap:7px;font-family:var(--display);font-weight:800;letter-spacing:-.01em;color:var(--ink);text-decoration:none}
.folio .brand img{display:block;width:22px;height:22px}
.folio-r{display:flex;gap:10px 16px;align-items:center;flex-wrap:wrap;min-width:0}
.folio nav{display:flex;gap:10px 18px;flex-wrap:wrap}
.folio nav a{color:var(--ink-2);text-decoration:none}
.folio nav a:hover{color:var(--ink)}
.toggle{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;border:1px solid var(--rule);background:transparent;color:var(--ink-2);cursor:pointer;font-size:13px;line-height:1;padding:0}
.toggle:hover{color:var(--ink);border-color:var(--mute)}
.toggle .sun{display:none}
:root.dark .toggle .sun,:root[data-theme="dark"] .toggle .sun{display:inline}
:root.dark .toggle .moon,:root[data-theme="dark"] .toggle .moon{display:none}
.hero{padding-block:clamp(40px,6vw,72px) 28px;display:grid;gap:16px}
h1{margin:0;font:800 clamp(40px,7vw,88px)/.95 var(--display);letter-spacing:-.025em;text-wrap:balance;max-width:18ch}
.lede{margin:0;max-width:62ch;font-size:19px;color:var(--ink-2)}
.lede code{font:500 .88em var(--mono);color:var(--ink);background:var(--chip);padding:2px 6px;border-radius:5px}
.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--paper);border-block:1px solid var(--rule);padding-block:12px}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--paper)}
.bar .wrap{display:grid;gap:10px}
.filters{display:flex;flex-wrap:wrap;gap:6px}
.filters button{font:500 13px/1 var(--body);border:1px solid var(--rule);background:transparent;color:var(--ink-2);padding:8px 12px;border-radius:999px;cursor:pointer;transition:color .15s ease,border-color .15s ease}
.filters button:hover{color:var(--ink);border-color:var(--mute)}
.filters button[aria-pressed="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.filters .n{font:500 11px var(--mono);opacity:.6;margin-left:4px}
.themes{display:flex;align-items:center;gap:10px;min-width:0}
.play{flex:none;display:inline-flex;align-items:center;gap:8px;font:600 13px/1 var(--body);padding:9px 14px;border-radius:999px;border:0;background:var(--marker);color:var(--on-marker);cursor:pointer}
.play .ic{width:10px;text-align:center}
.play.ghost{background:transparent;color:var(--ink-2);border:1px solid var(--rule)}
.play.ghost:hover{color:var(--ink);border-color:var(--mute)}
.strip{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px;min-width:0;mask-image:linear-gradient(90deg,#000 92%,transparent)}
.strip::-webkit-scrollbar{display:none}
.chip{flex:none;display:inline-flex;align-items:center;gap:7px;font:500 13px/1 var(--body);padding:6px 11px 6px 6px;border-radius:999px;border:1px solid var(--rule);background:transparent;color:var(--ink-2);cursor:pointer;white-space:nowrap}
.chip:hover{color:var(--ink);border-color:var(--mute)}
.chip i{width:18px;height:18px;border-radius:50%;display:block}
.chip[aria-pressed="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.filters button:focus-visible,.chip:focus-visible,.play:focus-visible,.copy:focus-visible,summary:focus-visible,.sh-x:focus-visible,.toggle:focus-visible{outline:2px solid var(--marker);outline-offset:2px}
.stage{background:var(--t-page,var(--card));padding-block:28px 64px;transition:background .25s}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-flow:dense;gap:16px}
.card{min-width:0;background:var(--t-page,var(--card));border:1px solid color-mix(in srgb,var(--pele-fg) 14%,transparent);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;color:var(--pele-fg);content-visibility:auto;contain-intrinsic-size:auto 420px}
/* C-64 T-007 R-3: off-screen cards skip layout/paint; the intrinsic sizes
   (regular ~420px, wide ~480px) approximate the real card heights so the
   scrollbar stays close. Card ids sit on the cv'd articles themselves, so
   #anchor jumps still land. Wide cards carry taller diagrams. */
.card[hidden]{display:none}
.card.wide{grid-column:1/-1;contain-intrinsic-size:auto 480px}
/* C-64 T-007 A-2: a per-group heading for the outline only — the filter
   hides/shows it together with its cards via data-group. */
.ghead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;margin:0}
.ghead[hidden]{display:none}
.card header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:14px 16px 10px}
.card h3{margin:0;font:700 18px/1.2 var(--display);letter-spacing:-.01em}
.kw{font:500 12px var(--mono);color:var(--pele-muted)}
.panel{margin:0 12px;background:var(--pele-bg);border-radius:10px;padding:18px;overflow-x:auto;display:flex;justify-content:center;flex:1;align-items:center}
.panel svg{max-width:100%;height:auto;display:block}
details{padding:10px 16px 14px}
summary{cursor:pointer;font:500 13px var(--body);color:var(--pele-muted);width:max-content}
.src{position:relative;margin-top:10px}
.src pre{margin:0;background:var(--pele-surface-alt);color:var(--pele-fg);border-radius:8px;padding:14px;overflow-x:auto;font:400 12.5px/1.55 var(--mono)}
.copy{position:absolute;top:8px;right:8px;font:500 12px var(--body);padding:5px 10px;border-radius:6px;border:1px solid color-mix(in srgb,var(--pele-fg) 20%,transparent);background:var(--pele-bg);color:var(--pele-fg);cursor:pointer}
.empty{grid-column:1/-1;color:var(--pele-muted)}
footer{padding-block:28px 40px;color:var(--mute);font-size:14px}
footer a{color:var(--link)}
.show{position:fixed;inset:0;z-index:50;background:var(--t-page,var(--card));color:var(--pele-fg);display:grid;grid-template-rows:auto 1fr auto;padding:max(20px,env(safe-area-inset-top,0px)) max(24px,env(safe-area-inset-right,0px)) max(20px,env(safe-area-inset-bottom,0px)) max(24px,env(safe-area-inset-left,0px));transition:background .3s}
.show[hidden]{display:none}
.sh-top,.sh-bot{display:flex;align-items:baseline;justify-content:space-between;gap:16px}
.sh-k{font:800 clamp(28px,4vw,56px)/1 var(--display);letter-spacing:-.02em}
.sh-n{font:500 13px var(--mono);color:var(--pele-muted);letter-spacing:.1em}
.sh-stage{min-height:0;display:flex;align-items:center;justify-content:center;padding:2vh 0}
.sh-stage .panel{margin:0;width:min(1400px,100%);height:100%;max-height:100%;padding:3vh 3vw;box-sizing:border-box}
.sh-stage .panel svg{width:100%;height:100%;max-width:100%;max-height:100%}
.sh-t{font:500 14px var(--body);color:var(--pele-muted);white-space:nowrap}
.sh-bar{flex:1;height:3px;background:color-mix(in srgb,var(--pele-fg) 14%,transparent);border-radius:2px;overflow:hidden}
.sh-bar i{display:block;height:100%;width:0;background:var(--marker);transition:width .3s}
.sh-hint{font:500 12px var(--mono);color:var(--pele-muted);white-space:nowrap}
.sh-x{position:absolute;top:max(14px,env(safe-area-inset-top,0px));right:max(14px,env(safe-area-inset-right,0px));width:36px;height:36px;border-radius:50%;border:1px solid color-mix(in srgb,var(--pele-fg) 20%,transparent);background:var(--pele-bg);color:var(--pele-fg);cursor:pointer;font-size:14px}
@media (max-width:760px){.grid{grid-template-columns:minmax(0,1fr)}.lede{font-size:17px}.play .lb{display:none}.sh-hint{display:none}}
@media (prefers-reduced-motion:reduce){.stage{transition:none}}
</style>
</head>
<body>
<a class="skip" href="#grid">Skip to diagrams</a>
<div class="wrap"><header class="folio">
  <span><a class="brand" href="%BASE%"><img src="%BASE%mark-icon.svg" alt="" width="22" height="22">Mark</a> · Diagram gallery</span>
  <span class="folio-r">
    <nav aria-label="Site"><a href="%BASE%diagrams/" aria-current="page" data-track="nav_click" data-target="diagrams" data-placement="gallery_nav">Diagrams</a><a href="%BASE%guide/" data-track="nav_click" data-target="docs" data-placement="gallery_nav">Docs</a><a href="%BASE%changelog" data-track="nav_click" data-target="changelog" data-placement="gallery_nav">Changelog</a><a href="https://github.com/xronocode/mark" data-track="outbound_click" data-target="github" data-placement="gallery_nav">GitHub</a></nav>
    <button type="button" id="appearance" class="toggle" aria-label="Toggle dark mode" aria-pressed="false"><span class="ic sun" aria-hidden="true">☀</span><span class="ic moon" aria-hidden="true">☾</span></button>
  </span>
</header></div>
<div class="wrap"><section class="hero">
<h1>Every diagram, <span class="hl">in every theme.</span></h1>
<p class="lede">${stats.examples} diagram types, all written in a plain <code>\`\`\`mermaid</code> block and drawn by Mark as you type. Pick any of Mark's ${themes.length} themes below and watch every diagram change with it.</p>
</section></div>
<div class="bar"><div class="wrap">
<div class="filters" role="group" aria-label="Filter by kind"><button type="button" data-g="all" aria-pressed="true">All<span class="n">${stats.examples}</span></button>${filterChips}</div>
<div class="themes"><button type="button" id="play" class="play" aria-pressed="false" aria-label="Play through themes"><span class="ic">▶</span><span class="lb">Slideshow</span></button><button type="button" id="show" class="play ghost" aria-label="Fullscreen show"><span class="ic">⛶</span><span class="lb">Fullscreen</span></button>
<div class="strip" id="strip" role="group" aria-label="Theme">${stripChips}</div></div>
</div></div>
<main class="stage" id="stage"><div class="wrap"><div class="grid" id="grid">
${cards}<p class="empty" hidden>No diagrams in this group.</p></div></div><div class="show" id="showbox" role="dialog" aria-label="Diagram show" hidden><div class="sh-top"><span class="sh-k" id="shk"></span><span class="sh-n" id="shn"></span></div>
<div class="sh-stage" id="shstage"></div>
<div class="sh-bot"><span class="sh-t" id="sht"></span><div class="sh-bar"><i id="shbar"></i></div><span class="sh-hint">Space pause · ← → step · Esc exit</span></div>
<button type="button" class="sh-x" id="shx" aria-label="Close">✕</button></div></main>
<div class="wrap"><footer>Rendered with <a href="https://pele.run">Pele</a> exactly as Mark draws them, at build time. Every colour comes from Mark's own theme files. <a href="%BASE%">Back to the landing page</a>.</footer></div>
<script>
(function () {
'use strict';
var THEMES=${themeData};
var stage=document.getElementById('stage'),strip=document.getElementById('strip'),play=document.getElementById('play');
var root=document.documentElement;
var ids=Object.keys(THEMES),cur=null,timer=null;
function apply(id,scroll){var t=THEMES[id];if(!t)return;cur=id;
 for(var k in t)if(k.indexOf('--')===0)stage.style.setProperty(k,t[k]);
 strip.querySelectorAll('.chip').forEach(function(b){var on=b.dataset.t===id;b.setAttribute('aria-pressed',String(on));
  if(on&&scroll){var l=b.offsetLeft-strip.clientWidth/2+b.offsetWidth/2;strip.scrollTo({left:l,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}});
 try{localStorage.setItem('mark-gallery-theme',id)}catch(e){}}
function stop(){if(timer){clearInterval(timer);timer=null}play.setAttribute('aria-pressed','false');play.querySelector('.ic').textContent='▶';play.querySelector('.lb').textContent='Slideshow';play.setAttribute('aria-label','Play through themes')}
function go(){apply(ids[(ids.indexOf(cur)+1)%ids.length],true)}
play.addEventListener('click',function(){if(timer){stop();return}go();timer=setInterval(go,1500);play.setAttribute('aria-pressed','true');play.querySelector('.ic').textContent='❚❚';play.querySelector('.lb').textContent='Pause';play.setAttribute('aria-label','Pause slideshow')});
strip.querySelectorAll('.chip').forEach(function(b){b.addEventListener('click',function(){stop();if(window.markTrack)window.markTrack('diagram_filter',{kind:'theme',placement:'gallery'});apply(b.dataset.t,true)})});
// The page theme was resolved before first paint by the shared head script
// (same storage key as the docs); start the diagrams on the matching
// brand pair unless the visitor already picked a Mark theme here.
var start=root.classList.contains('dark')?'ink':'paper';
try{var s=localStorage.getItem('mark-gallery-theme');if(s&&THEMES[s])start=s}catch(e){}
apply(start,true);
// Appearance toggle: same storage key as the docs, applied immediately
// (no flash), and the brand diagram pair follows when it is showing.
var tgl=document.getElementById('appearance');
tgl.setAttribute('aria-pressed',String(root.classList.contains('dark')));
tgl.addEventListener('click',function(){var dark=!root.classList.contains('dark');
 root.classList.toggle('dark',dark);root.setAttribute('data-theme',dark?'dark':'light');
 tgl.setAttribute('aria-pressed',String(dark));
 try{localStorage.setItem('vitepress-theme-appearance',dark?'dark':'light')}catch(e){}
 if(cur==='paper'||cur==='ink')apply(dark?'ink':'paper',true)});
document.querySelectorAll('.filters button').forEach(function(b){b.addEventListener('click',function(){if(window.markTrack)window.markTrack('diagram_filter',{kind:'group',placement:'gallery'});var g=b.dataset.g;
 document.querySelectorAll('.filters button').forEach(function(x){x.setAttribute('aria-pressed',String(x===b))});
 var n=0;document.querySelectorAll('.card,.ghead').forEach(function(c){var on=g==='all'||c.dataset.group===g;c.hidden=!on;if(on&&c.classList.contains('card'))n++});
 document.querySelector('.empty').hidden=n>0})});
function copyText(text){if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(text);
 return new Promise(function(ok,fail){var ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;opacity:0;pointer-events:none';document.body.appendChild(ta);ta.select();try{document.execCommand('copy')?ok():fail()}catch(e){fail(e)}ta.remove()})}
document.querySelectorAll('.copy').forEach(function(b){b.addEventListener('click',function(){
 var code=document.getElementById('src-'+b.dataset.id);
 copyText(code.textContent).then(function(){if(window.markTrack)window.markTrack('diagram_copy',{doc_id:b.dataset.id});b.textContent='Copied';setTimeout(function(){b.textContent='Copy'},1400)},
 function(){var r=document.createRange();r.selectNodeContents(code);var s=getSelection();s.removeAllRanges();s.addRange(r)})})});
// P3 (C-64 T-009): opening a card's Source details reports diagram_code_view
// with the card's id — the same doc_id diagram_copy uses. The details are
// only ever opened by the visitor here, so the toggle event is user-only.
document.querySelectorAll('.card details').forEach(function(d){
 d.addEventListener('toggle',function(){if(d.open&&window.markTrack)window.markTrack('diagram_code_view',{doc_id:d.closest('.card').id})})});
var box=document.getElementById('showbox'),shs=document.getElementById('shstage');
var si=0,sTimer=null,sPaused=false,prevTheme=null;
var cards=function(){return Array.prototype.filter.call(document.querySelectorAll('.card'),function(c){return !c.hidden})};
function slide(i){var list=cards();if(!list.length)return;si=(i+list.length)%list.length;var c=list[si];
 shs.innerHTML='';var p=c.querySelector('.panel').cloneNode(true);
 p.querySelectorAll('[id]').forEach(function(n){n.removeAttribute('id')});shs.appendChild(p);
 document.getElementById('shk').textContent=c.querySelector('h3').textContent;
 document.getElementById('shn').textContent=String(si+1).padStart(2,'0')+' / '+list.length;
 apply(ids[(ids.indexOf(prevTheme)+si+1)%ids.length],false);
 var chip=document.querySelector('.chip[data-t="'+cur+'"]');
 document.getElementById('sht').textContent=chip?chip.textContent:'';
 document.getElementById('shbar').style.width=((si+1)/list.length*100)+'%'}
function tick(){if(sPaused)return;if(si>=cards().length-1){closeShow();return}slide(si+1)}
function openShow(){stop();prevTheme=cur;box.hidden=false;sPaused=false;slide(0);sTimer=setInterval(tick,1500);
 try{if(box.requestFullscreen)box.requestFullscreen().catch(function(){})}catch(e){}
 document.getElementById('shx').focus()}
function closeShow(){if(sTimer){clearInterval(sTimer);sTimer=null}box.hidden=true;shs.innerHTML='';
 try{if(document.fullscreenElement)document.exitFullscreen()}catch(e){}}
document.getElementById('show').addEventListener('click',openShow);
document.getElementById('shx').addEventListener('click',closeShow);
box.addEventListener('click',function(e){if(e.target.closest('.sh-x'))return;sPaused=!sPaused});
document.addEventListener('fullscreenchange',function(){if(!document.fullscreenElement&&!box.hidden)closeShow()});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(!box.hidden)closeShow();else if(timer)stop();return}
 if(box.hidden)return;
 if(e.key===' '){e.preventDefault();sPaused=!sPaused}
 else if(e.key==='ArrowRight')slide(si+1);else if(e.key==='ArrowLeft')slide(si-1)});
})();
</script>
</body>
</html>
`
}
// END_BLOCK_GALLERY_TEMPLATE

// START_BLOCK_RENDER_GALLERY
/**
 * Render the servable /diagrams/ page: build the template from the app's
 * current theme files, then inject the shared site head (canonical/OG for
 * /diagrams/, analytics/consent) and substitute the site base — the same
 * renderPage path the landing uses.
 *
 * @param {{ siteUrl: string, base: string, analytics: object[] }} settings - resolveSiteSettings() output
 * @param {object} [vars] - derived theme vars (defaults to a fresh derivation)
 * @returns {string} final HTML
 */
export function renderGallery (settings, vars = deriveThemeVars()) {
  return renderPage(buildGalleryTemplate(vars), settings, GALLERY_PAGE)
}
// END_BLOCK_RENDER_GALLERY
