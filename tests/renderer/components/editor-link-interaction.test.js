// FILE: tests/renderer/components/editor-link-interaction.test.js
// START_MODULE_CONTRACT
//   PURPOSE: Verify real editor-host instance/lifetime and read-only guards around link activation.
//   SCOPE: Mounted Vue component and real Pinia store; Muya rendering is a test double.
//   DEPENDS: editor.vue, Vue Test Utils, Pinia fixtures.
//   LINKS: M-011; C-MD-LINK-TABS T-003.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   instances - independent Muya instances exposing their registered host callbacks.
//   mountLinkHost - real host with an owned current document and observed store routing.
//   i18n - test localization instance.
// END_MODULE_MAP
import { nextTick } from 'vue'
import bus from '@/bus'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('electron-log', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
}))

const instances=vi.hoisted(()=>[])
vi.mock('muya/lib',()=>{
  class MockMuya {
    constructor(el,opts){this.container=el;this.options=opts;this.events={};this.contentState={getBlocks:()=>[],getMuyaIndexCursor:()=>null,history:{unified:false}};this.linkInteraction={epoch:1,isLinkTarget:t=>!!t?.closest?.('a'),invalidate:()=>{this.linkInteraction.epoch++}};instances.push(this)}
    static use(){}
    on(name,fn){this.events[name]=fn}
    off(){} destroy(){} setFocusMode(){} setFont(){} setOptions(){} setTabSize(){} setListIndentation(){} hideAllFloatTools(){} focus(){} blur(){}
    getSelection(){return{cursorCoords:{y:0}}} getMarkdown(){return this.options.markdown} getTOC(){return[]} getHistory(){return{stack:[]}}
    clearHistory(){} setHistory(){} setMarkdown(markdown){this.options.markdown=markdown;this.linkInteraction.invalidate()}
  }
  return{default:MockMuya,BLOCK_MOUNT_SERVED:'BLOCK_MOUNT_SERVED',BLOCK_SYNC_REGION_DONE:'BLOCK_SYNC_REGION_DONE',BLOCK_TAIL_MOUNT_DONE:'BLOCK_TAIL_MOUNT_DONE'}
})

vi.mock('muya/lib/ui/tablePicker', () => ({ default: {} }))
vi.mock('muya/lib/ui/quickInsert', () => ({ default: {} }))
vi.mock('muya/lib/ui/codePicker', () => ({ default: {} }))
vi.mock('muya/lib/ui/emojiPicker', () => ({ default: {} }))
vi.mock('muya/lib/ui/imagePicker', () => ({ default: {} }))
vi.mock('muya/lib/ui/imageSelector', () => ({ default: {} }))
vi.mock('muya/lib/ui/imageToolbar', () => ({ default: {} }))
vi.mock('muya/lib/ui/transformer', () => ({ default: {} }))
vi.mock('muya/lib/ui/formatPicker', () => ({ default: {} }))
vi.mock('muya/lib/ui/linkTools', () => ({ default: {} }))
vi.mock('muya/lib/ui/footnoteTool', () => ({ default: {} }))
vi.mock('muya/lib/ui/tableTools', () => ({ default: {} }))
vi.mock('muya/lib/ui/frontMenu', () => ({ default: {} }))
vi.mock('muya/themes/default.css', () => ({}))
vi.mock('@/assets/themes/codemirror/one-dark.css', () => ({}))

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn() }
}))
vi.mock('@/services/printService', () => ({
  default: class { renderMarkdown() {} clearup() {} }
}))
vi.mock('@/commands', () => ({
  SpellcheckerLanguageCommand: class {}
}))
vi.mock('@/spellchecker', () => ({
  SpellChecker: class {
    constructor() { this.isEnabled = false; this.lang = 'en' }
    activateSpellchecker() {}
    deactivateSpellchecker() {}
  }
}))
vi.mock('@/util', () => ({
  isOsx: false,
  animatedScrollTo: vi.fn()
}))
vi.mock('@/util/fileSystem', () => ({
  moveImageToFolder: vi.fn(),
  moveToRelativeFolder: vi.fn(),
  uploadImage: vi.fn()
}))
vi.mock('@/util/clipboard', () => ({
  guessClipboardFilePath: vi.fn()
}))
vi.mock('@/util/pdf', () => ({
  getCssForOptions: vi.fn(async () => ''),
  getHtmlToc: vi.fn(() => '')
}))
vi.mock('@/util/theme', () => ({
  addCommonStyle: vi.fn(),
  setEditorWidth: vi.fn(),
  setWrapCodeBlocks: vi.fn()
}))
vi.mock('@/config', () => ({
  DEFAULT_EDITOR_FONT_FAMILY: 'sans-serif'
}))

