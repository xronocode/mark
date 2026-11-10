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
    const request={requestId:'write',documentToken:'owner',id:'a',revision:2,sourcePath:'',targetPath:'/tmp/a.md',markdown:'fresh',ownedPaths:[]}
    vi.mocked(invoke).mockRejectedValueOnce(Error('command mt_document_write_snapshot not found'))
    await expect(ipcDocumentSave.writeSnapshot(request)).rejects.toThrow()
    expect(invoke).toHaveBeenCalledWith('mt_document_write_snapshot',{request})
  })
})
