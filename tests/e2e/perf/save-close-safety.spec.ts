// FILE: tests/e2e/perf/save-close-safety.spec.ts
// START_MODULE_CONTRACT
//   PURPOSE: Prove the approved save/close loss-prevention behavior through real renderer input.
//   SCOPE: Rich/source/split late writes, mixed batches, fresh retries, IME and complete large-document payloads; Tauri transport is a double, not native disk evidence.
//   DEPENDS: Playwright webkit-perf, real Pinia/Muya/CodeMirror and registered-command shim.
//   LINKS: V-M-011, V-M-060; C-SAVE-CLOSE-DATA-SAFETY T-004.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   storeExpression - page-local access to the real editor store.
//   state - observable document/dirty state.
//   typeText - actual native browser input into the active editing surface.
//   installWrites - deferred correlated transport with captured exact payloads.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-10 Pin new safety invariants independently of historical loss characterizations.
// END_CHANGE_SUMMARY
import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { installTauriShim } from '../fixtures/tauri-shim'
import { bootEditor, openFileTab, waveaExperimentalBeforeAll } from './helpers/experimental'
const storeExpression = `(document.querySelector('#app')).__vue_app__.config.globalProperties.$pinia._s.get('editor')`
async function state(page:Page) {
  return page.evaluate(code=>{const store=eval(code);return {markdown:store.currentFile.markdown,isSaved:store.currentFile.isSaved,tabs:store.tabs.map((t:any)=>({id:t.id,pathname:t.pathname,markdown:t.markdown,isSaved:t.isSaved}))}},storeExpression)
}
async function typeText(page:Page,text:string,mode='rich') {
  if(mode==='rich') await page.locator('#ag-editor-id span.ag-paragraph').last().click()
  else await page.locator('.CodeMirror-line').last().click()
  await page.keyboard.press('End');await page.keyboard.type(text)
  await expect.poll(async()=>(await state(page)).markdown).toContain(text)
}
async function installWrites(page:Page) {
  await page.evaluate(()=>{
    const w=window as any;w.__writes=[];w.__releaseWrite=null
    w.__mockInvoke.mt_document_write_snapshot=({request}:any)=>{
      w.__writes.push(request)
      return new Promise(resolve=>{w.__releaseWrite=()=>resolve({...request,pathname:request.targetPath,filename:request.filename})})
    }
    w.__mockInvoke.mt_document_choose_save_target=({request}:any)=>({...request,pathname:'/tmp/safety-draft.md'})
  })
}
test.beforeAll(waveaExperimentalBeforeAll)
test.beforeEach(async({page})=>{await installTauriShim(page);await bootEditor(page);await openFileTab(page,'/tmp/safety.md','# Safety\n\nText.\n')})
for(const mode of ['rich','source','split']) {
  test(`${mode}: later typing survives delayed Save and Close, and explicit retry saves fresh text`,async({page})=>{
    if(mode!=='rich') await page.evaluate(({code,mode})=>{
      const store=eval(code);const prefs=(document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('preferences')
      if(mode==='source')prefs.sourceCode=true
      else store.currentFile.splitView=true
    },{code:storeExpression,mode})
    if(mode==='split') await expect(page.locator('.split-pane-source .CodeMirror')).toBeVisible()
    if(mode==='source') await expect(page.locator('.CodeMirror')).toBeVisible()
    await typeText(page,' FIRST',mode);await installWrites(page)
    await page.evaluate(code=>{void eval(code).CLOSE_TAB()},storeExpression)
    await page.locator('.ag-unsaved-close-save').click()
    await page.waitForFunction(()=>(window as any).__writes.length===1)
    await typeText(page,' LATER',mode);const newer=(await state(page)).markdown
    await page.evaluate(()=>(window as any).__releaseWrite())
    await expect(page.locator('.notification-card').first()).toBeVisible()
    expect((await state(page)).tabs).toHaveLength(1);expect((await state(page)).isSaved).toBe(false)
    expect((await state(page)).markdown).toBe(newer)
    await page.evaluate(()=>{const w=window as any;w.__mockInvoke.mt_document_write_snapshot=({request}:any)=>{w.__writes.push(request);return {...request,pathname:request.targetPath,filename:request.filename}}})
    await page.getByRole('button',{name:'Save again and close',exact:true}).click()
    await expect.poll(async()=>(await state(page)).tabs.length).toBe(0)
    expect(await page.evaluate(()=>(window as any).__writes[1].markdown)).toBe(newer)
  })
}
test('a mixed batch cancellation closes no target and stops subsequent writes',async({page})=>{
  await typeText(page,' NAMED')
  await page.evaluate(code=>eval(code).NEW_UNTITLED_TAB({selected:true}),storeExpression)
  await typeText(page,' UNTITLED')
  await page.evaluate(()=>{const w=window as any;w.__writes=[];w.__mockInvoke.mt_document_choose_save_target=()=>null;w.__mockInvoke.mt_document_write_snapshot=({request}:any)=>{w.__writes.push(request);return {...request,pathname:request.targetPath,filename:request.filename}}})
  await page.evaluate(code=>{void eval(code).CLOSE_ALL_TABS()},storeExpression)
  await page.locator('.ag-unsaved-close-save').click()
  await expect(page.locator('.ag-unsaved-close-dialog')).toBeHidden()
  await expect.poll(()=>page.evaluate(()=>(window as any).__writes.length)).toBe(1)
  expect((await state(page)).tabs).toHaveLength(2)
  expect((await state(page)).tabs[1].markdown).toContain('UNTITLED')
})
test('Save All preserves the complete 1 MB model including an unmounted tail',async({page})=>{
  const content=readFileSync(new URL('../fixtures/large-doc/size-1mb.md',import.meta.url),'utf8')
  await openFileTab(page,'/tmp/large-save.md',content)
  await expect(page.locator('#ag-editor-id')).toBeVisible()
  await page.evaluate(()=>{const w=window as any;w.__writes=[];w.__mockInvoke.mt_document_write_snapshot=({request}:any)=>{w.__writes.push(request);return {...request,pathname:request.targetPath,filename:request.filename}}})
  // Type into the first mounted block; compare the complete canonical model after actual input.
  await page.locator('#ag-editor-id span.ag-paragraph').first().click();await page.keyboard.type('LARGE_SAVE_MARKER')
  await expect.poll(async()=>(await state(page)).markdown).toContain('LARGE_SAVE_MARKER')
  await page.evaluate(code=>{const s=eval(code);s.SET_FILE_ENCODING({encoding:'utf16le',isBom:true});s.SET_LINE_ENDING('crlf')},storeExpression)
  const before=(await state(page)).markdown
  expect(new TextEncoder().encode(before).byteLength).toBeGreaterThan(1_000_000)
  await page.evaluate(async code=>await eval(code).ASK_FOR_SAVE_ALL(false),storeExpression)
  const written=await page.evaluate(()=>(window as any).__writes[0].markdown)
  expect(written).toBe(before)
  expect(await page.evaluate(()=>(window as any).__writes[0].format)).toEqual({encoding:'utf16le',isBom:true,lineEnding:'crlf',finalNewline:3})
  expect((await state(page)).tabs).toHaveLength(2)
})

for(const mode of ['rich','source','split']) {
  test(`${mode}: active composition refuses close and explicit post-composition save is fresh`,async({page})=>{
    if(mode!=='rich') await page.evaluate(({code,mode})=>{
      const store=eval(code);const prefs=(document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('preferences')
      if(mode==='source')prefs.sourceCode=true;else store.currentFile.splitView=true
    },{code:storeExpression,mode})
    if(mode==='rich')await page.locator('#ag-editor-id span.ag-paragraph').last().click()
    else await page.locator('.CodeMirror-line').last().click()
    const surface=mode==='rich'?page.locator('#ag-editor-id'):page.locator('.CodeMirror textarea').first()
    await surface.dispatchEvent('compositionstart',{data:'ime'})
    await page.keyboard.type('IME_SAVE_PROBE')
    await page.evaluate(async code=>{
      const w=window as any;w.__writes=[]
      w.__mockInvoke.mt_document_write_snapshot=({request}:any)=>{w.__writes.push(request);return {...request,pathname:request.targetPath}}
      w.__compositionCloseResult=await eval(code).CLOSE_TAB()
    },storeExpression)
    expect(await page.evaluate(()=>(window as any).__compositionCloseResult.status)).toBe('blocked')
    expect((await state(page)).tabs).toHaveLength(1)
    expect(await page.evaluate(()=>(window as any).__writes.length)).toBe(0)
    await expect(page.locator('.ag-unsaved-close-dialog')).toHaveCount(0)
    await surface.dispatchEvent('compositionend',{data:'IME_SAVE_PROBE'})
    await page.evaluate(async code=>await eval(code).FILE_SAVE(),storeExpression)
    expect(await page.evaluate(()=>(window as any).__writes[0].markdown)).toContain('IME_SAVE_PROBE')
    expect(await page.evaluate(()=>(window as any).__writes.length)).toBe(1)
    test.info().annotations.push({type:'evidence-tier',description:'Synthetic browser composition; native OS IME acceptance is separate.'})
  })
}
