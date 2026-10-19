// Exercises the Host half's aggregation against the real filesystem.
//
// The file-metadata assertions are deterministic because they only touch this
// repository. Memory files and session logs live under the user's own DSH home,
// so those are reported for inspection but not required: a fresh clone on a
// machine that has never run DSH must still be able to pass this test.
import { describeTask } from '../index.js'
import { ROOT, at } from './paths.mjs'

const pkg = at('package.json')
const missing = at('.dsh', 'does-not-exist.txt')

const result = await describeTask({
  sessionId: 'session-70eab2d4-a88d-4e47-a40a-73adc764ec4d',
  paths: [
    pkg,
    missing,
    ROOT,
    'relative/path.txt',
  ],
})

console.log('ok:', result.ok, 'home:', result.home, 'revision:', result.revision)
for (const file of result.files) {
  console.log(`- ${file.path}`)
  console.log(`    exists=${file.exists} kind=${file.kind} size=${file.size} lines=${file.lines} error=${file.error ?? '-'}`)
}
console.log('memory:', result.memory.map((m) => `${m.scope}:${m.path.split(/[\\/]/).slice(-2).join('/')} ${m.size}B`))
console.log('artifacts:', result.artifacts.length, result.artifacts.map((a) => `${a.bucket}/${a.path.split(/[\\/]/).pop()}`))

const fail = (message) => {
  throw new Error(message)
}

if (!result.ok) fail('describe failed')

// `relative/path.txt` is not absolute and is not an attachment id, so it is
// dropped: the answer carries exactly the three real paths.
if (result.files.length !== 3) fail(`expected 3 normalized paths, got ${result.files.length}`)

const packageRecord = result.files.find((file) => file.path === pkg)
if (packageRecord?.exists !== true) fail('repo package.json not reported as existing')
if (typeof packageRecord.size !== 'number' || packageRecord.size <= 0) fail('package.json size not reported')
if (typeof packageRecord.lines !== 'number' || packageRecord.lines <= 0) fail('package.json line count not reported')

const missingRecord = result.files.find((file) => file.path === missing)
if (missingRecord?.exists !== false) fail('missing path not reported as missing')
if (missingRecord?.error !== 'ENOENT') fail(`missing path error should be ENOENT, got ${missingRecord?.error}`)

const directoryRecord = result.files.find((file) => file.path === ROOT)
if (directoryRecord?.exists !== true || directoryRecord.kind !== 'directory') fail('repository root not reported as a directory')

if (typeof result.revision !== 'string' || result.revision.length === 0) fail('revision fingerprint missing')

console.log('\nHOST OK')
