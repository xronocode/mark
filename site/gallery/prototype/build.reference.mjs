import { render } from 'pele'
import { EXAMPLES } from './examples.mjs'
import fs from 'fs'
const vars = JSON.parse(fs.readFileSync('theme-vars.json', 'utf8'))
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const kw = (code) => code.split('\n').map((l) => l.trim()).find((l) => l && l !== '---' && !l.includes(':') ) || ''
const NAMES = { 'paper':'Paper','ink':'Ink','docs':'Docs','docs-dark':'Docs Dark','macos':'macOS','macos-dark':'macOS Dark','alucard':'Alucard','ayu-dark':'Ayu Dark','ayu-light':'Ayu Light','catppuccin-latte':'Catppuccin Latte','catppuccin-mocha':'Catppuccin Mocha','dracula':'Dracula','everforest-dark':'Everforest Dark','everforest-light':'Everforest Light','graphite':'Graphite','graphite-dark':'Graphite Dark','gruvbox-dark':'Gruvbox Dark','gruvbox-light':'Gruvbox Light','kanagawa':'Kanagawa','kanagawa-lotus':'Kanagawa Lotus','nord':'Nord','nord-light':'Nord Light','one-dark':'One Dark','one-light':'One Light','rose-pine':'Rosé Pine','rose-pine-dawn':'Rosé Pine Dawn','solarized-dark':'Solarized Dark','solarized-light':'Solarized Light','tokyo-night':'Tokyo Night','tokyo-night-light':'Tokyo Night Light','ulysses':'Ulysses','ulysses-dark':'Ulysses Dark' }
const order = ['paper','ink','docs','docs-dark','macos','macos-dark', ...Object.keys(NAMES).filter((k) => !['paper','ink','docs','docs-dark','macos','macos-dark'].includes(k)).sort()]
const THEMES = order.map((k) => ({ id: k, name: NAMES[k], dark: !!vars[k].dark, v: Object.fromEntries(Object.entries(vars[k]).filter(([a]) => a.startsWith('--pele-'))), page: vars[k].page }))
const GROUPS = ['Process', 'Structure', 'Ideas', 'Plans', 'Data']
let cards = ''
for (const e of EXAMPLES) {
  const r = render(e.code, { idPrefix: 'g-' + e.id + '-' })
  const wide = ((r.width || 0) >= 640 && !['xychart','treemap'].includes(e.id)) || e.id === 'railroad' ? ' wide' : ''
  cards += `<article class="card${wide}" data-group="${e.group}" id="${e.id}">
  <header><h3>${e.name}</h3><code class="kw">${esc(kw(e.code).split(/\s/)[0])}</code></header>
  <div class="panel">${r.svg}</div>
  <details><summary>Source</summary><div class="src"><button type="button" class="copy" data-id="${e.id}">Copy</button><pre><code id="src-${e.id}">\`\`\`mermaid\n${esc(e.code)}\n\`\`\`</code></pre></div></details>
</article>\n`
}
const opts = (dark) => THEMES.filter((t) => t.dark === dark).map((t) => `<option value="${t.id}">${t.name}</option>`).join('')
const html = `<title>Mark Diagram Gallery</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
/* Layout: proof-sheet header in the Mark brand, then a "stage" that wears the chosen Mark theme — the diagrams recolor live, exactly as in the app. */
:root{--paper:#F2EDE3;--ink:#131418;--sun:#FFD21F;--mute:#5E584C;--rule:#CFC6B4;--chip:#E7E0D2;
--display:'Bricolage Grotesque',system-ui,sans-serif;--body:'IBM Plex Sans',system-ui,sans-serif;--mono:'IBM Plex Mono',ui-monospace,Menlo,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#17181C;--ink:#F2EDE3;--mute:#A39C8D;--rule:#34353B;--chip:#24252B;color-scheme:dark}}
:root[data-theme="dark"]{--paper:#17181C;--ink:#F2EDE3;--mute:#A39C8D;--rule:#34353B;--chip:#24252B;color-scheme:dark}
body{background:var(--paper);color:var(--ink);font:400 16px/1.55 var(--body)}
.wrap{max-width:1240px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.folio{display:flex;justify-content:space-between;gap:12px;padding-block:22px 12px;border-bottom:1px solid var(--rule);font:500 11px/1.4 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--mute)}
.hero{padding-block:44px 28px;display:grid;gap:14px}
h1{margin:0;font:800 clamp(40px,7vw,88px)/.95 var(--display);letter-spacing:-.025em;text-wrap:balance;max-width:16ch}
.hl{background:linear-gradient(transparent 58%,var(--sun) 58%,var(--sun) 90%,transparent 90%);color:var(--ink)}
:root[data-theme="dark"] .hl{color:var(--sun);background:none}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .hl{color:var(--sun);background:none}}
.lede{margin:0;max-width:62ch;font-size:19px;color:var(--mute)}
.lede code{font:500 .9em var(--mono);color:var(--ink);background:var(--chip);padding:1px 6px;border-radius:5px}
.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--paper);border-block:1px solid var(--rule);padding-block:12px}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--paper)}
.bar .wrap{display:grid;gap:10px}
.row{display:flex;flex-wrap:wrap;gap:6px}
.filters{display:flex;flex-wrap:wrap;gap:6px}
.filters button{font:500 13px/1 var(--body);border:1px solid var(--rule);background:transparent;color:var(--ink);padding:8px 12px;border-radius:999px;cursor:pointer}
.filters button[aria-pressed="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.filters button:focus-visible,.copy:focus-visible,summary:focus-visible{outline:2px solid var(--sun);outline-offset:2px}
.filters .n{font:500 11px var(--mono);opacity:.6;margin-left:4px}
.themes{display:flex;align-items:center;gap:10px;min-width:0}
.play{flex:none;display:inline-flex;align-items:center;gap:8px;font:600 13px/1 var(--body);padding:9px 14px;border-radius:999px;border:0;background:var(--sun);color:#131418;cursor:pointer}
.play .ic{width:10px;text-align:center}
.strip{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px;min-width:0;mask-image:linear-gradient(90deg,#000 92%,transparent)}
.strip::-webkit-scrollbar{display:none}
.chip{flex:none;display:inline-flex;align-items:center;gap:7px;font:500 13px/1 var(--body);padding:6px 11px 6px 6px;border-radius:999px;border:1px solid var(--rule);background:transparent;color:var(--ink);cursor:pointer;white-space:nowrap}
.chip i{width:18px;height:18px;border-radius:50%;display:block}
.chip[aria-pressed="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.play:focus-visible,.chip:focus-visible{outline:2px solid var(--sun);outline-offset:2px}
.stage{background:var(--t-page);padding-block:28px 64px;transition:background .25s}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-flow:dense;gap:16px}
.card{min-width:0;background:var(--t-page);border:1px solid color-mix(in srgb,var(--pele-fg) 14%,transparent);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;color:var(--pele-fg)}
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
footer{padding-block:28px 40px;color:var(--mute);font-size:14px}
footer a{color:var(--ink)}
.play.ghost{background:transparent;color:var(--ink);border:1px solid var(--rule)}
.show{position:fixed;inset:0;z-index:50;background:var(--t-page);color:var(--pele-fg);display:grid;grid-template-rows:auto 1fr auto;padding:max(20px,env(safe-area-inset-top,0px)) max(24px,env(safe-area-inset-right,0px)) max(20px,env(safe-area-inset-bottom,0px)) max(24px,env(safe-area-inset-left,0px));transition:background .3s}
.show[hidden]{display:none}
.sh-top,.sh-bot{display:flex;align-items:baseline;justify-content:space-between;gap:16px}
.sh-k{font:800 clamp(28px,4vw,56px)/1 var(--display);letter-spacing:-.02em}
.sh-n{font:500 13px var(--mono);color:var(--pele-muted);letter-spacing:.1em}
.sh-stage{min-height:0;display:flex;align-items:center;justify-content:center;padding:2vh 0}
.sh-stage .panel{margin:0;width:min(1400px,100%);height:100%;max-height:100%;padding:3vh 3vw;box-sizing:border-box}
.sh-stage .panel svg{width:100%;height:100%;max-width:100%;max-height:100%}
.sh-t{font:500 14px var(--body);color:var(--pele-muted);white-space:nowrap}
.sh-bar{flex:1;height:3px;background:color-mix(in srgb,var(--pele-fg) 14%,transparent);border-radius:2px;overflow:hidden}
.sh-bar i{display:block;height:100%;width:0;background:var(--sun);transition:width .3s}
.sh-hint{font:500 12px var(--mono);color:var(--pele-muted);white-space:nowrap}
.sh-x{position:absolute;top:max(14px,env(safe-area-inset-top,0px));right:max(14px,env(safe-area-inset-right,0px));width:36px;height:36px;border-radius:50%;border:1px solid color-mix(in srgb,var(--pele-fg) 20%,transparent);background:var(--pele-bg);color:var(--pele-fg);cursor:pointer;font-size:14px}
.sh-x:focus-visible{outline:2px solid var(--sun);outline-offset:2px}
@media (max-width:760px){.sh-hint{display:none}}
@media (max-width:760px){.grid{grid-template-columns:minmax(0,1fr)}.lede{font-size:17px}.play .lb{display:none}}
@media (prefers-reduced-motion:reduce){.stage{transition:none}}
</style>
<div class="wrap"><div class="folio"><span>¶ Mark &#160;—&#160; Diagram gallery</span><span>Pele engine · Mark 2.4</span></div>
<section class="hero"><h1>Every diagram, <span class="hl">in every theme.</span></h1>
<p class="lede">${EXAMPLES.length} diagram types, all written in a plain <code>\`\`\`mermaid</code> block and drawn by Mark as you type. Pick any of Mark's ${THEMES.length} themes below and watch every diagram change with it.</p></section></div>
<div class="bar"><div class="wrap">
<div class="row"><div class="filters" role="group" aria-label="Filter by kind"><button type="button" data-g="all" aria-pressed="true">All<span class="n">${EXAMPLES.length}</span></button>${GROUPS.map((g) => `<button type="button" data-g="${g}" aria-pressed="false">${g}<span class="n">${EXAMPLES.filter((e) => e.group === g).length}</span></button>`).join('')}</div>
</div>
<div class="themes"><button type="button" id="play" class="play" aria-pressed="false" aria-label="Play through themes"><span class="ic">▶</span><span class="lb">Slideshow</span></button><button type="button" id="show" class="play ghost" aria-label="Fullscreen show"><span class="ic">⛶</span><span class="lb">Fullscreen</span></button>
<div class="strip" id="strip" role="group" aria-label="Theme">${THEMES.map((t) => `<button type="button" class="chip" data-t="${t.id}" aria-pressed="false"><i style="background:${t.v['--pele-bg']};box-shadow:inset 0 0 0 4px ${t.page},inset 0 0 0 5px ${t.v['--pele-accent']}"></i>${t.name}</button>`).join('')}</div></div>
</div></div>
<main class="stage" id="stage"><div class="wrap"><div class="grid" id="grid">
${cards}<p class="empty" hidden>No diagrams in this group.</p></div></div><div class="show" id="showbox" hidden><div class="sh-top"><span class="sh-k" id="shk"></span><span class="sh-n" id="shn"></span></div>
<div class="sh-stage" id="shstage"></div>
<div class="sh-bot"><span class="sh-t" id="sht"></span><div class="sh-bar"><i id="shbar"></i></div><span class="sh-hint">Space pause · ← → step · Esc exit</span></div>
<button type="button" class="sh-x" id="shx" aria-label="Close">✕</button></div></main>
<div class="wrap"><footer>Rendered with <a href="https://pele.run">Pele</a> exactly as Mark draws them. Colours are taken from Mark's own theme files.</footer></div>
<script>
const THEMES=${JSON.stringify(Object.fromEntries(THEMES.map((t) => [t.id, { ...t.v, '--t-page': t.page, dark: t.dark }])))};
const stage=document.getElementById('stage'),strip=document.getElementById('strip'),play=document.getElementById('play');
const ids=Object.keys(THEMES);let cur=null,timer=null;
function apply(id,scroll){const t=THEMES[id];if(!t)return;cur=id;for(const k in t)if(k.startsWith('--'))stage.style.setProperty(k,t[k]);strip.querySelectorAll('.chip').forEach(b=>{const on=b.dataset.t===id;b.setAttribute('aria-pressed',String(on));if(on&&scroll){const l=b.offsetLeft-strip.clientWidth/2+b.offsetWidth/2;strip.scrollTo({left:l,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}});try{localStorage.setItem('mark-gallery-theme',id)}catch(e){}}
function stop(){clearInterval(timer);timer=null;play.setAttribute('aria-pressed','false');play.querySelector('.ic').textContent='▶';play.querySelector('.lb').textContent='Slideshow';play.setAttribute('aria-label','Play through themes')}
function go(){apply(ids[(ids.indexOf(cur)+1)%ids.length],true)}
play.addEventListener('click',()=>{if(timer){stop();return}go();timer=setInterval(go,1500);play.setAttribute('aria-pressed','true');play.querySelector('.ic').textContent='❚❚';play.querySelector('.lb').textContent='Pause';play.setAttribute('aria-label','Pause slideshow')});
strip.querySelectorAll('.chip').forEach(b=>b.addEventListener('click',()=>{stop();apply(b.dataset.t,true)}));
const sysDark=matchMedia('(prefers-color-scheme: dark)').matches||document.documentElement.dataset.theme==='dark';
let start=sysDark&&document.documentElement.dataset.theme!=='light'?'ink':'paper';try{const s=localStorage.getItem('mark-gallery-theme');if(s&&THEMES[s])start=s}catch(e){}
apply(start,true);
document.querySelectorAll('.filters button').forEach(b=>b.addEventListener('click',()=>{const g=b.dataset.g;document.querySelectorAll('.filters button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));let n=0;document.querySelectorAll('.card').forEach(c=>{const on=g==='all'||c.dataset.group===g;c.hidden=!on;if(on)n++});document.querySelector('.empty').hidden=n>0}));
document.querySelectorAll('.copy').forEach(b=>b.addEventListener('click',()=>{const code=document.getElementById('src-'+b.dataset.id);const txt=code.textContent;const done=()=>{b.textContent='Copied';setTimeout(()=>b.textContent='Copy',1400)};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(done,()=>{const r=document.createRange();r.selectNodeContents(code);const s=getSelection();s.removeAllRanges();s.addRange(r)})}}));
const box=document.getElementById('showbox'),shs=document.getElementById('shstage');let si=0,sTimer=null,sPaused=false,prevTheme=null;
const cards=()=>[...document.querySelectorAll('.card')].filter(c=>!c.hidden);
function slide(i){const list=cards();if(!list.length)return;si=(i+list.length)%list.length;const c=list[si];
 shs.innerHTML='';const p=c.querySelector('.panel').cloneNode(true);p.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));shs.appendChild(p);
 document.getElementById('shk').textContent=c.querySelector('h3').textContent;document.getElementById('shn').textContent=String(si+1).padStart(2,'0')+' / '+list.length;
 apply(ids[(ids.indexOf(prevTheme)+si+1)%ids.length],false);document.getElementById('sht').textContent=THEMES[cur]?document.querySelector('.chip[data-t="'+cur+'"]').textContent:'';
 document.getElementById('shbar').style.width=((si+1)/list.length*100)+'%'}
function tick(){if(sPaused)return;if(si>=cards().length-1){closeShow();return}slide(si+1)}
function openShow(){stop();prevTheme=cur;box.hidden=false;box.appendChild(document.createTextNode(''));sPaused=false;slide(0);sTimer=setInterval(tick,1500);
 try{box.requestFullscreen&&box.requestFullscreen().catch(()=>{})}catch(e){};document.getElementById('shx').focus()}
function closeShow(){clearInterval(sTimer);sTimer=null;box.hidden=true;shs.innerHTML='';try{document.fullscreenElement&&document.exitFullscreen()}catch(e){}}
document.getElementById('show').addEventListener('click',openShow);
document.getElementById('shx').addEventListener('click',closeShow);
box.addEventListener('click',e=>{if(e.target.closest('.sh-x'))return;sPaused=!sPaused});
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&!box.hidden)closeShow()});
document.addEventListener('keydown',e=>{if(box.hidden)return;if(e.key==='Escape')closeShow();else if(e.key===' '){e.preventDefault();sPaused=!sPaused}else if(e.key==='ArrowRight')slide(si+1);else if(e.key==='ArrowLeft')slide(si-1)});
</script>
`
fs.writeFileSync('gallery.html', html)
console.log('ok', (html.length / 1024).toFixed(0) + ' KB', EXAMPLES.filter(e => (render(e.code).width||0) >= 640).map(e => e.id).join(','))
