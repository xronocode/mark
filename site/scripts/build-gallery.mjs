// FILE: site/scripts/build-gallery.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Build the site's /diagrams/ page — every Pele diagram type
//            rendered at build time into inline SVG, recoloured live by
//            any of Mark's themes (the approved C-58 prototype as a site
//            page in the site's own brand).
//   SCOPE: render site/gallery/examples.mjs through pele (unique idPrefix
//          per card), pack cards (wide diagrams span the row), emit the
//          theme strip / filters / slideshow / fullscreen show controller
//          (one small inline script, CSP-friendly), and produce the final
//          HTML with the shared site head via landing.mjs renderPage.
//   DEPENDS: pele (site devDependency, pinned to the app's version),
//            ./gallery-theme-vars.mjs, ../.vitepress/landing.mjs,
//            ../gallery/examples.mjs
//   LINKS: .grace/changes/active/C-58 R-1/R-3/R-4; .grace/graph/features.xml
//          M-053; .grace/verification/features.xml V-M-053;
//          site/gallery/prototype/build.reference.mjs (the approved
//          prototype this reproduces); site/landing/index.html (brand)
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   GALLERY_PAGE - { path, title, description } for the shared head
//   buildCards - examples + pele renders -> card HTML (+ build stats)
//   buildGalleryTemplate - derived theme vars -> the page template
//           (<!--SITE_HEAD--> placeholder + %BASE% tokens, like the landing)
//   renderGallery - settings (+ optional vars) -> final servable HTML
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-58 T-002: first version, ported
//   from the approved prototype (site/gallery/prototype/build.reference.mjs)
//   with two deliberate adaptations: the page chrome wears the site brand
//   from site/landing/index.html (Schibsted Grotesk + JetBrains Mono
//   self-hosted from %BASE%fonts, the oklch palette, brand-cyan accents —
//   the prototype's Google-Fonts Bricolage/IBM Plex are not used), and the
//   head is the shared site head (canonical/OG/analytics/consent) instead
//   of the prototype's bare <title>. The stage/grid/cards/show markup and
//   the controller behaviour are the prototype's, verbatim in structure.
// END_CHANGE_SUMMARY

import { render } from 'pele'
import { EXAMPLES } from '../gallery/examples.mjs'
import { deriveThemeVars, themeOrder, themeDisplayName } from './gallery-theme-vars.mjs'
import { renderPage } from '../.vitepress/landing.mjs'

const GROUPS = ['Process', 'Structure', 'Ideas', 'Plans', 'Data']

