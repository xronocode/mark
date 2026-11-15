// FILE: tests/tools/run-rust-tests.test.mjs
// START_MODULE_CONTRACT
//   PURPOSE: Prove CI Rust test executable ownership, actual child lifecycle and failure cleanup.
//   SCOPE: Synthetic Cargo orchestration and real temporary executable children; no Rust/app build or production paths.
//   DEPENDS: Vitest, Node built-ins and tools/run-rust-tests.mjs.
//   LINKS: M-046; V-M-046; C-CI-RUST-TEST-ARTIFACT-LIFECYCLE-EXECVE.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   helper - Current production lifecycle entry point.
//   fixtures - Temporary owned roots always disposed after each case.
//   fixture - Synthetic two-target Cargo and native Node executable copies.
//   waitUntil - Bound waits for observed real child evidence.
//   receipts - Read exact run evidence outside the synthetic target cache.
//   stopped - Assert the recorded native child no longer exists.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-15 C-CI-RUST-TEST-ARTIFACT-LIFECYCLE-EXECVE: actual synthetic process/filesystem fault coverage.
// END_CHANGE_SUMMARY
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { runRustTests, runExecutable, cleanupFiles, validateRuntime } from '../../tools/run-rust-tests.mjs'

const helper = resolve('tools/run-rust-tests.mjs')
const fixtures = []
afterEach(async () => {
  for (const f of fixtures.splice(0)) {
    f.signals.emit('SIGTERM')
    for (const child of f.external) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    await Promise.allSettled([...f.pending])
    const records = receipts(f.root)
    for (const row of records) if (row.nativePid) stopped(row.nativePid)
    fs.rmSync(f.root, { recursive: true, force: true })
    const evidence = { fixture: f.root, source: f.source, records, externalPids: f.external.map(child => child.pid),
      artifactAvailable: false, fixtureRemoved: !fs.existsSync(f.root), ownedProcessesReaped: f.external.every(child => child.exitCode !== null || child.signalCode !== null) }
    if (process.env.MARK_RUST_TEST_EVIDENCE_ROOT) {
      fs.mkdirSync(process.env.MARK_RUST_TEST_EVIDENCE_ROOT, { recursive: true })
      fs.appendFileSync(join(process.env.MARK_RUST_TEST_EVIDENCE_ROOT, 'synthetic-child-receipts.jsonl'), `${JSON.stringify(evidence)}\n`)
    } else console.log(`[RustTestLifecycleFixture] ${JSON.stringify(evidence)}`)
  }
})

