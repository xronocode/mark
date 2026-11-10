// FILE: tests/e2e/link-interaction.spec.ts
// START_MODULE_CONTRACT
//   PURPOSE: Prove real pointer sequences distinguish reading/navigation from inline link editing.
//   SCOPE: Built renderer and registered-command fixture transport; native window/OS dispatch evidence is separate.
//   DEPENDS: Playwright Chromium/WebKit, real Vue/Pinia/Muya, tauri-shim.
//   LINKS: M-011; M-012; M-025; C-MD-LINK-TABS T-004.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   editor - real page-local editor store expression.
//   state - observable owned document state after real input.
//   wordDouble - actual glyph coordinates rather than a full-width paragraph box.
//   initialDouble - two actual press/release cycles at the leading rendered glyph.
// END_MODULE_MAP
import {test,expect,type Page,type Locator} from '@playwright/test'
import {installTauriShim} from './fixtures/tauri-shim'
import {bootEditor,openFileTab} from './fixtures/helpers'
const editor=`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('editor')`
async function state(page:Page){return page.evaluate(code=>{const s=eval(code);return{path:s.currentFile.pathname,md:s.currentFile.markdown,saved:s.currentFile.isSaved,preview:s.currentFile.previewMode,tabs:s.tabs.map((t:any)=>({path:t.pathname,md:t.markdown,saved:t.isSaved,token:t.documentToken,historyLength:t.history?.stack?.length,index:t.history?.index})),requests:(window as any).__linkRequests}},editor)}
async function initialDouble(page:Page){const link=page.locator('#ag-editor-id a.ag-inline-rule').first();await expect(link).toHaveAttribute('data-link-rendered','true');const r=await link.evaluate(a=>{const r=a.getClientRects()[0];return{x:r.x+1,y:r.y+r.height/2}});await page.mouse.dblclick(r.x,r.y,{delay:80})}
async function wordDouble(page:Page,locator:Locator){
  const point=await locator.evaluate(element=>{
    const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node:Node|null
    while((node=walker.nextNode())){if(!node.textContent?.trim())continue;const range=document.createRange();range.setStart(node,Math.min(1,node.textContent.length));range.setEnd(node,Math.min(3,node.textContent.length));const r=range.getBoundingClientRect();if(r.width&&r.height)return{x:r.x+r.width/2,y:r.y+r.height/2}}
    throw new Error('No visible word in target')
  });await page.mouse.dblclick(point.x,point.y,{delay:80})
}
test.beforeEach(async({page})=>{
  await installTauriShim(page)
  await page.addInitScript(()=>{const w=window as any;w.__linkRequests=[];w.__linkDocuments={'target.md':{pathname:'/docs/target.md',markdown:'# Target\n\nTarget body.\n'},'broken.md':false}})
  await bootEditor(page)
})
for(const [name,label] of [['plain','Open target'],['nested','**Open _target_**'],['wrapped','Open target with a long label which spans several visible lines and remains one logical link']]){
  test(`${name}: first rendered double-click opens one current-window tab without changing source`,async({page})=>{
    await openFileTab(page,'/docs/index.md',`# Source\n\n[${label}](target.md)\n\nTail.\n`)
    if(name==='wrapped')await page.locator('#ag-editor-id').evaluate(e=>{(e as HTMLElement).style.width='210px'})
    const before=await state(page);await initialDouble(page)
    await expect.poll(async()=>(await state(page)).path).toBe('/docs/target.md')
    const after=await state(page);expect(after.requests).toEqual([{href:'target.md',dirname:'/docs'}]);expect(after.tabs).toHaveLength(2)
    const source=after.tabs.find((t:any)=>t.path==='/docs/index.md');expect(source?.md).toBe(before.md);expect(source?.saved).toBe(before.saved);expect(page.context().pages()).toHaveLength(1)
  })
}
test('completed single enters editing; a fresh later double selects a word without navigation',async({page})=>{
  await openFileTab(page,'/docs/index.md','# Source\n\n[Open target](target.md)\n\nTail.\n')
  const before=await state(page);const link=page.locator('#ag-editor-id a.ag-inline-rule').first();await link.click();await expect(link).toHaveAttribute('data-link-rendered','false');expect((await state(page)).requests).toEqual([])
  await page.waitForTimeout(650);await link.dblclick({delay:80});await expect.poll(()=>page.evaluate(()=>window.getSelection()?.toString().trim())).not.toBe('')
  const after=await state(page);expect(after.requests).toEqual([]);expect(after.md).toBe(before.md);expect(after.saved).toBe(before.saved);expect(after.tabs).toHaveLength(1);expect(page.context().pages()).toHaveLength(1)
})
test('modifier navigation reuses the dirty target lifetime, text and history',async({page})=>{
  await openFileTab(page,'/docs/target.md','# Target\n\nTarget body.\n');await page.locator('#ag-editor-id span.ag-paragraph').last().click();await page.keyboard.press('End');await page.keyboard.type(' UNSAVED')
  await expect.poll(async()=>(await state(page)).saved).toBe(false)
  await page.waitForTimeout(1600)
  await openFileTab(page,'/docs/index.md','# Source\n\n[Open target](target.md)\n\nTail.\n')
  const target=(await state(page)).tabs.find((t:any)=>t.path==='/docs/target.md')
  expect(target?.md).toContain('UNSAVED');expect(target?.saved).toBe(false)
  const modifier=await page.evaluate(()=>navigator.platform.includes('Mac')?'Meta':'Control')
  await page.locator('#ag-editor-id a.ag-inline-rule').first().click({modifiers:[modifier as 'Meta'|'Control']})
  await expect.poll(async()=>(await state(page)).path).toBe('/docs/target.md');const after=await state(page)
  expect(after.tabs).toHaveLength(2);expect(after.tabs.find((t:any)=>t.path==='/docs/target.md')).toEqual(target);expect(after.requests).toHaveLength(1)
})
test('hover re-entry and pointer travel to tools stay visible and pixel-stable',async({page},info)=>{
  await openFileTab(page,'/docs/index.md','# Source\n\n[**Open _target_**](target.md)\n\nTail.\n');const before=await state(page)
  const link=page.locator('#ag-editor-id a.ag-inline-rule').first();await link.hover();const tools=page.locator('.ag-link-tools');const wrapper=tools.locator('..');await expect(wrapper).toHaveAttribute('data-popper-placement',/./)
  await page.mouse.move(2,2);await page.waitForTimeout(180);await link.hover();await page.waitForTimeout(550);await expect(wrapper).toHaveAttribute('data-popper-placement',/./)
  const box=(await tools.boundingBox())!;await page.mouse.move(box.x+2,box.y+box.height/2,{steps:10});await page.waitForTimeout(80)
  const first=await tools.screenshot({path:info.outputPath('link-tools-before.png'),animations:'disabled'});await page.waitForTimeout(650);await expect(wrapper).toHaveAttribute('data-popper-placement',/./)
  const last=await tools.screenshot({path:info.outputPath('link-tools-after.png'),animations:'disabled'});expect(last.equals(first)).toBe(true)
  await expect(link).toHaveAttribute('data-link-rendered','true')
  await page.locator('.editor-with-tabs').screenshot({path:info.outputPath('link-context.png'),animations:'disabled',caret:'hide'})
  const after=await state(page);expect(after.md).toBe(before.md);expect(after.saved).toBe(before.saved);expect(after.requests).toEqual([])
  await tools.locator('li.jump').click();await expect.poll(async()=>(await state(page)).path).toBe('/docs/target.md');expect((await state(page)).requests).toHaveLength(1)
})
test('Preview link stays read-only and a real double-click still opens its target',async({page})=>{
  await openFileTab(page,'/docs/index.md','# Source\n\n[Open target](target.md)\n\nTail.\n');await page.evaluate(code=>{eval(code).currentFile.previewMode=true},editor)
  const link=page.locator('#ag-editor-id a.ag-inline-rule').first();await link.click();expect((await state(page)).preview).toBe(true);await expect(page.locator('.editor-component')).toHaveAttribute('contenteditable','false')
  await initialDouble(page);await expect.poll(async()=>(await state(page)).path).toBe('/docs/target.md');expect((await state(page)).requests).toHaveLength(1)
})
test('reference-link and automatic URL keep their logical identity and existing destinations',async({page})=>{
  await openFileTab(page,'/docs/index.md','# Source\n\n[Open target][target]\n\n[target]: target.md\n\nTail.\n');await initialDouble(page);await expect.poll(async()=>(await state(page)).path).toBe('/docs/target.md')
  await openFileTab(page,'/docs/web.md','# Web\n\n<https://example.invalid/read>\n\nTail.\n');await initialDouble(page);await expect.poll(async()=>(await state(page)).requests.length).toBe(2);expect((await state(page)).requests[1].href).toBe('https://example.invalid/read');expect((await state(page)).path).toBe('/docs/web.md');expect(page.context().pages()).toHaveLength(1)
})

