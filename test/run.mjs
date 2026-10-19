/**
 * Run every test file in this directory, in order, and report a summary.
 *
 * Each test is a standalone script that throws (or sets a non-zero exit code)
 * on failure; running them one at a time keeps one failure from hiding the
 * rest. `paths.mjs`, `fixture.mjs` and this runner are helpers, not tests.
 *
 * Child output is inherited rather than piped: capturing a child's stdio
 * through a pipe is refused under some sandboxed environments, which would
 * make every test look like a failure.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const HELPERS = new Set(['paths.mjs', 'fixture.mjs', 'run.mjs'])

const files = fs
  .readdirSync(here)
  .filter((name) => name.endsWith('.mjs') && !HELPERS.has(name))
  .sort()

const failed = []
for (const file of files) {
  const result = spawnSync(process.execPath, [path.join(here, file)], { stdio: 'inherit' })
  const ok = result.status === 0
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${file}\n`)
  if (!ok) failed.push(file)
}

console.log(`${files.length - failed.length}/${files.length} test files passed`)
if (failed.length > 0) {
  console.error(`FAILED: ${failed.join(', ')}`)
  process.exitCode = 1
} else {
  console.log('ALL TESTS OK')
}