const fixture = (mode = 'success', { count = 2 } = {}) => {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'mark-rust-lifecycle-fixture-')))
  const target = join(root, 'target'), directory = join(target, 'debug', 'deps')
  fs.mkdirSync(directory, { recursive: true })
  // Homebrew Node uses an executable-relative libnode rpath. Keep this
  // fixture dependency linked to the unchanged installed tool, never copied.
  if (process.platform === 'darwin') {
    const lib = join(dirname(process.execPath), '..', 'lib')
    for (const name of fs.readdirSync(lib).filter(name => /^libnode.*\.dylib$/.test(name))) fs.symlinkSync(join(lib, name), join(directory, name))
  }
  const proof = join(root, 'child-proof.jsonl'), cargoProof = join(root, 'cargo-proof.json')
  const script = join(root, 'child.mjs'), cargoScript = join(root, 'cargo.mjs')
  const suffix = process.platform === 'win32' ? '.exe' : ''
  const paths = ['first', 'second'].slice(0, count).map(name => join(directory, `${name}-0123456789abcdef${suffix}`))
  const source = { revision: 'synthetic-current-source', helperSha256: createHash('sha256').update(fs.readFileSync(helper)).digest('hex') }
  fs.writeFileSync(script, `
    import*as fs from'node:fs';import{dirname,join}from'node:path';
    const control=JSON.parse(fs.readFileSync(process.env.MARK_RUST_TEST_STATE,'utf8'));
    const records=fs.readdirSync(control.directory).filter(n=>/^runner-.*\\.json$/.test(n)).map(n=>JSON.parse(fs.readFileSync(join(control.directory,n),'utf8')));
    const own=records.find(r=>r.nativePid===process.pid);
    if(!own||own.source.revision!==${JSON.stringify(source.revision)}||!own.sha256)process.exit(98);
    const mode=${JSON.stringify(mode)};
    if(mode==='ordinary-brace-output')console.log('{ordinary test diagnostic}');
    if(mode==='child-failure')process.exitCode=7;
    if(mode==='wait'||mode==='ignore-signals'){
      setInterval(()=>{},100);
      for(const signal of['SIGINT','SIGTERM'])process.on(signal,()=>{if(mode==='wait')process.exit(0)});
    }
    fs.appendFileSync(${JSON.stringify(proof)},JSON.stringify({pid:process.pid,beforeExecRecorded:true,cwd:process.cwd(),args:process.argv.slice(2),marker:process.env.FIXTURE_RUNTIME_ENV,dynamic:process.env.DYLD_FALLBACK_LIBRARY_PATH,receipt:own})+'\\n');
    console.log('synthetic child started');
  `)
  fs.writeFileSync(cargoScript, `
    import*as fs from'node:fs';import{spawn}from'node:child_process';import{dirname,join}from'node:path';
    const args=process.argv.slice(2),config=args[args.indexOf('--config')+1];
    const runner=JSON.parse(config.slice(config.indexOf('=')+1));
    fs.writeFileSync(${JSON.stringify(cargoProof)},JSON.stringify({pid:process.pid,cwd:process.cwd(),args,runner,marker:process.env.FIXTURE_RUNTIME_ENV}));
    const mode=${JSON.stringify(mode)};
    const original=args.slice(args.indexOf('test')+1).filter(a=>!a.startsWith('--message-format'));
    const harnessArgs=original[0]==='--bin'?[]:original;
    if(mode==='compile-pending'){
      const path=${JSON.stringify(paths[0])};fs.copyFileSync(process.execPath,path,fs.constants.COPYFILE_FICLONE);fs.chmodSync(path,0o755);
      const ticker=setInterval(()=>console.log('synthetic compiler still running'),5);
      await new Promise(done=>setTimeout(done,8000));clearInterval(ticker);process.exit(0);
    }
    if(mode==='chatty'){
      const path=${JSON.stringify(paths[1] || paths[0])};fs.copyFileSync(process.execPath,path,fs.constants.COPYFILE_FICLONE);fs.chmodSync(path,0o755);
      console.log(JSON.stringify({reason:'compiler-artifact',package_id:'workspace',profile:{test:false},target:{name:'second',kind:['bin']},executable:path}));
    }
    for(const path of ${JSON.stringify(paths)}){
      if(!fs.existsSync(path))fs.copyFileSync(process.execPath,path,fs.constants.COPYFILE_FICLONE);fs.chmodSync(path,0o755);
      if(mode==='changed-output-failure'){fs.appendFileSync(path,Buffer.of(0));process.exit(2)};
      if(mode==='missing-metadata')process.exit(2);
      if(mode==='truncated-metadata'){process.stdout.write('{"reason":"compiler-artifact"');process.exit(0)};
      const executable=mode==='outside-metadata'?${JSON.stringify(join(root, 'outside'))}:mode==='dependency-metadata'?${JSON.stringify(join(directory, 'libfirst.rlib'))}:mode==='linked-parent-metadata'?${JSON.stringify(join(target, 'linked-parent', basename(paths[0])))}:path;
      console.log(JSON.stringify({reason:'compiler-artifact',package_id:'workspace',profile:{test:mode!=='normal-output-failure'},target:{name:path.includes('first')?'first':'second',kind:['bin']},executable}));
      if(mode==='compile-failure'||mode==='normal-output-failure')process.exit(101);
      if(mode==='corrupt-runner-receipt'){fs.writeFileSync(join(dirname(process.env.MARK_RUST_TEST_STATE),'runner-corrupt.json'),'{');process.exit(0)};
      if(mode==='inaccessible-runner-evidence')process.exit(0);
      const status=await new Promise((done,fail)=>{
        const child=spawn(runner[0],[...runner.slice(1),path,${JSON.stringify(script)},...harnessArgs],{stdio:'inherit',env:process.env});
        child.once('error',fail);child.once('close',code=>done(code));
      });
      if(status!==0)process.exit(101);
    }
  `)
  const context = () => ({ target, triple: 'synthetic-host', packageIds: ['workspace'], names: ['first', 'second'] })
  const signals = new EventEmitter()
  const options = { args: [], cwd: root, context, identity: () => source, cargo: process.execPath, cargoPrefix: [cargoScript],
    environment: { ...process.env, FIXTURE_RUNTIME_ENV: 'preserved-cargo-environment', DYLD_FALLBACK_LIBRARY_PATH: 'synthetic-preserved-dynamic-search', RUNNER_TEMP: root },
    output() {}, errorOutput(bytes) { process.stderr.write(bytes) }, signals, graceMs: 150 }
  const pending = new Set()
  const external = []
  const run = (overrides = {}) => {
    const operation = runRustTests({ ...options, ...overrides })
    pending.add(operation)
    operation.finally(() => pending.delete(operation)).catch(() => {})
    return operation
  }
  const value = { root, target, directory, paths, proof, cargoProof, source, signals, options, pending, external, run }
  fixtures.push(value)
  return value
}