test('split rich pane navigates after source focus without changing the source buffer',async({page})=>{
  await page.setViewportSize({width:1280,height:800})
  await openFileTab(page,'/docs/index.md','# Source\n\n[Open target](target.md)\n\nTail.\n')
  await page.evaluate(()=>{(window as any).__emitFakeEvent('mt::menu-invoked','view.split-view')})
  await expect(page.locator('.split-view.is-split')).toBeVisible()
  await page.locator('.split-pane-source .CodeMirror-line').first().click()
  const before=await state(page);await initialDouble(page)
  await expect.poll(async()=>(await state(page)).path).toBe('/docs/target.md')
  const after=await state(page);expect(after.requests).toHaveLength(1);expect(after.tabs.find((t:any)=>t.path==='/docs/index.md')?.md).toBe(before.md)
})
test('source and adjacent text double-clicks select normally, while a failed target keeps the source',async({page})=>{
  await openFileTab(page,'/docs/index.md','# Source\n\n[Broken target](broken.md)\n\nOrdinary tail words.\n')
  const before=await state(page);await wordDouble(page,page.locator('#ag-editor-id span.ag-paragraph',{hasText:'Ordinary tail words.'}))
  await expect.poll(()=>page.evaluate(()=>window.getSelection()?.toString().trim())).not.toBe('');expect((await state(page)).requests).toEqual([])
  await page.evaluate(()=>{(window as any).__emitFakeEvent('mt::menu-invoked','view.source-code-mode')})
  const line=page.locator('.CodeMirror-line',{hasText:'Ordinary tail words.'});await wordDouble(page,line);await expect.poll(()=>page.evaluate(()=>window.getSelection()?.toString().trim())).not.toBe('');expect((await state(page)).requests).toEqual([])
  await page.evaluate(()=>{(window as any).__emitFakeEvent('mt::menu-invoked','view.source-code-mode')})
  // Move the caret away through ordinary input, then start a fresh link gesture.
  await page.locator('#ag-editor-id h1').click()
  await initialDouble(page);await expect.poll(async()=>(await state(page)).requests.length).toBe(1)
  const after=await state(page);expect(after.path).toBe('/docs/index.md');expect(after.md).toBe(before.md);expect(after.saved).toBe(before.saved);expect(after.tabs).toHaveLength(1);expect(page.context().pages()).toHaveLength(1)
})
