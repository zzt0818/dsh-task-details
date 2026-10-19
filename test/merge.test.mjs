// Simulates the panel's journal loading under each binding shape.
import { foldTurns } from '../analyzer.js'

// Mirrors the state initialization and merge in details.js, so a regression in
// the merge policy fails here rather than in the browser.
function initialState(source) {
  const entries = source?.getSnapshot?.()?.entries ?? []
  return entries.length > 0 ? { entries, origin: 'binding' } : { entries: [], origin: 'fetching' }
}

function mergeAfterFetch(previous, hostEvents) {
  return previous.origin === 'binding' && previous.entries.length > 0
    ? previous
    : { entries: hostEvents.map((event) => ({ event })), origin: 'host' }
}

const hostEvents = [
  { type: 'user/message', seq: 1, time: 1000, data: { turn: 1, content: [{ type: 'text', text: 'hi' }] } },
  { type: 'turn/start', seq: 2, time: 1100, data: { turn: 1 } },
  { type: 'turn/end', seq: 3, time: 1200, data: { turn: 1, reason: { kind: 'completed' } } },
]

const checks = []
const check = (label, condition, detail = '') => {
  checks.push({ label, ok: Boolean(condition) })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

// 1. No session binding at all: the panel starts fetching and adopts the Host.
const none = initialState(undefined)
check('no binding starts in the fetching state', none.origin === 'fetching')
const afterNone = mergeAfterFetch(none, hostEvents)
check('no binding adopts the Host journal', afterNone.origin === 'host' && afterNone.entries.length === 3)

// 2. A binding object that exists but has loaded no entries yet: the previous
// bug kept this state forever because the origin was 'binding'.
const emptyBinding = { getSnapshot: () => ({ entries: [], revision: 0 }) }
const emptyState = initialState(emptyBinding)
check('empty binding is not mistaken for data', emptyState.origin === 'fetching')
const afterEmpty = mergeAfterFetch(emptyState, hostEvents)
check('empty binding adopts the Host journal', afterEmpty.origin === 'host' && afterEmpty.entries.length === 3)

// 3. A live binding with entries wins over the Host copy.
const live = { getSnapshot: () => ({ entries: hostEvents.map((event) => ({ event })), revision: 9 }) }
const liveState = initialState(live)
check('live binding wins at initialization', liveState.origin === 'binding')
const afterLive = mergeAfterFetch(liveState, [{ type: 'turn/start', seq: 99, time: 0, data: { turn: 9 } }])
check('live binding is not overwritten by the Host', afterLive === liveState)

// The adopted journal must fold into a usable task.
const fold = foldTurns(afterEmpty.entries)
check('adopted journal folds into one task', fold.turns.length === 1 && fold.byNumber.has(1))

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) process.exitCode = 1
else console.log('MERGE OK')
