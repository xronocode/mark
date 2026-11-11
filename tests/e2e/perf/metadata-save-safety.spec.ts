// FILE: tests/e2e/perf/metadata-save-safety.spec.ts
// START_MODULE_CONTRACT
//   PURPOSE: Prove coherent text-and-format versions in the built renderer.
//   SCOPE: Rich/source/split changes, delayed saves, Save As/All, explicit retry,
//          mixed/unrepresentable refusal and composition guards. Transport doubles
//          prove renderer state only; native bytes and system IME are separate.
//   DEPENDS: Playwright, real Vue/Pinia/Muya/CodeMirror, Tauri transport shim.
//   LINKS: V-M-011, V-M-060; C-METADATA-SAVE-SAFETY T-004.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   storeExpression - access the actual running Pinia editor store.
//   state - complete observable version/checkpoint values.
//   action - await a real store action.
//   setMode - select actual rich/source/split surface.
//   typeText - real browser input into the selected surface.
//   installWrites - capture requests and optionally defer acknowledgements.
// END_MODULE_MAP
import {test, expect, type Page} from '@playwright/test'
import {installTauriShim} from '../fixtures/tauri-shim'
import {bootEditor, openFileTab} from '../fixtures/helpers'
const storeExpression = `(document.querySelector('#app')).__vue_app__.config.globalProperties.$pinia._s.get('editor')`
async function state(page:Page) {
  return page.evaluate(code => {const s=eval(code);return s.tabs.map((t:any)=>({id:t.id,pathname:t.pathname,markdown:t.markdown,
    isSaved:t.isSaved,revision:t.contentRevision,encoding:t.encoding,lineEnding:t.lineEnding,final:t.trimTrailingNewline,
    savedFormat:t.savedFormat,savedMarkdown:t.savedMarkdown,retry:t.requiresExplicitSave}))},storeExpression)
}
async function action(page:Page,name:string,value?:any) {
  return page.evaluate(async({code,name,value})=>await eval(code)[name](value),{code:storeExpression,name,value})
}
async function setMode(page:Page,mode:string) {
  if(mode!=='rich')await page.evaluate(({code,mode})=>{
    const s=eval(code);const p=(document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('preferences')
    if(mode==='source')p.sourceCode=true;else s.currentFile.splitView=true
  },{code:storeExpression,mode})
  if(mode!=='rich')await expect(page.locator('.CodeMirror').first()).toBeVisible()
}
async function typeText(page:Page,mode:string,text:string) {
  await (mode==='rich'?page.locator('#ag-editor-id span.ag-paragraph').last():page.locator('.CodeMirror-line').last()).click()
  await page.keyboard.press('End');await page.keyboard.type(text)
  await expect.poll(async()=>(await state(page)).at(-1)!.markdown).toContain(text)
}
async function installWrites(page:Page,deferred=false) {
  await page.evaluate(defer=>{
    const w=window as any;w.__writes=[];w.__releases=[]
    w.__mockInvoke.mt_document_write_snapshot=({request}:any)=>{
      w.__writes.push(request)
      const reply={...request,pathname:request.targetPath,filename:request.targetPath.split('/').pop()}
      return defer?new Promise(resolve=>w.__releases.push(()=>resolve(reply))):reply
    }
  },deferred)
}
test.beforeEach(async({page})=>{await installTauriShim(page);await bootEditor(page);await openFileTab(page,'/tmp/metadata.md','# Format\n\nText.\n')})
for(const mode of ['rich','source','split']) {
  test(`${mode}: policy changes preserve text and a delayed ACK requires fresh explicit retry`,async({page})=>{
    await setMode(page,mode);await typeText(page,mode,' FIRST')
    const before=(await state(page))[0]
    expect(await action(page,'SET_FILE_ENCODING',{encoding:'utf16le',isBom:true})).toBe(true)
    expect(await action(page,'SET_LINE_ENDING','crlf')).toBe(true)
    expect(await action(page,'SET_FINAL_NEWLINE',0)).toBe(true)
    let tab=(await state(page))[0]
    expect(tab.markdown).toBe(before.markdown);expect(tab.isSaved).toBe(false);expect(tab.revision).toBe(before.revision+3)
    await installWrites(page,true)
    await page.evaluate(code=>{(window as any).__saving=eval(code).FILE_SAVE()},storeExpression)
    await page.waitForFunction(()=>(window as any).__writes.length===1)
    await action(page,'SET_FINAL_NEWLINE',1);await action(page,'SET_FINAL_NEWLINE',0)
    await page.evaluate(async()=>{(window as any).__releases.shift()();await (window as any).__saving})
    tab=(await state(page))[0];expect(tab.isSaved).toBe(false);expect(tab.retry).toBe(true);expect(tab.markdown).toBe(before.markdown)
    const sent=await page.evaluate(()=>(window as any).__writes[0])
    expect(sent.format).toEqual({encoding:'utf16le',isBom:true,lineEnding:'crlf',finalNewline:0});expect(sent.markdown).toBe(before.markdown)
    await installWrites(page);expect((await action(page,'FILE_SAVE')).status).toBe('completed')
    tab=(await state(page))[0];expect(tab.isSaved).toBe(true);expect(tab.retry).toBe(false);expect(tab.markdown).toBe(before.markdown)
    expect(tab.savedFormat).toEqual(sent.format)
  })
  test(`${mode}: active browser composition refuses format mutation before capture`,async({page})=>{
    await setMode(page,mode)
    const surface=mode==='rich'?page.locator('#ag-editor-id'):page.locator('.CodeMirror textarea').first()
    await surface.dispatchEvent('compositionstart',{data:'preedit'})
    const before=await state(page)
    expect(await action(page,'SET_LINE_ENDING','crlf')).toBe(false)
    expect(await action(page,'SET_FILE_ENCODING','cp1251')).toBe(false)
    expect(await action(page,'SET_FINAL_NEWLINE',1)).toBe(false)
    expect(await state(page)).toEqual(before)
    await surface.dispatchEvent('compositionend',{data:''})
    expect(await action(page,'SET_LINE_ENDING','crlf')).toBe(true)
    test.info().annotations.push({type:'evidence-tier',description:'Synthetic browser composition only; real OS IME remains separate.'})
  })
}
test('Save All includes format-only background tabs and preserves the exact target set',async({page})=>{
  await action(page,'SET_FILE_ENCODING',{encoding:'utf8',isBom:true})
  await openFileTab(page,'/tmp/metadata-second.md','# Second\n\nText.\n')
  await action(page,'SET_LINE_ENDING','crlf');const before=await state(page)
  await installWrites(page);expect((await action(page,'ASK_FOR_SAVE_ALL',false)).status).toBe('completed')
  const writes=await page.evaluate(()=>(window as any).__writes)
  expect(writes.map((r:any)=>r.targetPath)).toEqual(before.map((t:any)=>t.pathname))
  expect(writes.map((r:any)=>r.format)).toEqual([{encoding:'utf8',isBom:true,lineEnding:'lf',finalNewline:3},{encoding:'utf8',isBom:false,lineEnding:'crlf',finalNewline:3}])
  expect((await state(page)).map((t:any)=>t.markdown)).toEqual(before.map((t:any)=>t.markdown))
  expect((await state(page)).every((t:any)=>t.isSaved)).toBe(true)
})
test('Save As captures policy after the picker and cancellation preserves the original version',async({page})=>{
  await action(page,'NEW_UNTITLED_TAB',{selected:true});await typeText(page,'rich','DRAFT')
  await installWrites(page)
  await page.evaluate(()=>{const w=window as any;w.__mockInvoke.mt_document_choose_save_target=({request}:any)=>new Promise(resolve=>{w.__pick=(choice:any)=>resolve({...request,...choice})})})
  await page.evaluate(code=>{(window as any).__saving=eval(code).FILE_SAVE_AS()},storeExpression)
  await page.waitForFunction(()=>typeof (window as any).__pick==='function')
  await action(page,'SET_FILE_ENCODING',{encoding:'utf16be',isBom:true})
  await page.evaluate(async()=>{(window as any).__pick({pathname:'/tmp/draft-format.md'});await (window as any).__saving})
  const writes=await page.evaluate(()=>(window as any).__writes)
  expect(writes).toHaveLength(1);expect(writes[0].format.encoding).toBe('utf16be');expect(writes[0].format.isBom).toBe(true)
  const before=await state(page)
  await page.evaluate(()=>{(window as any).__mockInvoke.mt_document_choose_save_target=()=>null})
  expect((await action(page,'FILE_SAVE_AS')).status).toBe('cancelled');expect(await state(page)).toEqual(before)
})
test('mixed policy and unrepresentable text refuse visibly and remain retryable',async({page})=>{
  await page.evaluate(()=>{(window as any).__emitFakeEvent('mt::open-new-tab',{pathname:'/tmp/mixed.md',filename:'mixed.md',markdown:'A\r\nB\n',encoding:{encoding:'utf8',isBom:false},lineEnding:'mixed',isMixedLineEndings:true,trimTrailingNewline:3})})
  await expect.poll(async()=>(await state(page)).length).toBe(2)
  await page.evaluate(()=>{(window as any).__mockInvoke.mt_document_write_snapshot=({request}:any)=>{
    if(request.format.lineEnding==='mixed')throw Error('MT_ENC_MIXED_EOL')
    if(request.format.encoding==='cp1251')throw Error('MT_ENC_UNREPRESENTABLE')
    return {...request,pathname:request.targetPath}
  }})
  expect((await action(page,'FILE_SAVE')).status).not.toBe('completed')
  await expect(page.locator('.notification-card').first()).toBeVisible()
  expect((await state(page)).at(-1)!.isSaved).toBe(false)
  await action(page,'SET_LINE_ENDING','lf');expect((await action(page,'FILE_SAVE')).status).toBe('completed')
  await action(page,'SET_FILE_ENCODING','cp1251');expect((await action(page,'FILE_SAVE')).status).not.toBe('completed')
  expect((await state(page)).at(-1)!.isSaved).toBe(false)
  test.info().annotations.push({type:'evidence-tier',description:'Refusal transport double; Rust sentinel tests prove no byte mutation.'})
})
for (const mode of ['rich','source','split']) test(`${mode} import preserves exact source and format through an explicit save`,async({page})=>{
  const pathname='/tmp/raw-format.md'
  const markdown='# Source\r\n\r\n| A | B |\r\n| --- | --- |\r\n| one | two |\r\n\r\n- [ ] Parent\r\n    - [ ] Child\r\n'
  await page.evaluate(({pathname,markdown})=>{(window as any).__emitFakeEvent('mt::open-new-tab',{
    pathname,filename:'raw-format.md',markdown,encoding:{encoding:'utf8',isBom:true},lineEnding:'crlf',trimTrailingNewline:3
  })},{pathname,markdown})
  await expect(page.locator('#ag-editor-id table').first()).toBeVisible()
  await page.waitForFunction(code=>eval(code).currentFile?.blocks?.length>0,storeExpression)
  await setMode(page,mode)
  if(mode!=='rich') await page.locator('.CodeMirror-line').first().click()
  const before=(await state(page)).at(-1)!
  expect(before.markdown).toBe(markdown);expect(before.savedMarkdown).toBe(markdown)
  expect(before.isSaved).toBe(true);expect(before.revision).toBe(0)
  await installWrites(page)
  expect((await action(page,'FILE_SAVE')).status).toBe('completed')
  const write=await page.evaluate(()=>(window as any).__writes[0])
  expect(write.markdown).toBe(markdown)
  expect(write.format).toEqual({encoding:'utf8',isBom:true,lineEnding:'crlf',finalNewline:3})
  expect((await state(page)).at(-1)!.revision).toBe(0)
})
