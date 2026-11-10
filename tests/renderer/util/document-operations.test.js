import { describe, it, expect, vi } from 'vitest'
import { captureDocumentFormat, applyDocumentFormat, recomputeDocumentSaved } from '@/util/documentFormat'
import { createDocumentOperations } from '@/util/documentOperations'
import { documentOwner, captureDocumentSnapshot, inspectDocumentComposition, registerDocumentSurface } from '@/util/documentSnapshot'
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b }); return {promise,resolve,reject} }
const make = (data = [{}]) => {
  const store = { tabs: data.map((t,i) => ({ id: String(i), filename: `${i}.md`, pathname: `/tmp/${i}.md`, markdown: 'original', encoding: { encoding: 'utf8', isBom: false }, lineEnding: 'lf', trimTrailingNewline: 3, isSaved: false, contentRevision: 1, ...t })) }
  for (const tab of store.tabs) { tab.savedMarkdown = tab.isSaved ? tab.markdown : 'previous'; tab.savedFormat = captureDocumentFormat(tab); tab.requiresExplicitSave = false }
  store.currentFile = store.tabs[0]
  const deps = {
    getTabs: () => store.tabs,
    capture: owner => captureDocumentSnapshot(store, owner), inspectComposition: inspectDocumentComposition,
    chooseTarget: vi.fn(async r => ({ requestId:r.requestId, documentToken:r.documentToken, pathname:'/tmp/chosen.md' })),
    writeSnapshot: vi.fn(async r => ({ ...r, pathname:r.targetPath, filename:'saved.md' })),
    confirm: vi.fn(async () => 'save'), notify: vi.fn(), prepareCommit: vi.fn(async () => {})
  }
  const ops = createDocumentOperations(deps)
  const commit = vi.fn()
  const run = (kind='close-all', extra={}) => ops.run({kind, owners:store.tabs.map(documentOwner), commit, ...extra})
  const edit = (tab=store.tabs[0]) => { tab.markdown += ' new'; tab.contentRevision++; tab.isSaved=false }
  return { store, deps, ops, commit, run, edit }
}
describe('document operation admission and final close barrier', () => {
  it('saves mixed dirty named/untitled and empty text in order without closing for Save All', async () => {
    const h=make([{}, {pathname:'',markdown:''}, {isSaved:true}])
    expect((await h.run('save-all')).status).toBe('completed')
    expect(h.deps.writeSnapshot.mock.calls.map(([r])=>r.markdown)).toEqual(['original',''])
    expect(h.deps.chooseTarget).toHaveBeenCalledTimes(1); expect(h.commit).not.toHaveBeenCalled()
  })
  it('collects text again after the confirmation and picker', async () => {
    const h=make([{pathname:''}]); const picker=deferred()
    h.deps.confirm.mockImplementation(async()=> {h.edit(); return 'save'})
    h.deps.chooseTarget.mockImplementation(r=>picker.promise.then(()=>({...r,pathname:'/tmp/fresh.md'})))
    const attempt=h.run(); await vi.waitFor(()=>expect(h.deps.chooseTarget).toHaveBeenCalled())
    h.edit(); picker.resolve()
    expect((await attempt).status).toBe('completed')
    expect(h.deps.writeSnapshot.mock.calls[0][0].markdown).toBe('original new new')
    expect(h.commit).toHaveBeenCalledTimes(1)
  })
  it('retains newer text and refuses close after a delayed write; an explicit retry is fresh', async () => {
    const h=make(); const write=deferred()
    h.deps.writeSnapshot.mockImplementationOnce(r=>write.promise.then(()=>({...r,pathname:r.targetPath})))
    const attempt=h.run(); await vi.waitFor(()=>expect(h.deps.writeSnapshot).toHaveBeenCalled())
    h.edit(); write.resolve()
    expect((await attempt).status).toBe('blocked'); expect(h.store.tabs[0].isSaved).toBe(false)
    expect(h.commit).not.toHaveBeenCalled()
    expect((await h.run()).status).toBe('completed')
    expect(h.deps.writeSnapshot.mock.calls[1][0].markdown).toBe('original new')
  })
  it.each(['cancel','reject','invalid'])('stops a batch on %s and closes no original target', async mode => {
    const h=make([{}, {pathname:''}, {}])
    if(mode==='cancel') h.deps.chooseTarget.mockResolvedValueOnce(null)
    if(mode==='reject') h.deps.writeSnapshot.mockImplementationOnce(async r=>({...r,pathname:r.targetPath})).mockRejectedValueOnce(Error('disk'))
    if(mode==='invalid') h.deps.writeSnapshot.mockImplementationOnce(async r=>({...r,pathname:r.targetPath})).mockResolvedValueOnce(undefined)
    const r=await h.run(); expect(r.status).not.toBe('completed'); expect(h.commit).not.toHaveBeenCalled()
    expect(h.store.tabs).toHaveLength(3); expect(h.store.tabs[0].isSaved).toBe(true)
    expect(h.deps.writeSnapshot.mock.calls.length).toBe(mode==='cancel'?1:2)
  })
  it('blocks repeated operations and older writes without losing their tracking', async () => {
    const h=make(); const write=deferred()
    h.deps.writeSnapshot.mockImplementationOnce(r=>write.promise.then(()=>({...r,pathname:r.targetPath})))
    const save=h.ops.save(documentOwner(h.store.tabs[0])); await vi.waitFor(()=>expect(h.deps.writeSnapshot).toHaveBeenCalled())
    expect((await h.run()).status).toBe('blocked'); expect((await h.ops.save(documentOwner(h.store.tabs[0]))).status).toBe('blocked')
    expect(h.deps.confirm).not.toHaveBeenCalled(); write.resolve(); await save
    expect((await h.run()).status).toBe('completed')
  })
  it('checks all clean-looking panes for IME before prompts or extraction', async () => {
    const h=make([{isSaved:true}]); let capture=0
    const stop=registerDocumentSurface(documentOwner(h.store.tabs[0]),{isComposing:()=>true,captureCommitted:()=>{capture++; return 'preedit'}})
    try {expect((await h.run()).status).toBe('blocked'); expect(capture).toBe(0);expect(h.deps.confirm).not.toHaveBeenCalled();expect(h.commit).not.toHaveBeenCalled()} finally {stop()}
  })
  it('rejects discard if the version changed while its confirmation was open', async () => {
    const h=make();h.deps.confirm.mockImplementation(async()=>{h.edit(); return 'discard'})
    expect((await h.run()).status).toBe('blocked'); expect(h.commit).not.toHaveBeenCalled()
  })
  it('new dirty documents and edits during preparation block global destruction', async () => {
    const h=make(); h.deps.prepareCommit.mockImplementation(async()=>h.store.tabs.push({id:'new',markdown:'new',isSaved:false}))
    expect((await h.run('quit')).status).toBe('blocked'); expect(h.commit).not.toHaveBeenCalled()
  })
  it('Close Others never sweeps a later unrelated tab into the original group', async () => {
    const h=make();h.deps.prepareCommit.mockImplementation(async()=>h.store.tabs.push({id:'new',markdown:'new',isSaved:false}))
    expect((await h.run('close-others')).status).toBe('completed')
    expect(h.commit.mock.calls[0][0].map(o=>o.id)).toEqual(['0'])
  })
  it('never applies a response to a reopened id or a changed source path', async () => {
    for (const reopen of [false,true]) {
      const h=make();h.deps.writeSnapshot.mockImplementation(async r=>{
        if(reopen) h.store.tabs=[{...h.store.tabs[0],documentToken:undefined,markdown:'reopened'}]
        else h.store.tabs[0].pathname='/tmp/moved.md'
        return {...r,pathname:r.targetPath}
      })
      expect((await h.run()).status).toBe('blocked');expect(h.store.tabs[0].isSaved).toBe(false);expect(h.commit).not.toHaveBeenCalled()
    }
  })
})

