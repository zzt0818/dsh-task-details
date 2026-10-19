// Measures the Host journal read: a cold decode, then a cached read.
import { readJournal } from '../index.js'

const SESSION = 'session-bbb63b59-b066-40ed-873f-2cfbcb6c8610'

const cold = Date.now()
const first = await readJournal(SESSION)
const coldMs = Date.now() - cold

const warm = Date.now()
const second = await readJournal(SESSION)
const warmMs = Date.now() - warm

console.log(`cold read: ${coldMs}ms (${first.events?.length} events)`)
console.log(`warm read: ${warmMs}ms (${second.events?.length} events)`)
console.log(`speedup: ${(coldMs / Math.max(warmMs, 1)).toFixed(1)}x`)

if (!first.ok || !second.ok) throw new Error('journal read failed')
if (first.events.length !== second.events.length) throw new Error('cache changed the payload')
if (warmMs > coldMs) throw new Error('cache did not help')
console.log('\nCACHE OK')
