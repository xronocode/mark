// FILE: tests/renderer/store/link-target-tabs.test.js
// START_MODULE_CONTRACT
//   PURPOSE: Verify link-arrival payloads reuse owned tabs without replacing dirty buffers or history.
//   SCOPE: Real NEW_TAB_WITH_CONTENT admission and concurrent/closed-window cases; native dispatch is tested in Rust.
//   DEPENDS: Pinia test setup, editor store, document factories.
//   LINKS: M-011; M-025; C-MD-LINK-TABS T-004.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   payload - existing document-open shape emitted by the backend.
//   fixture - editor with an original dirty source document.
// END_MODULE_MAP
import { describe, expect, it } from 'vitest'
import { setupTestPinia } from '../pinia'
const payload=(pathname,markdown='# Disk target\n')=>({pathname,filename:pathname.split('/').pop(),markdown,previewMode:false})
const fixture=async()=>{setupTestPinia();const {useEditorStore}=await import('@/store/editor');const store=useEditorStore();store.END_BOOT_PHASE();await store.NEW_TAB_WITH_CONTENT({markdownDocument:payload('/docs/index.md','# Source changes\n')});store.currentFile.isSaved=false;return store}
describe('owned link target tab admission',()=>{
  it('a new target opens without closing or cleaning the source',async()=>{
    const store=await fixture();const source=store.currentFile;await store.NEW_TAB_WITH_CONTENT({markdownDocument:payload('/docs/target.md')})
    expect(store.tabs).toHaveLength(2);expect(store.currentFile.pathname).toBe('/docs/target.md');expect(source.markdown).toBe('# Source changes\n');expect(source.isSaved).toBe(false)
  })
  it('a canonical target already open dirty retains its token, text and history',async()=>{
    const store=await fixture();const source=store.currentFile;await store.NEW_TAB_WITH_CONTENT({markdownDocument:payload('/docs/target.md')});const target=store.currentFile
    target.markdown='NEWER UNSAVED TEXT';target.isSaved=false;target.history={stack:[{id:7,blocks:[]}],index:0};const token=target.documentToken;const history=target.history
    store.UPDATE_CURRENT_FILE(source);await store.NEW_TAB_WITH_CONTENT({markdownDocument:payload('/docs/target.md','OLDER DISK TEXT')})
    expect(store.tabs).toHaveLength(2);expect(store.currentFile).toBe(target);expect(target.documentToken).toBe(token);expect(target.markdown).toBe('NEWER UNSAVED TEXT');expect(target.history).toBe(history);expect(target.isSaved).toBe(false)
  })
  it('rapid canonical/alias arrivals deduplicate after the awaited position load',async()=>{
    const store=await fixture();await Promise.all([store.NEW_TAB_WITH_CONTENT({markdownDocument:payload('/docs/target.md')}),store.NEW_TAB_WITH_CONTENT({markdownDocument:payload('/docs/target.md')})]);expect(store.tabs).toHaveLength(2);expect(store._opensInFlight).toBe(0)
  })
  it('committed window destruction refuses late tab admission',async()=>{
    const store=await fixture();const source=store.currentFile;store.documentWindowClosing=true;const result=await store.NEW_TAB_WITH_CONTENT({markdownDocument:payload('/docs/target.md')});expect(result).toBe(false);expect(store.tabs).toEqual([source]);expect(store.currentFile).toBe(source)
  })
})