const waitUntil = async predicate => {
  const deadline = Date.now() + 2500
  while (!predicate()) {
    if (Date.now() > deadline) throw Error('synthetic child watchdog')
    await new Promise(done => setTimeout(done, 10))
  }
}
const receipts = root => fs.readdirSync(root).filter(name => name.startsWith('mark-rust-tests-')).flatMap(name => {
  const directory = join(root, name)
  return fs.readdirSync(directory).filter(file => /^runner-.*\.json$/.test(file)).map(file => { try { return JSON.parse(fs.readFileSync(join(directory, file), 'utf8')) } catch { return { malformed: true, file } } })
})
const stopped = pid => {
  expect(() => process.kill(pid, 0)).toThrow()
}

describe('Cargo-preserving parent and actual executable runner', () => {
  it('preserves successful child output beginning with an ordinary brace', async () => {
    const f = fixture('ordinary-brace-output')
    const result = await f.run()
    expect(result.status).toBe(0)
    expect(fs.readFileSync(join(result.state.directory, 'cargo.stdout'), 'utf8')).toContain('{ordinary test diagnostic}')
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
  })
  it('runs every synthetic default target with durable before-exec source/digest/PID evidence and cleans them', async () => {
    const f = fixture()
    const result = await f.run()
    expect(result.status).toBe(0)
    const proof = fs.readFileSync(f.proof, 'utf8').trim().split('\n').map(JSON.parse)
    expect(proof).toHaveLength(2)
    for (const row of proof) {
      expect(row.beforeExecRecorded).toBe(true)
      expect(row.receipt.path).toBe(f.paths[proof.indexOf(row)])
      expect(row.receipt.source).toEqual(f.source)
      expect(row.marker).toBe('preserved-cargo-environment')
      expect(row.dynamic).toBe('synthetic-preserved-dynamic-search')
      expect(row.cwd).toBe(f.root)
      expect(row.args).toEqual([])
      stopped(row.pid)
    }
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
    expect(receipts(f.root).every(row => row.stopped && !row.available && row.result.reaped)).toBe(true)
  })

  it.each([{ args: [] }, { args: ['--bin', 'mark'] }, { args: ['embedded_fixture_parses_and_matches_registered'] }])('preserves original arguments/cwd and lets Cargo supply harness arguments: %j', async ({ args }) => {
    const f = fixture()
    expect((await f.run({ args })).status).toBe(0)
    const cargo = JSON.parse(fs.readFileSync(f.cargoProof, 'utf8'))
    expect(cargo.args.slice(cargo.args.indexOf('test') + 1)).toEqual([...args, '--message-format=json'])
    expect(cargo.cwd).toBe(f.root)
    const proof = fs.readFileSync(f.proof, 'utf8').trim().split('\n').map(JSON.parse)
    expect(proof.every(row => JSON.stringify(row.args) === JSON.stringify(args[0] === '--bin' ? [] : args))).toBe(true)
  })

  it('preserves Cargo failure status after a real failing child and still reaps/deletes it', async () => {
    const f = fixture('child-failure')
    const result = await f.run()
    expect(result.status).toBe(101)
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
    const rows = receipts(f.root)
    expect(rows).toHaveLength(1)
    stopped(rows[0].nativePid)
    expect(rows[0].result.status).toBe(7)
  })

  it.each(['compile-failure', 'normal-output-failure', 'missing-metadata', 'truncated-metadata'])('cleans created project outputs after %s while preserving unrelated caches', async mode => {
    const f = fixture(mode)
    const preserved = [join(f.directory, 'unrelated-0123456789abcdef'), join(f.directory, 'first-0123456789abcdef.rlib'), join(f.directory, 'libfirst.rmeta'), join(f.target, 'dependency.dylib')]
    for (const path of preserved) fs.writeFileSync(path, 'unrelated-cache-bytes')
    if (mode === 'truncated-metadata') await expect(f.run()).rejects.toThrow()
    else expect((await f.run()).status).toBe(mode === 'missing-metadata' ? 2 : 101)
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
    expect(preserved.map(path => fs.readFileSync(path, 'utf8'))).toEqual(preserved.map(() => 'unrelated-cache-bytes'))
  })

  it.each(['SIGINT', 'SIGTERM'])('handles %s cancellation and reaps/deletes the exact child', async signal => {
    const f = fixture('wait')
    const running = f.run()
    await waitUntil(() => fs.existsSync(f.proof))
    f.signals.emit(signal)
    expect((await running).status).toBe(signal === 'SIGINT' ? 130 : 143)
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
    const row = receipts(f.root)[0]
    stopped(row.nativePid)
    expect(row.stopped).toBe(true)
    expect(row.result.cancelled).toBe(true)
    if (process.platform === 'win32') expect(row.result.signal).toBe('SIGTERM')
    else expect(row.result.status).toBe(0) // The installed handler exits cooperatively.
  })

  it('escalates only its own unresponsive child, awaits close and deletes it', async () => {
    const f = fixture('ignore-signals')
    const running = f.run()
    await waitUntil(() => fs.existsSync(f.proof))
    f.signals.emit('SIGTERM')
    expect((await running).status).toBe(143)
    const row = receipts(f.root)[0]
    stopped(row.nativePid)
    expect(row.result.signal).toBe(process.platform === 'win32' ? 'SIGTERM' : 'SIGKILL')
    expect(fs.existsSync(row.path)).toBe(false)
  })

  it('catches parent output log failure, stops active runners and recovers owned artifact cleanup', async () => {
    const f = fixture('wait')
    await expect(f.run({ log() { throw Error('injected stdout log failure') } })).rejects.toThrow('injected stdout log failure')
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
    for (const row of receipts(f.root)) if (row.nativePid) stopped(row.nativePid)
  })

  it('deletes a selected cached harness while preserving unrelated preexisting output', async () => {
    const f = fixture()
    fs.copyFileSync(process.execPath, f.paths[0])
    const unrelated = join(f.directory, 'other-project-0123456789abcdef')
    fs.copyFileSync(process.execPath, unrelated)
    const original = createHash('sha256').update(fs.readFileSync(unrelated)).digest('hex')
    expect((await f.run()).status).toBe(0)
    expect(fs.existsSync(f.paths[0])).toBe(false)
    expect(createHash('sha256').update(fs.readFileSync(unrelated)).digest('hex')).toBe(original)
  })
})

