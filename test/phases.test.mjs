// Shows how a real task is summarized into plain-language phases.
import { foldTurns, buildTaskModel, summarizeCall, summarizePhases, summarizeOutcome } from '../analyzer.js'
import { readJournal } from '../index.js'
import { ROOT } from './paths.mjs'

const SESSION = 'session-44d18f6e-b715-4848-88bf-e2619d0e6586'
const journal = await readJournal(SESSION)
if (!journal.ok) throw new Error(journal.error)

const entries = journal.events.map((event) => ({ event }))
const fold = foldTurns(entries)
const latest = fold.turns.at(-1)
const model = buildTaskModel(fold, latest.turn, { cwd: ROOT, sessionId: SESSION })

console.log(`task ${model.turn}: ${model.calls.length} calls, ${model.steps.length} steps`)
const phases = summarizePhases(model, summarizeCall)
console.log(`\ncompressed into ${phases.length} phases:`)
for (const phase of phases) {
  console.log(`  [${phase.kind}] ${phase.calls.length} call(s)${phase.failed ? ` (${phase.failed} failed)` : ''}`)
  for (const sample of phase.sample) console.log(`      · ${sample}`)
}

const outcome = summarizeOutcome(model)
console.log('\noutcome:')
for (const item of outcome) {
  console.log(`  ${item.kind}: ${item.count ?? ''} ${(item.files ?? []).map((p) => p.split(/[\\/]/).pop()).join(', ')}`)
}

if (phases.length === 0) throw new Error('no phases produced')

// A task that alternates two kinds many times must still produce two chips.
const kinds = phases.map((phase) => phase.kind)
if (new Set(kinds).size !== kinds.length) throw new Error('phases repeat a kind: ' + kinds.join(', '))
console.log('phases are unique by kind:', kinds.join(' > '))
if (phases.length > 6) throw new Error('too many phases for a readable row: ' + phases.length)
if (phases.length >= model.calls.length) throw new Error('phases did not compress anything')
console.log('\nPHASES OK')
