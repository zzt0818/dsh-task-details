// Verifies the Host journal route decodes a real Session log.
import { readJournal, decodeZstdJournal } from '../index.js'

const SESSION = 'session-bbb63b59-b066-40ed-873f-2cfbcb6c8610'

const journal = await readJournal(SESSION)
console.log('ok:', journal.ok, 'error:', journal.error ?? '-')
console.log('path:', journal.path)
console.log('events:', journal.events?.length)

const types = new Map()
for (const event of journal.events ?? []) types.set(event.type, (types.get(event.type) ?? 0) + 1)
console.log('types:', [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}=${v}`).join(' '))

const turns = new Set((journal.events ?? []).filter((e) => e.type === 'turn/start').map((e) => e.data.turn))
console.log('turns decoded:', turns.size)

if (!journal.ok) throw new Error(`journal read failed: ${journal.error}`)
if ((journal.events?.length ?? 0) === 0) throw new Error('no events decoded')
if (turns.size === 0) throw new Error('no turns decoded')

const missing = await readJournal('session-00000000-0000-4000-8000-000000000000')
console.log('missing session ->', missing.ok, missing.error)
if (missing.ok) throw new Error('a missing session must not report ok')

const invalid = await readJournal('../../etc/passwd')
console.log('invalid id ->', invalid.ok, invalid.error)
if (invalid.ok) throw new Error('an invalid id must be refused')

console.log('\nJOURNAL OK')