it('path transitions reserve the same lifetime until their real completion',async()=>{
  const h=make();const owner=documentOwner(h.store.tabs[0]);const release=h.ops.reservePathChange([owner])
  expect(typeof release).toBe('function')
  expect((await h.run()).status).toBe('blocked')
  expect((await h.ops.save(owner)).status).toBe('blocked')
  expect(h.deps.writeSnapshot).not.toHaveBeenCalled();release()
  expect((await h.run()).status).toBe('completed')
})
it('new text after a discard decision invalidates the final commit',async()=>{
  const h=make();h.deps.confirm.mockResolvedValue('discard');h.deps.prepareCommit.mockImplementation(async()=>h.edit())
  expect((await h.run()).status).toBe('blocked');expect(h.commit).not.toHaveBeenCalled()
})
it('a live owned destination collision is rejected before writing or evicting either buffer',async()=>{
  const h=make([{pathname:''},{pathname:'/tmp/chosen.md'}])
  expect((await h.ops.save(documentOwner(h.store.tabs[0]),{saveAs:true})).status).toBe('blocked')
  expect(h.store.tabs).toHaveLength(2);expect(h.deps.writeSnapshot).not.toHaveBeenCalled()
})
it('composition beginning during a picker blocks the write without capturing preedit',async()=>{
  const h=make([{pathname:''}]);let composing=false;let captured=0
  const stop=registerDocumentSurface(documentOwner(h.store.tabs[0]),{isComposing:()=>composing,captureCommitted:()=>{captured++;return h.store.tabs[0].markdown}})
  h.deps.chooseTarget.mockImplementation(async r=>{composing=true;return {...r,pathname:'/tmp/chosen.md'}})
  try {expect((await h.ops.save(documentOwner(h.store.tabs[0]))).status).toBe('blocked');expect(captured).toBe(1);expect(h.deps.writeSnapshot).not.toHaveBeenCalled()}finally{stop()}
})

