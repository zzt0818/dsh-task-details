// Fold invariants: no phantom tasks, stable numbering, result linkage.
import { foldTurns } from '../analyzer.js'
import { buildEntries, SESSION_ID } from './fixture.mjs'

const entries = buildEntries()
const fold = foldTurns(entries)

const checks = []
const check = (label, condition, detail = '') => {
  checks.push({ label, ok: Boolean(condition), detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

check('every folded task has an integer number', fold.turns.every((turn) => Number.isInteger(turn.turn)))
check('task count matches turn/start count', fold.turns.length === entries.filter((e) => e.event.type === 'turn/start').length)
check('byNumber agrees with turns', fold.turns.every((turn) => fold.byNumber.get(turn.turn) === turn))
check('all tool results linked', fold.turns.every((turn) => turn.calls.every((call) => call.status === 'done')))
check('failed call flagged', fold.byNumber.get(1).calls.filter((c) => c.isError).length === 1)

// A session-level event without a Turn must not create a phantom task.
const noisy = [...entries, { event: { type: 'command/run', seq: 999, time: 1, data: {} } }]
check('event without turn ignored', foldTurns(noisy).turns.length === fold.turns.length)

// Re-folding the same window is a pure function of the entries.
const again = foldTurns(entries)
check('fold is deterministic', JSON.stringify(again.turns.map((t) => t.turn)) === JSON.stringify(fold.turns.map((t) => t.turn)))

// An empty window folds to no tasks.
check('empty window folds clean', foldTurns([]).turns.length === 0)

console.log(`\nsession ${SESSION_ID}`)
const failed = checks.filter((c) => !c.ok)
if (failed.length > 0) {
  console.error('FAILED:', failed.map((c) => c.label).join('; '))
  process.exitCode = 1
} else {
  console.log('FOLD OK')
}
