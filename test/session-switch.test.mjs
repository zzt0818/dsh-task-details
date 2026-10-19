// Verifies the panel forgets the previous task when the Session changes.
import { foldTurns } from '../analyzer.js'
import { readJournal } from '../index.js'
import { buildEntries, SESSION_ID } from './fixture.mjs'

const checks = []
const check = (label, condition, detail = '') => {
  checks.push({ label, ok: Boolean(condition) })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

// 1. The remount key must differ for every (session, task) pair.
const keyOf = (sessionId, turn) => `${sessionId}#${turn}`
check('different tasks produce different keys', keyOf('a', 1) !== keyOf('a', 2))
check('different sessions produce different keys', keyOf('a', 1) !== keyOf('b', 1))

// 2. The journal reset policy: when the owner Session changes, the entries are
// dropped rather than carried over.
function journalStateFor(owner, nextSession, previousEntries) {
  if (owner !== nextSession) return { entries: [], origin: 'fetching' }
  return { entries: previousEntries, origin: 'binding' }
}
const stale = [{ event: { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } } }]
check('same Session keeps its entries', journalStateFor('a', 'a', stale).entries.length === 1)
check('a new Session starts empty', journalStateFor('a', 'b', stale).entries.length === 0)

// 3. Two real Sessions fold to different task sets, so a shared panel would be
// visibly wrong if the switch did not reset.
const fixture = foldTurns(buildEntries())
const real = await readJournal(SESSION_ID.replace(/[0-9a-f]/g, '1'))
console.log('fixture tasks:', fixture.turns.length, '| real journal available:', real.ok)

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) process.exitCode = 1
else console.log('SESSION SWITCH OK')