// Polyfill ResizeObserver for jsdom
globalThis.ResizeObserver = class ResizeObserver {
  constructor(cb) { this._cb = cb }
  observe() {}
  unobserve() {}
  disconnect() {}
}

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

const mountLinkHost=async(preview=false)=>{
  const pinia=setupTestPinia();const{useEditorStore}=await import('@/store/editor');const store=useEditorStore()
  store.currentFile={id:'link-owner',documentToken:'lifetime-1',filename:'index.md',pathname:'/docs/index.md',markdown:'# Source',isSaved:true,previewMode:preview,cursor:null,wordCount:{word:1},notifications:[],scrollTop:0,history:{stack:[]}};store.tabs=[store.currentFile];store.updateTabIdToIndex();store.END_BOOT_PHASE()
  const route=vi.spyOn(store,'FORMAT_LINK_CLICK').mockImplementation(()=>{})
  const exit=vi.spyOn(store,'EXIT_PREVIEW_MODE')
  const Editor=(await import('@/components/editorWithTabs/editor.vue')).default
  const wrapper=shallowMount(Editor,{props:{markdown:'# Source',cursor:null,textDirection:'ltr',platform:'darwin'},attachTo:document.body,global:{plugins:[pinia,i18n]}})
  await flushPromises();await nextTick();const muya=instances.at(-1)
  return{wrapper,store,muya,route,exit}
}
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();instances.length=0})
it('routes current owned link activation with its document directory and rejects an old epoch',async()=>{
  const f=await mountLinkHost();try{
    const payload={linkInfo:{href:'target.md'},epoch:f.muya.linkInteraction.epoch}
    f.muya.events['link-activate'](payload)
    expect(f.route).toHaveBeenCalledExactlyOnceWith({data:{href:'target.md'},dirname:'/docs'})
    f.muya.linkInteraction.invalidate();f.muya.events['link-activate'](payload);expect(f.route).toHaveBeenCalledTimes(1)
  }finally{f.wrapper.unmount()}
})
it('path/lifetime/committed-close changes cannot authorize old link work',async()=>{
  const f=await mountLinkHost();try{
    const payload={linkInfo:{href:'target.md'},epoch:f.muya.linkInteraction.epoch}
    f.store.currentFile.pathname='/other/index.md';await nextTick();f.muya.events['link-activate'](payload);expect(f.route).not.toHaveBeenCalled()
    const fresh={...payload,epoch:f.muya.linkInteraction.epoch};f.store.documentWindowClosing=true;f.muya.events['link-activate'](fresh);expect(f.route).not.toHaveBeenCalled()
    f.store.documentWindowClosing=false;f.store.currentFile.documentToken='reopened';await nextTick();f.muya.events['link-activate'](fresh);expect(f.route).not.toHaveBeenCalled()
  }finally{f.wrapper.unmount()}
})
it('a preview link does not auto-exit while ordinary text retains the established exit gesture',async()=>{
  const f=await mountLinkHost(true);try{
    const anchor=document.createElement('a');anchor.href='target.md';anchor.textContent='target';f.muya.container.appendChild(anchor)
    anchor.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,detail:1}));expect(f.exit).not.toHaveBeenCalled();expect(f.store.currentFile.previewMode).toBe(true)
    const plain=document.createElement('p');plain.textContent='ordinary';f.muya.container.appendChild(plain);plain.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));expect(f.exit).toHaveBeenCalled()
  }finally{f.wrapper.unmount()}
})

it('restores cached nonempty history without a new cursor snapshot and keeps external reload behavior',async()=>{
  const f=await mountLinkHost();try{
    const history={stack:[{id:1,blocks:[]}],index:0}
    const spy=vi.spyOn(f.muya,'setMarkdown')
    const handler=bus.on.mock.calls.filter(c=>c[0]==='file-changed').at(-1)[1]
    handler({id:'link-owner',markdown:'# Source',history,renderCursor:true})
    expect(spy.mock.calls.at(-1)?.[5]).toEqual({renderOnly:true})
    handler({id:'link-owner',markdown:'# Source',history,renderCursor:true,contentReloaded:true})
    expect(spy.mock.calls.at(-1)?.[5]).toBeUndefined()
  }finally{f.wrapper.unmount()}
})
