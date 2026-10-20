// Mock boot: theme + iPhone mode from the hash (#dark, #ios), diagram SVGs into [data-svg], Pele theme vars onto [data-pele].
(function(){
  var h=location.hash;
  if(h.indexOf('dark')>-1)document.documentElement.setAttribute('data-theme','dark');
  var ios=h.indexOf('ios')>-1||/iPhone|iPad/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(ios)document.documentElement.classList.add('ios');
  window.applyPele=function(el,id){var t=window.THEMES[id];if(!t)return;for(var k in t)if(k.indexOf('--')===0)el.style.setProperty(k,t[k]);el.style.setProperty('--t-page',t.page);};
  document.addEventListener('DOMContentLoaded',function(){
    document.querySelectorAll('[data-svg]').forEach(function(n){n.innerHTML=window.SVG[n.dataset.svg]||'';});
    document.querySelectorAll('[data-pele]').forEach(function(n){window.applyPele(n,n.dataset.pele);});
  });
})();
