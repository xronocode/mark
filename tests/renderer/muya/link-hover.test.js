// FILE: tests/renderer/muya/link-hover.test.js
// START_MODULE_CONTRACT
//   PURPOSE: Reproduce link hit-target misses and hover callbacks outliving their logical link.
//   SCOPE: Actual MouseEvent/LinkTools with DOM events and controlled timers; BaseFloat positioning is a test double.
//   DEPENDS: Muya link tools, EventCenter, getLinkInfo, Vitest/jsdom.
//   LINKS: M-012; C-MD-LINK-TABS T-002.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   fixture - isolated real link DOM and instance event center.
// END_MODULE_MAP
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventCenter from 'muya/lib/eventHandler/event'
import MouseEventController from 'muya/lib/eventHandler/mouseEvent'
import LinkTools from 'muya/lib/ui/linkTools'
import { getLinkInfo, resolveLinkElement } from 'muya/lib/utils/getLinkInfo'
vi.mock('muya/lib/ui/baseFloat', () => ({default: class {
  constructor(muya) { this.muya=muya; this.container=document.createElement('div'); this.floatBox=this.container; document.body.appendChild(this.container); this.status=false }
  listen() {}
  show(ref) { this.status=true; this.reference=ref }
  hide() { this.status=false }
  destroy() { this.container.remove(); this.status=false }
}}))
const fixture = () => {
  const container=document.createElement('div')
  container.innerHTML='<p id="link-paragraph" class="ag-paragraph"><span class="ag-hide" data-link-token="0:20">[</span><a class="ag-inline-rule" data-start="0" data-end="20" data-raw="[label](document.md)" data-link-token="0:20" data-link-rendered="true" href="document.md"><strong><em>label</em></strong></a><span class="ag-hide" data-link-token="0:20">](document.md)</span></p>'
  document.body.appendChild(container)
  const muya={container,eventCenter:new EventCenter(),contentState:{unlink:vi.fn()},options:{footnote:false,hideLinkPopup:false}}
  const tools=new LinkTools(muya,{jumpClick:vi.fn()});new MouseEventController(muya)
  const anchor=container.querySelector('a')
  const show=()=>muya.eventCenter.dispatch('muya-link-tools',{reference:anchor,linkInfo:getLinkInfo(anchor)})
  return {container,muya,tools,anchor,show}
}
beforeEach(()=>vi.useFakeTimers())
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();document.body.replaceChildren();vi.restoreAllMocks()})
describe('link hover ownership',()=>{
  it('resolves anchor, nested formatting and exposed syntax inside only its own container',()=>{
    const {container,anchor}=fixture()
    for(const target of [anchor,anchor.querySelector('em'),container.querySelector('span')])expect(resolveLinkElement(target,container)).toBe(anchor)
    expect(resolveLinkElement(anchor,document.createElement('div'))).toBeNull()
    expect(getLinkInfo(document.createElement('a'))).toBeNull()
  })
  it('keeps safe metadata for no-text, reference and automatic link forms',()=>{
    const {anchor}=fixture()
    for(const raw of ['[](note.md)','[label][ref]','<https://example.invalid>','https://example.invalid']){
      anchor.setAttribute('data-raw',raw);anchor.setAttribute('data-end',String(raw.length))
      const info=getLinkInfo(anchor)
      expect(info?.key).toBe('link-paragraph');expect(info?.token.range).toEqual({start:0,end:raw.length});expect(info?.href).toBe('document.md')
    }
    anchor.removeAttribute('data-start');expect(getLinkInfo(anchor)).toBeNull()
  })
  it('a newly hovered link replaces pending show/hide work for the old link',()=>{
    const {anchor,muya,tools,show}=fixture();show()
    const second=anchor.cloneNode(true);second.setAttribute('href','second.md');anchor.after(second)
    muya.eventCenter.dispatch('muya-link-tools',{reference:second,linkInfo:getLinkInfo(second)});vi.advanceTimersByTime(0)
    expect(tools.status).toBe(true);expect(tools.linkInfo.href).toBe('second.md')
    second.remove();tools.selectItem(new MouseEvent('click'),{type:'jump'});expect(tools.status).toBe(false)
  })
  it('shows tools for a direct anchor and nested label without requiring a particular text child',()=>{
    const {anchor,tools}=fixture()
    for(const target of [anchor,anchor.querySelector('em')]){
      target.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));vi.advanceTimersByTime(0);expect(tools.status).toBe(true);tools.hide()
    }
  })
  it('re-entry cancels the old hide instead of hiding the newly shown tools',()=>{
    const {muya,tools,show}=fixture();show();vi.advanceTimersByTime(0)
    muya.eventCenter.dispatch('muya-link-tools',{reference:null});vi.advanceTimersByTime(200);show();vi.advanceTimersByTime(400)
    expect(tools.status).toBe(true)
  })
  it('leaving before queued show cancels it and moving inside a label is not leave',()=>{
    const {muya,tools,anchor}=fixture()
    anchor.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))
    muya.eventCenter.dispatch('muya-link-tools',{reference:null});vi.advanceTimersByTime(0);expect(tools.status).toBe(false)
    anchor.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));vi.advanceTimersByTime(0)
    anchor.querySelector('em').dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:anchor}));vi.advanceTimersByTime(700);expect(tools.status).toBe(true)
  })
  it('pointer travel to the tools and back retains the active link',()=>{
    const {tools,anchor}=fixture();anchor.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));vi.advanceTimersByTime(0)
    anchor.dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:tools.container}));vi.advanceTimersByTime(100)
    tools.container.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,relatedTarget:anchor}));vi.advanceTimersByTime(700);expect(tools.status).toBe(true)
  })
  it('hiding or destroying cancels queued show; detached or changed links cannot reappear',()=>{
    for(const operation of ['hide','destroy','detach','change']){
      const {tools,anchor,show}=fixture();show()
      if(operation==='detach')anchor.remove()
      else if(operation==='change')anchor.setAttribute('href','different.md')
      else tools[operation]()
      vi.advanceTimersByTime(1000);expect(tools.status).toBe(false)
    }
  })
})