describe('runner evidence and exact filesystem failures', () => {
  it('fails closed before Cargo context/build on an unsupported POSIX Node runtime', async () => {
    const f = fixture()
    let queried = false
    await expect(f.run({
      runtime() { validateRuntime({ platform: 'darwin', version: '22.14.0', execve: undefined }) },
      context() { queried = true; return f.options.context() }
    })).rejects.toThrow('requires-Node22')
    expect(queried).toBe(false)
    expect(fs.existsSync(f.cargoProof)).toBe(false)
    expect(() => validateRuntime({ platform: 'win32', version: '22.0.0', execve: undefined })).not.toThrow()
  })

  it('preserves an in-target dependency file falsely named by workspace compiler metadata', async () => {
    const f = fixture('dependency-metadata')
    const dependency = join(f.directory, 'libfirst.rlib')
    fs.writeFileSync(dependency, 'preserve-dependency-object')
    const failure = await f.run().then(() => null, error => error)
    expect(fs.readFileSync(dependency, 'utf8')).toBe('preserve-dependency-object')
    expect(failure?.message).toContain('not-workspace-executable')
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
  })

  it('rejects a linked parent directory and preserves its outside executable', async () => {
    const f = fixture('linked-parent-metadata')
    const outside = join(f.root, 'outside-directory')
    fs.mkdirSync(outside)
    const binary = join(outside, basename(f.paths[0]))
    fs.copyFileSync(process.execPath, binary)
    const digest = createHash('sha256').update(fs.readFileSync(binary)).digest('hex')
    fs.symlinkSync(outside, join(f.target, 'linked-parent'), 'junction')
    await expect(f.run()).rejects.toThrow('unsafe-artifact')
    expect(createHash('sha256').update(fs.readFileSync(binary)).digest('hex')).toBe(digest)
    expect(fs.lstatSync(join(f.target, 'linked-parent')).isSymbolicLink()).toBe(true)
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
  })

  it('cleans changed baseline project output after metadata is lost', async () => {
    const f = fixture('changed-output-failure')
    fs.copyFileSync(process.execPath, f.paths[0]); fs.chmodSync(f.paths[0], 0o755)
    expect((await f.run()).status).toBe(2)
    expect(fs.existsSync(f.paths[0])).toBe(false)
  })

  it.each(['chatty', 'compile-pending'])('catches asynchronous real CLI output EPIPE during %s and reaps/cleans owned outputs', async mode => {
    const f = fixture(mode)
    const driver = join(f.root, 'driver.mjs'), failurePath = join(f.root, 'driver-error.txt')
    fs.appendFileSync(join(f.root, 'child.mjs'), "\nif (mode === 'chatty') setInterval(() => console.log('owned synthetic output'), 5)\n")
    fs.writeFileSync(driver, `
      import{runRustTests}from ${JSON.stringify(pathToFileURL(helper).href)};import*as fs from'node:fs';
      try{const result=await runRustTests({cwd:${JSON.stringify(f.root)},args:[],
        identity:()=>(${JSON.stringify(f.source)}),context:()=>(${JSON.stringify(f.options.context())}),
        cargo:process.execPath,cargoPrefix:[${JSON.stringify(join(f.root, 'cargo.mjs'))}],environment:{...process.env,RUNNER_TEMP:${JSON.stringify(f.root)}}});process.exitCode=result.status}
      catch(error){fs.writeFileSync(${JSON.stringify(failurePath)},error.message);process.exitCode=1}
    `)
    const child = spawn(process.execPath, [driver], { stdio: ['ignore', 'pipe', 'pipe'] })
    f.external.push(child)
    child.stderr.resume()
    const closed = new Promise((done, reject) => { child.once('close', done); child.once('error', reject) })
    f.pending.add(closed); closed.finally(() => f.pending.delete(closed)).catch(() => {})
    await waitUntil(() => mode === 'chatty' ? fs.existsSync(f.proof) : fs.existsSync(f.cargoProof) && fs.existsSync(f.paths[0]))
    const interrupted = Date.now()
    child.stdout.destroy()
    expect(await closed).toBe(1)
    expect(Date.now() - interrupted).toBeLessThan(2500)
    expect(fs.readFileSync(failurePath, 'utf8')).toMatch(/EPIPE|broken pipe/i)
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
    for (const row of receipts(f.root)) if (row.nativePid) stopped(row.nativePid)
    const cargo = JSON.parse(fs.readFileSync(f.cargoProof, 'utf8'))
    stopped(cargo.pid)
  })

  it.each(['corrupt-runner-receipt', 'inaccessible-runner-evidence'])('still cleans real created output when %s breaks runner evidence', async mode => {
    const f = fixture(mode)
    let failure
    try { await f.run(mode === 'inaccessible-runner-evidence' ? { observe() { throw Object.assign(Error('injected directory EACCES'), { code: 'EACCES' }) } } : {}) } catch (error) { failure = error }
    finally {
      for (const name of fs.readdirSync(f.root).filter(name => name.startsWith('mark-rust-tests-'))) fs.chmodSync(join(f.root, name), 0o700)
    }
    expect(failure).toBeTruthy()
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
    expect(f.signals.listenerCount('SIGINT')).toBe(0)
    expect(f.signals.listenerCount('SIGTERM')).toBe(0)
  })

  it('reports inaccessible owned paths as unknown rather than deleted', () => {
    const f = fixture()
    fs.copyFileSync(process.execPath, f.paths[0])
    const item = { path: f.paths[0], available: true, sha256: createHash('sha256').update(fs.readFileSync(f.paths[0])).digest('hex') }
    const errors = []
    try {
      fs.chmodSync(f.directory, 0o000)
      cleanupFiles(f.target, [item], errors, undefined, () => { throw Object.assign(Error('injected inaccessible owned path'), { code: 'EACCES' }) })
    } finally { fs.chmodSync(f.directory, 0o700) }
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(f.paths[0])
    expect(item.available).toBe(true)
    expect(fs.existsSync(f.paths[0])).toBe(true)
  })

  it.each([1, 2])('reaps/deletes after runner receipt write failure at write%s', async failAt => {
    const f = fixture('wait', { count: 1 })
    fs.copyFileSync(process.execPath, f.paths[0]); fs.chmodSync(f.paths[0], 0o755)
    const directory = join(f.root, 'direct'); fs.mkdirSync(directory)
    const statePath = join(directory, 'state.json')
    fs.writeFileSync(statePath, JSON.stringify({ target: f.target, names: ['first', 'second'], directory, identity: 'direct-fixture', source: f.source, parentPid: process.pid }))
    let writes = 0
    await expect(runExecutable({ statePath, args: [f.paths[0], join(f.root, 'child.mjs')], cwd: f.root, env: { ...process.env, MARK_RUST_TEST_STATE: statePath }, graceMs: 150,
      write(path, value) { if (++writes === failAt) throw Error('injected runner evidence failure'); fs.writeFileSync(path, JSON.stringify(value)) }
    })).rejects.toThrow('injected runner evidence failure')
    expect(fs.existsSync(f.paths[0])).toBe(false)
    const rows = fs.readdirSync(directory).filter(name => name.startsWith('runner-')).map(name => JSON.parse(fs.readFileSync(join(directory, name), 'utf8')))
    for (const row of rows) if (row.nativePid) stopped(row.nativePid)
    if (process.platform !== 'win32') expect(fs.existsSync(f.proof)).toBe(false)
  })

  it('fails closed on outside compiler metadata and preserves the unrelated executable', async () => {
    const f = fixture('outside-metadata')
    const outside = join(f.root, 'outside'); fs.copyFileSync(process.execPath, outside)
    await expect(f.run()).rejects.toThrow('outside-target')
    expect(fs.existsSync(outside)).toBe(true)
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
  })

  it('reports exact remaining artifacts on persistent cleanup failure', () => {
    const f = fixture()
    fs.copyFileSync(process.execPath, f.paths[0])
    const sha256 = createHash('sha256').update(fs.readFileSync(f.paths[0])).digest('hex')
    const errors = []
    cleanupFiles(f.target, [{ path: f.paths[0], sha256 }], errors, () => { throw Error('injected unlink denial') })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(f.paths[0])
    expect(fs.existsSync(f.paths[0])).toBe(true)
  })
})
