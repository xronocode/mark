import { describe, it, expect, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { ipcDocumentSave } from '@/ipc/runtime/documentSave'
describe('registered document save wire',()=>{
  it('dispatches destination selection without text and preserves cancellation',async()=>{
    vi.mocked(invoke).mockResolvedValueOnce(null)
    const request={requestId:'pick',documentToken:'owner',filename:'a.md',defaultPath:null}
    expect(await ipcDocumentSave.chooseTarget(request)).toBeNull()
    expect(invoke).toHaveBeenCalledWith('mt_document_choose_save_target',{request})
  })
  it('writes the exact correlated payload and surfaces missing registration as failure',async()=>{
    const request={requestId:'write',documentToken:'owner',id:'a',revision:2,sourcePath:'',targetPath:'/tmp/a.md',markdown:'fresh',format:{encoding:'utf8',isBom:false,lineEnding:'lf' as const,finalNewline:3 as const},ownedPaths:[]}
    vi.mocked(invoke).mockRejectedValueOnce(Error('command mt_document_write_snapshot not found'))
    await expect(ipcDocumentSave.writeSnapshot(request)).rejects.toThrow()
    expect(invoke).toHaveBeenCalledWith('mt_document_write_snapshot',{request})
  })
})

it('defensively copies the complete format and rejects invalid policy before invoke', async () => {
  const request = { requestId: 'write', documentToken: 'owner', id: 'a', revision: 2, sourcePath: '', targetPath: '/tmp/a.md', markdown: 'A', format: { encoding: 'utf8', isBom: false, lineEnding: 'lf' as const, finalNewline: 3 as const }, ownedPaths: [] }
  vi.mocked(invoke).mockResolvedValueOnce({ ...request, pathname: request.targetPath, filename: 'a.md' })
  await ipcDocumentSave.writeSnapshot(request)
  const args = vi.mocked(invoke).mock.calls.at(-1)![1] as { request: typeof request }
  expect(args.request.format).toEqual(request.format); expect(args.request.format).not.toBe(request.format)
  vi.mocked(invoke).mockClear()
  await expect(async () => ipcDocumentSave.writeSnapshot({ ...request, format: { ...request.format, encoding: 'gb2312' } })).rejects.toThrow('MT_ENC_UNSUPPORTED')
  expect(invoke).not.toHaveBeenCalled()
})