it('a malformed picker reply fails visibly without writing or adopting another destination',async()=>{
  const h=make([{pathname:'/tmp/old.md',isSaved:true}]);h.deps.chooseTarget.mockResolvedValue({pathname:'/tmp/unowned.md'})
  expect((await h.ops.save(documentOwner(h.store.tabs[0]),{saveAs:true})).status).toBe('failed')
  expect(h.store.tabs[0].pathname).toBe('/tmp/old.md');expect(h.deps.writeSnapshot).not.toHaveBeenCalled();expect(h.deps.notify).toHaveBeenCalled()
})
it('an explicit attempt for an already replaced lifetime cannot write the reopened document',async()=>{
  const h=make();const owner=documentOwner(h.store.tabs[0]);h.store.tabs=[{id:'0',pathname:'/tmp/0.md',markdown:'reopened',isSaved:false}]
  expect((await h.ops.save(owner)).status).toBe('blocked');expect(h.deps.writeSnapshot).not.toHaveBeenCalled();expect(h.store.tabs[0].markdown).toBe('reopened')
})

it('canonical destination conflicts returned by Rust explain the owned-path refusal',async()=>{
  const h=make([{pathname:''}]);h.deps.writeSnapshot.mockRejectedValueOnce(Error('MT_DOCUMENT_DESTINATION_OWNED'))
  const outcome=await h.ops.save(documentOwner(h.store.tabs[0]))
  expect(outcome).toMatchObject({status:'blocked',reason:'collision'})
  expect(h.store.tabs[0].pathname).toBe('');expect(h.store.tabs[0].isSaved).toBe(false)
})

