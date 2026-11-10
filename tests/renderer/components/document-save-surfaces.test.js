import { shallowMount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { setupTestPinia } from '../pinia'
import { documentOwner, captureDocumentSnapshot } from '@/util/documentSnapshot'
const harness = vi.hoisted(() => ({ cm: null }))
vi.mock('@/bus', async () => ({default:(await import('mitt')).default()}))
vi.mock('@/codeMirror', () => ({
  default: vi.fn((container, config) => {
    const input = document.createElement('textarea'); container.appendChild(input)
    let text = config.value
    const cm = { on: vi.fn(), off: vi.fn(), getValue:()=>text, setValue:value=>{text=value}, setOption:vi.fn(),
      getCursor:()=>({line:0,ch:0}), getLine:()=>text, setSelection:vi.fn(),getInputField:()=>input,
      hasFocus:()=>false, execCommand:vi.fn(), getScrollInfo:()=>({left:0,top:0}), clearHistory:vi.fn() }
    harness.cm=cm; return cm
  }), setMode:vi.fn(), setCursorAtFirstLine:vi.fn(), setTextDirection:vi.fn()
}))
vi.mock('muya/lib/utils',()=>({debounce:fn=>fn,wordCount:()=>({word:0,character:0,paragraph:0})}))
vi.mock('@/config',()=>({oneDarkThemes:[],railscastsThemes:[]}))
const i18n=createI18n({legacy:false,locale:'en',messages:{en:{}}})
it('captures the actual mounted source buffer only after native composition finishes',async()=>{
  const pinia=setupTestPinia();const {useEditorStore}=await import('@/store/editor');const store=useEditorStore()
  store.currentFile={id:'source-owner',pathname:'/tmp/source.md',filename:'source.md',markdown:'old',isSaved:true,history:{stack:[],lastEditIndex:-1},trimTrailingNewline:3}
  store.tabs=[store.currentFile];store.updateTabIdToIndex();store.END_BOOT_PHASE()
  const Source=(await import('@/components/editorWithTabs/sourceCode.vue')).default
  const wrapper=shallowMount(Source,{props:{markdown:'old',textDirection:'ltr'},global:{plugins:[pinia,i18n]}})
  try {
    const owner=documentOwner(store.currentFile);const input=harness.cm.getInputField()
    input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));harness.cm.setValue('完成')
    expect(captureDocumentSnapshot(store,owner).status).toBe('composing');expect(store.currentFile.markdown).toBe('old')
    input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}))
    expect(captureDocumentSnapshot(store,owner).snapshot.markdown.trim()).toBe('完成');expect(store.currentFile.isSaved).toBe(false)
  } finally {wrapper.unmount()}
})