export const GALLERY_PAGE = {
  path: 'diagrams/',
  title: 'Mark — Every diagram, in every theme',
  description:
    `All ${EXAMPLES.length} Mark diagram types — flowchart, sequence, gantt, sankey, venn, agentflow and more — ` +
    'each written in a plain mermaid block and recoloured live by every one of Mark\'s themes.'
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The fence keyword a reader would type: the first bare directive line.
const fenceKeyword = (code) =>
  code.split('\n').map((l) => l.trim()).find((l) => l && l !== '---' && !l.includes(':')) || ''

// START_BLOCK_GALLERY_CARDS
// One card per example, rendered through the same pele engine as the app
// (unique idPrefix per card so SVG ids never collide — the fullscreen show
// also strips ids when it clones a panel). Wide rule from the prototype:
// width >= 640 spans the full row, except xychart/treemap (aspect), while
// railroad is always wide.
export function buildCards () {
  const stats = { examples: EXAMPLES.length, wide: 0, errors: [] }
  let cards = ''
  for (const e of EXAMPLES) {
    const r = render(e.code, { idPrefix: 'g-' + e.id + '-' })
    if (!r || !r.svg || /PeleError/i.test(r.svg)) {
      stats.errors.push(e.id)
      continue
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
<!-- Shared head (canonical, Open Graph, favicon, analytics/consent) is
     injected by site/.vitepress/landing.mjs renderPage; %BASE% below is
     the site base path substituted at build/dev time. -->
<!--SITE_HEAD-->
<link rel="preload" href="%BASE%fonts/schibsted-grotesk.woff2" as="font" type="font/woff2" crossorigin>
<style>
/* Layout: site-brand proof-sheet header and controls, then a "stage" that
   wears the chosen Mark theme — the diagrams recolor live, exactly as in
   the app. Brand tokens mirror site/landing/index.html; fonts are the
   self-hosted ones under site/public/fonts. */
@font-face{font-family:"Schibsted Grotesk";src:url("%BASE%fonts/schibsted-grotesk.woff2") format("woff2");font-weight:400 900;font-style:normal;font-display:swap}
@font-face{font-family:"JetBrains Mono";src:url("%BASE%fonts/jetbrains-mono.woff2") format("woff2");font-weight:400 700;font-style:normal;font-display:swap}
:root{--bg:oklch(0.985 0.003 225);--bg-2:oklch(0.955 0.007 225);--rule:oklch(0.89 0.01 225);--ink:oklch(0.21 0.02 238);--ink-2:oklch(0.42 0.02 238);--ink-3:oklch(0.5 0.018 238);--brand:oklch(0.74 0.13 222);--on-brand:oklch(0.18 0.03 238);--link:oklch(0.5 0.12 232);
--display:"Schibsted Grotesk",ui-sans-serif,system-ui,sans-serif;--body:"Schibsted Grotesk",ui-sans-serif,system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,"SF Mono",Menlo,monospace}
@media (prefers-color-scheme:dark){:root{--bg:oklch(0.165 0.014 242);--bg-2:oklch(0.2 0.016 242);--rule:oklch(0.3 0.018 242);--ink:oklch(0.95 0.006 230);--ink-2:oklch(0.79 0.014 235);--ink-3:oklch(0.7 0.014 235);--link:oklch(0.8 0.12 222);color-scheme:dark}}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:400 16px/1.6 var(--body);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.wrap{max-width:1240px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.skip{position:absolute;left:-9999px}
.skip:focus{left:16px;top:12px;z-index:60;background:var(--ink);color:var(--bg);padding:8px 12px;border-radius:8px}
a{color:inherit}
.folio{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;padding-block:22px 12px;border-bottom:1px solid var(--rule);font:500 13px/1.4 var(--mono);color:var(--ink-3)}
.folio .brand{font-weight:700;color:var(--ink);text-decoration:none}
.folio nav{display:flex;gap:18px}
.folio nav a{color:var(--ink-2);text-decoration:none}
.folio nav a:hover{color:var(--ink)}
.hero{padding-block:clamp(40px,6vw,72px) 28px;display:grid;gap:16px}
h1{margin:0;font:750 clamp(38px,6.5vw,80px)/1.02 var(--display);letter-spacing:-.03em;text-wrap:balance;max-width:18ch}
.hl{color:var(--link)}
.lede{margin:0;max-width:62ch;font-size:19px;color:var(--ink-2)}
.lede code{font:500 .88em var(--mono);color:var(--ink);background:var(--bg-2);padding:2px 6px;border-radius:5px}
.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:color-mix(in oklch,var(--bg) 88%,transparent);backdrop-filter:saturate(1.4) blur(12px);-webkit-backdrop-filter:saturate(1.4) blur(12px);border-block:1px solid var(--rule);padding-block:12px}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--bg)}
.bar .wrap{display:grid;gap:10px}
.filters{display:flex;flex-wrap:wrap;gap:6px}
.filters button{font:500 13px/1 var(--body);border:1px solid var(--rule);background:transparent;color:var(--ink-2);padding:8px 12px;border-radius:999px;cursor:pointer;transition:color .15s ease,border-color .15s ease}
.filters button:hover{color:var(--ink);border-color:var(--ink-3)}
.filters button[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.filters .n{font:500 11px var(--mono);opacity:.6;margin-left:4px}
.themes{display:flex;align-items:center;gap:10px;min-width:0}
.play{flex:none;display:inline-flex;align-items:center;gap:8px;font:600 13px/1 var(--body);padding:9px 14px;border-radius:999px;border:0;background:var(--brand);color:var(--on-brand);cursor:pointer}
.play .ic{width:10px;text-align:center}
.play.ghost{background:transparent;color:var(--ink-2);border:1px solid var(--rule)}
.play.ghost:hover{color:var(--ink);border-color:var(--ink-3)}
.strip{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px;min-width:0;mask-image:linear-gradient(90deg,#000 92%,transparent)}
.strip::-webkit-scrollbar{display:none}
.chip{flex:none;display:inline-flex;align-items:center;gap:7px;font:500 13px/1 var(--body);padding:6px 11px 6px 6px;border-radius:999px;border:1px solid var(--rule);background:transparent;color:var(--ink-2);cursor:pointer;white-space:nowrap}
.chip:hover{color:var(--ink);border-color:var(--ink-3)}
.chip i{width:18px;height:18px;border-radius:50%;display:block}
.chip[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.filters button:focus-visible,.chip:focus-visible,.play:focus-visible,.copy:focus-visible,summary:focus-visible,.sh-x:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.stage{background:var(--t-page);padding-block:28px 64px;transition:background .25s}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-flow:dense;gap:16px}
.card{min-width:0;background:var(--t-page);border:1px solid color-mix(in srgb,var(--pele-fg) 14%,transparent);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;color:var(--pele-fg)}
.card[hidden]{display:none}
.card.wide{grid-column:1/-1}
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
footer{padding-block:28px 40px;color:var(--ink-3);font-size:14px}
footer a{color:var(--link)}
.show{position:fixed;inset:0;z-index:50;background:var(--t-page);color:var(--pele-fg);display:grid;grid-template-rows:auto 1fr auto;padding:max(20px,env(safe-area-inset-top,0px)) max(24px,env(safe-area-inset-right,0px)) max(20px,env(safe-area-inset-bottom,0px)) max(24px,env(safe-area-inset-left,0px));transition:background .3s}
.show[hidden]{display:none}
.sh-top,.sh-bot{display:flex;align-items:baseline;justify-content:space-between;gap:16px}
.sh-k{font:750 clamp(28px,4vw,56px)/1 var(--display);letter-spacing:-.02em}
.sh-n{font:500 13px var(--mono);color:var(--pele-muted);letter-spacing:.1em}
.sh-stage{min-height:0;display:flex;align-items:center;justify-content:center;padding:2vh 0}
.sh-stage .panel{margin:0;width:min(1400px,100%);height:100%;max-height:100%;padding:3vh 3vw;box-sizing:border-box}
.sh-stage .panel svg{width:100%;height:100%;max-width:100%;max-height:100%}
.sh-t{font:500 14px var(--body);color:var(--pele-muted);white-space:nowrap}
.sh-bar{flex:1;height:3px;background:color-mix(in srgb,var(--pele-fg) 14%,transparent);border-radius:2px;overflow:hidden}
.sh-bar i{display:block;height:100%;width:0;background:var(--brand);transition:width .3s}
.sh-hint{font:500 12px var(--mono);color:var(--pele-muted);white-space:nowrap}
.sh-x{position:absolute;top:max(14px,env(safe-area-inset-top,0px));right:max(14px,env(safe-area-inset-right,0px));width:36px;height:36px;border-radius:50%;border:1px solid color-mix(in srgb,var(--pele-fg) 20%,transparent);background:var(--pele-bg);color:var(--pele-fg);cursor:pointer;font-size:14px}
@media (max-width:760px){.grid{grid-template-columns:minmax(0,1fr)}.lede{font-size:17px}.play .lb{display:none}.sh-hint{display:none}}
@media (prefers-reduced-motion:reduce){.stage{transition:none}}
</style>
</head>
<body>
<a class="skip" href="#grid">Skip to diagrams</a>
<div class="wrap"><header class="folio">
  <span><a class="brand" href="%BASE%">Mark</a> · Diagram gallery</span>
  <nav aria-label="Site"><a href="%BASE%guide/">Docs</a><a href="https://github.com/xronocode/mark">GitHub</a></nav>
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
var ids=Object.keys(THEMES),cur=null,timer=null;
function apply(id,scroll){var t=THEMES[id];if(!t)return;cur=id;
 for(var k in t)if(k.indexOf('--')===0)stage.style.setProperty(k,t[k]);
 strip.querySelectorAll('.chip').forEach(function(b){var on=b.dataset.t===id;b.setAttribute('aria-pressed',String(on));
  if(on&&scroll){var l=b.offsetLeft-strip.clientWidth/2+b.offsetWidth/2;strip.scrollTo({left:l,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}});
 try{localStorage.setItem('mark-gallery-theme',id)}catch(e){}}
function stop(){if(timer){clearInterval(timer);timer=null}play.setAttribute('aria-pressed','false');play.querySelector('.ic').textContent='▶';play.querySelector('.lb').textContent='Slideshow';play.setAttribute('aria-label','Play through themes')}
function go(){apply(ids[(ids.indexOf(cur)+1)%ids.length],true)}
play.addEventListener('click',function(){if(timer){stop();return}go();timer=setInterval(go,1500);play.setAttribute('aria-pressed','true');play.querySelector('.ic').textContent='❚❚';play.querySelector('.lb').textContent='Pause';play.setAttribute('aria-label','Pause slideshow')});
strip.querySelectorAll('.chip').forEach(function(b){b.addEventListener('click',function(){stop();apply(b.dataset.t,true)})});
var start=matchMedia('(prefers-color-scheme: dark)').matches?'ink':'paper';
try{var s=localStorage.getItem('mark-gallery-theme');if(s&&THEMES[s])start=s}catch(e){}
apply(start,true);
document.querySelectorAll('.filters button').forEach(function(b){b.addEventListener('click',function(){var g=b.dataset.g;
 document.querySelectorAll('.filters button').forEach(function(x){x.setAttribute('aria-pressed',String(x===b))});
 var n=0;document.querySelectorAll('.card').forEach(function(c){var on=g==='all'||c.dataset.group===g;c.hidden=!on;if(on)n++});
 document.querySelector('.empty').hidden=n>0})});
function copyText(text){if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(text);
 return new Promise(function(ok,fail){var ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;opacity:0;pointer-events:none';document.body.appendChild(ta);ta.select();try{document.execCommand('copy')?ok():fail()}catch(e){fail(e)}ta.remove()})}
document.querySelectorAll('.copy').forEach(function(b){b.addEventListener('click',function(){
 var code=document.getElementById('src-'+b.dataset.id);
 copyText(code.textContent).then(function(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy'},1400)},
 function(){var r=document.createRange();r.selectNodeContents(code);var s=getSelection();s.removeAllRanges();s.addRange(r)})})});
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
