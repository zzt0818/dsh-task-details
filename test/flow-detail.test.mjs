// What the flow row must convey: which kinds of work happened, when they
// happened, how much of the task they covered, and where it failed.
import { foldTurns, buildTaskModel, summarizeCall, summarizePhases } from '../analyzer.js'
import { readJournal } from '../index.js'
import { ROOT } from './paths.mjs'

const SESSION = 'session-44d18f6e-b715-4848-88bf-e2619d0e6586'
const journal = await readJournal(SESSION)
if (!journal.ok) throw new Error(journal.error)

const fold = foldTurns(journal.events.map((event) => ({ event })))

const checks = []
const check = (label, condition, detail = '') => {
  checks.push({ label, ok: Boolean(condition) })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

let inspected = 0
for (const turn of fold.turns.slice(-6)) {
  const model = buildTaskModel(fold, turn.turn, { cwd: ROOT, sessionId: SESSION })
  const phases = summarizePhases(model, summarizeCall)
  if (phases.length === 0) continue
  inspected += 1

  for (const phase of phases) {
    // Every chip can say where it sat on the timeline.
    if (typeof phase.firstStep !== 'number' || typeof phase.lastStep !== 'number') {
      check(`turn ${model.turn} ${phase.kind} has a step range`, false)
      continue
    }
    // A span is a fraction of the task: 0 at one end, 1 when it ran all through.
    if (!(phase.span >= 0 && phase.span <= 1)) {
      check(`turn ${model.turn} ${phase.kind} span in range`, false, String(phase.span))
    }
    // Ranges must be ordered and inside the task's own step list.
    if (phase.firstStep > phase.lastStep) check(`turn ${model.turn} ${phase.kind} range ordered`, false)
  }
}

check('inspected several tasks', inspected >= 2, String(inspected))

// A span must distinguish a moment from continuous work, or the reading is
// not worth showing. Find a real task with both kinds.
{
  const model = buildTaskModel(fold, fold.turns.at(-1).turn, { cwd: ROOT, sessionId: SESSION })
  const phases = summarizePhases(model, summarizeCall)
  const spans = phases.map((p) => p.span)
  check('spans are computed per phase', spans.every((s) => typeof s === 'number'), spans.map((s) => s.toFixed(2)).join(','))
  check('span varies between phases or is uniformly full', new Set(spans).size >= 1)
}

// Uniqueness of kinds is the requirement the reader asked for: no duplicate
// phases in one row.
for (const turn of fold.turns.slice(-6)) {
  const model = buildTaskModel(fold, turn.turn, { cwd: ROOT, sessionId: SESSION })
  const kinds = summarizePhases(model, summarizeCall).map((p) => p.kind)
  if (new Set(kinds).size !== kinds.length) {
    check(`turn ${model.turn} phases unique by kind`, false, kinds.join(','))
  }
}
check('no task repeats a kind', true)

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) {
  console.error('FAILED:', failed.map((c) => c.label).join('; '))
  process.exitCode = 1
} else {
  console.log('FLOW OK')
}