it.each([{ encoding: 'cp1251' }, { isBom: true }, { lineEnding: 'crlf' }, { finalNewline: 1 }])('retains a post-dispatch format change until explicit fresh retry: %j', async patch => {
  const h = make(); const write = deferred(); const tab = h.store.tabs[0]
  h.deps.writeSnapshot.mockImplementationOnce(r => write.promise.then(() => ({ ...r, pathname: r.targetPath })))
  const attempt = h.run(); await vi.waitFor(() => expect(h.deps.writeSnapshot).toHaveBeenCalled())
  const dispatched = h.deps.writeSnapshot.mock.calls[0][0]
  applyDocumentFormat(tab, patch); write.resolve()
  expect((await attempt).status).toBe('blocked'); expect(tab.isSaved).toBe(false); expect(h.commit).not.toHaveBeenCalled()
  expect(dispatched.format).toEqual({ encoding: 'utf8', isBom: false, lineEnding: 'lf', finalNewline: 3 })
  expect(tab.savedFormat).toEqual(dispatched.format); expect(tab.requiresExplicitSave).toBe(true)
  expect((await h.run()).status).toBe('completed')
  expect(h.deps.writeSnapshot.mock.calls[1][0].format).toEqual(captureDocumentFormat(tab))
  expect(tab.requiresExplicitSave).toBe(false); expect(tab.isSaved).toBe(true)
})
it('changed-then-reverted format remains dirty after stale ACK and later reconciliation', async () => {
  const h = make(); const tab = h.store.tabs[0]; const write = deferred()
  h.deps.writeSnapshot.mockImplementationOnce(r => write.promise.then(() => ({ ...r, pathname: r.targetPath })))
  const attempt = h.run(); await vi.waitFor(() => expect(h.deps.writeSnapshot).toHaveBeenCalled())
  applyDocumentFormat(tab, { isBom: true }); applyDocumentFormat(tab, { isBom: false }); write.resolve()
  expect((await attempt).status).toBe('blocked')
  expect(recomputeDocumentSaved(tab)).toBe(false); expect(tab.requiresExplicitSave).toBe(true)
  expect((await h.run()).status).toBe('completed'); expect(recomputeDocumentSaved(tab)).toBe(true)
})
it('Save All includes format-only dirty tabs and captures picker-time policies', async () => {
  const h = make([{ isSaved: true }, { isSaved: true }]); const tab = h.store.tabs[0]
  applyDocumentFormat(tab, { lineEnding: 'crlf' })
  expect((await h.run('save-all')).status).toBe('completed')
  expect(h.deps.writeSnapshot).toHaveBeenCalledTimes(1); expect(tab.savedFormat.lineEnding).toBe('crlf')
  const h2 = make([{ pathname: '' }]); h2.deps.chooseTarget.mockImplementation(async r => {
    applyDocumentFormat(h2.store.tabs[0], { finalNewline: 0 }); return { ...r, pathname: '/tmp/fresh-policy.md' }
  })
  expect((await h2.run()).status).toBe('completed')
  expect(h2.deps.writeSnapshot.mock.calls[0][0].format.finalNewline).toBe(0)
})
it.each(['missing', 'mismatch'])('rejects %s format ACK before path or checkpoint mutation', async mode => {
  const h = make([{ pathname: '' }]); const tab = h.store.tabs[0]
  h.deps.writeSnapshot.mockImplementationOnce(async r => ({ ...r, pathname: r.targetPath, format: mode === 'missing' ? undefined : { ...r.format, isBom: true } }))
  expect((await h.run()).status).toBe('failed'); expect(tab.pathname).toBe(''); expect(tab.savedMarkdown).toBe('previous')
  expect(tab.isSaved).toBe(false); expect(h.commit).not.toHaveBeenCalled()
})
it('Save As adopts its destination while retaining a newer format and requiring explicit retry', async () => {
  const h = make([{ isSaved: true }]); const tab = h.store.tabs[0]; const write = deferred()
  h.deps.writeSnapshot.mockImplementationOnce(r => write.promise.then(() => ({ ...r, pathname: r.targetPath })))
  const attempt = h.ops.save(documentOwner(tab), { saveAs: true })
  await vi.waitFor(() => expect(h.deps.writeSnapshot).toHaveBeenCalled())
  applyDocumentFormat(tab, { lineEnding: 'crlf' }); write.resolve()
  expect((await attempt).status).toBe('blocked'); expect(tab.pathname).toBe('/tmp/chosen.md')
  expect(tab.lineEnding).toBe('crlf'); expect(tab.savedFormat.lineEnding).toBe('lf'); expect(tab.requiresExplicitSave).toBe(true)
  expect((await h.ops.save(documentOwner(tab))).status).toBe('completed')
  expect(h.deps.chooseTarget).toHaveBeenCalledTimes(1); expect(tab.isSaved).toBe(true)
})
it('a text change and reversion during write cannot clear the stale-ACK retry obligation', async () => {
  const h = make(); const tab = h.store.tabs[0]; const write = deferred()
  h.deps.writeSnapshot.mockImplementationOnce(r => write.promise.then(() => ({ ...r, pathname: r.targetPath })))
  const attempt = h.run(); await vi.waitFor(() => expect(h.deps.writeSnapshot).toHaveBeenCalled())
  const original = tab.markdown; h.edit(); tab.markdown = original; tab.contentRevision++; write.resolve()
  expect((await attempt).status).toBe('blocked'); expect(recomputeDocumentSaved(tab)).toBe(false)
  expect(tab.savedMarkdown).toBe(original); expect(tab.requiresExplicitSave).toBe(true); expect(h.commit).not.toHaveBeenCalled()
})
it('an encoding refusal remains an error reason with no path adoption or checkpoint', async () => {
  const h = make([{ pathname: '' }]); h.deps.writeSnapshot.mockRejectedValueOnce(Error('MT_ENC_UNREPRESENTABLE'))
  expect(await h.ops.save(documentOwner(h.store.tabs[0]))).toMatchObject({ status: 'failed', reason: 'MT_ENC_UNREPRESENTABLE' })
  expect(h.store.tabs[0].pathname).toBe(''); expect(h.store.tabs[0].savedMarkdown).toBe('previous')
})
it.each([{ encoding:'cp1251' },{ isBom:true },{ lineEnding:'crlf' },{ finalNewline:1 }])('captures picker-time policy changes and fences discard confirmation: %j', async patch => {
  const h = make([{ pathname:'' }]); h.deps.chooseTarget.mockImplementation(async r => {
    applyDocumentFormat(h.store.tabs[0],patch); return { ...r,pathname:'/tmp/picker-format.md' }
  })
  expect((await h.run()).status).toBe('completed')
  expect(h.deps.writeSnapshot.mock.calls[0][0].format).toEqual(captureDocumentFormat(h.store.tabs[0]))
  const h2 = make(); h2.deps.confirm.mockImplementation(async () => { applyDocumentFormat(h2.store.tabs[0],patch); return 'discard' })
  expect((await h2.run()).status).toBe('blocked'); expect(h2.commit).not.toHaveBeenCalled(); expect(h2.deps.writeSnapshot).not.toHaveBeenCalled()
})
