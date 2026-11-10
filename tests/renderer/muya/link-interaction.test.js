// FILE: tests/renderer/muya/link-interaction.test.js
// START_MODULE_CONTRACT
//   PURPOSE: Pin whole-gesture origin, instance ownership and single navigation delivery.
//   SCOPE: Actual controller and DOM event ordering with a spied document model; real browser selection is verified in e2e.
//   DEPENDS: LinkInteraction, EventCenter, Vitest/jsdom.
//   LINKS: M-012; C-MD-LINK-TABS T-003.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   RAW - exact source text owned by the logical link fixture.
//   fixture - source-owned link and engine with independent event center.
//   press - complete native-style mouse press/release/click sequence.
// END_MODULE_MAP
import { afterEach, describe, expect, it, vi } from 'vitest'
import LinkInteraction from 'muya/lib/eventHandler/linkInteraction'
import EventCenter from 'muya/lib/eventHandler/event'
import { isOsx } from 'muya/lib/config'
vi.mock('muya/lib/selection',()=>({default:{getCursorRange:()=>({start:{key:'owned-link',offset:4},end:{key:'owned-link',offset:4}})}}))
const RAW='[word label](target.md)'
const fixture=(rendered=true,readonly=false)=>{
  const container=document.createElement('div');container.contentEditable=String(!readonly);container.setAttribute('contenteditable',String(!readonly))
  container.innerHTML=`<p class="ag-paragraph" id="owned-link"><span data-link-token="0:${RAW.length}" class="ag-hide">[</span><a class="ag-inline-rule" data-link-token="0:${RAW.length}" data-start="0" data-end="${RAW.length}" data-raw="${RAW}" data-link-rendered="${rendered}" href="target.md"><strong>word label</strong></a></p>`
  document.body.appendChild(container)
  const block={key:'owned-link',text:RAW};const cursor={start:{key:'before',offset:0},end:{key:'before',offset:0}}
  const muya={container,eventCenter:new EventCenter(),contentState:{cursor,getBlock:vi.fn(key=>key==='owned-link'?block:{key,text:'before'})},dispatchSelectionChange:vi.fn(),keyboard:{isComposed:false},linkTools:{hide:vi.fn()}}
  const controller=new LinkInteraction(muya);muya.linkInteraction=controller
  const activate=vi.fn();muya.eventCenter.subscribe('link-activate',activate)
  const anchor=container.querySelector('a');const syntax=container.querySelector('span');muya.contentState.partialRender=()=>{anchor.dataset.linkRendered=String(muya.contentState.cursor.start.key!=='owned-link')};const generic=vi.fn(()=>{anchor.dataset.linkRendered='false'})
  container.addEventListener('click',generic)
  return {muya,controller,container,anchor,syntax,block,activate,generic,cursor}
}
const press=(target,detail=1,mods={})=>{
  const down=new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0,detail,clientX:20,clientY:10,...mods});target.dispatchEvent(down)
  target.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,button:0,detail,clientX:20,clientY:10,...mods}))
  target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0,detail,clientX:20,clientY:10,...mods}))
  return down
}
afterEach(()=>{document.body.replaceChildren();window.getSelection()?.removeAllRanges();vi.restoreAllMocks()})
describe('link whole-gesture origin',()=>{
  it('opens once from rendered origin even when the first click exposes syntax',()=>{
    const f=fixture();press(f.anchor.querySelector('strong'));expect(f.generic).not.toHaveBeenCalled()
    expect(f.anchor.dataset.linkRendered).toBe('false')
    expect(press(f.syntax,2).defaultPrevented).toBe(true)
    f.syntax.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,detail:2}))
    expect(f.activate).toHaveBeenCalledTimes(1);expect(f.activate.mock.calls[0][0].source).toBe('double');expect(f.generic).not.toHaveBeenCalled()
    expect(f.muya.contentState.cursor).toEqual(expect.objectContaining(f.cursor));expect(f.block.text).toBe(RAW)
  })
  it('a completed single click and a later fresh editing-origin double selects without navigating',()=>{
    const f=fixture();press(f.anchor);press(f.anchor,1);expect(press(f.anchor,2).defaultPrevented).toBe(false)
    f.anchor.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true,detail:2}))
    expect(f.activate).not.toHaveBeenCalled();expect(f.generic).toHaveBeenCalledTimes(2)
  })
  it('editing origin and ordinary text retain their default double-click path',()=>{
    const f=fixture(false);press(f.anchor);expect(press(f.anchor,2).defaultPrevented).toBe(false)
    expect(f.activate).not.toHaveBeenCalled()
    const plain=document.createElement('p');plain.textContent='ordinary word';f.container.appendChild(plain);press(plain);press(plain,2);expect(f.activate).not.toHaveBeenCalled()
  })
  it('modifier and tool navigation deliver once on the owning instance',()=>{
    const a=fixture(),b=fixture();press(a.anchor,1,{[isOsx?'metaKey':'ctrlKey']:true})
    expect(a.activate).toHaveBeenCalledTimes(1);expect(a.generic).not.toHaveBeenCalled();expect(b.activate).not.toHaveBeenCalled()
    b.controller.activateTool(b.anchor);expect(b.activate).toHaveBeenCalledTimes(1);expect(b.activate.mock.calls[0][0].source).toBe('tool')
  })
  it('a readonly link never enters editing and its initial double still navigates',()=>{
    const f=fixture(true,true);expect(press(f.anchor).defaultPrevented).toBe(true);press(f.anchor,2)
    expect(f.activate).toHaveBeenCalledTimes(1);expect(f.generic).not.toHaveBeenCalled();expect(f.container.getAttribute('contenteditable')).toBe('false')
  })
  it('replaced token, different nearby link, composition and document invalidation cannot reuse the first press',()=>{
    for(const reason of ['token','other','composition','epoch','destroy']){
      const f=fixture();press(f.anchor)
      let target=f.anchor
      if(reason==='token')f.block.text='modified text'
      if(reason==='other'){target=f.anchor.cloneNode(true);target.dataset.start='25';target.dataset.end='47';target.dataset.linkToken='25:47';target.setAttribute('href','other.md');f.anchor.after(target)}
      if(reason==='composition')f.container.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}))
      if(reason==='epoch')f.controller.invalidate('tab')
      if(reason==='destroy')f.controller.destroy()
      press(target,2);expect(f.activate).not.toHaveBeenCalled()
    }
  })
  it('shift/alt selection and macOS control-context clicks are not plain navigation',()=>{
    for(const modifier of ['shiftKey','altKey',...(isOsx?['ctrlKey']:[])]){
      const f=fixture();press(f.anchor,1,{[modifier]:true});press(f.anchor,2,{[modifier]:true});expect(f.activate).not.toHaveBeenCalled()
    }
  })
  it('a dragged selection and a detached tool target do not navigate',()=>{
    const f=fixture();f.anchor.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,detail:1,clientX:10,clientY:10}))
    f.container.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,buttons:1,clientX:50,clientY:10}));press(f.anchor,2);expect(f.activate).not.toHaveBeenCalled()
    f.anchor.remove();f.controller.activateTool(f.anchor);expect(f.activate).not.toHaveBeenCalled()
  })
})
