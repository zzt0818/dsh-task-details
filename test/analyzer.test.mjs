// Analyzer behaviour over the synthetic journal: per-task inputs, files, usage.
import { foldTurns, buildTaskModel, summarizeCall } from '../analyzer.js'
import { languageSummary, reuseVerdict, formatDuration, formatBytes } from '../model.js'
import { SESSION_ID, buildEntries, METADATA } from './fixture.mjs'

const entries = buildEntries()
const fold = foldTurns(entries)

const checks = []
const check = (label, condition, detail = '') => {
  checks.push({ label, ok: Boolean(condition), detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

check('two tasks folded', fold.turns.length === 2, `got ${fold.turns.length}`)
check('tasks numbered 1,2', fold.turns.map((t) => t.turn).join(',') === '1,2')

const t1 = buildTaskModel(fold, 1, { cwd: 'D:\\work', metadata: METADATA, sessionId: SESSION_ID })
const t2 = buildTaskModel(fold, 2, { cwd: 'D:\\work', metadata: METADATA, sessionId: SESSION_ID })

check('turn 1 exists', t1 !== null)
check('turn 1 status completed', t1.status === 'completed', t1.status)
check('turn 2 status error', t2 !== null && t2.status === 'error', t2?.status)
check('turn 1 duration recorded', t1.durationMs > 0, formatDuration(t1.durationMs))
check('turn 1 input text captured', t1.inputs[0]?.text.includes('报告'), t1.inputs[0]?.text ?? '')
check('turn 2 attachment captured', t2.inputs[0]?.images.some((image) => image.name === 'shot.png'))

check('turn 1 has 6 calls', t1.calls.length === 6, String(t1.calls.length))
check('one failed call', t1.failedCalls.length === 1, t1.failedCalls.map((c) => c.name).join(','))
check('call durations measured', t1.calls.every((c) => c.durationMs !== undefined))

// A file the agent merely read is work it did, not a file the user supplied:
// the input section only ever holds the user's own attachments.
const inputPaths = t1.sections.input.map((f) => f.name).sort()
check('input section holds no agent-read file', inputPaths.length === 0, inputPaths.join(','))
const readRow = t1.sections.output.find((f) => f.name === 'report.md')
check('agent-read file is listed as work', readRow !== undefined && readRow.role === 'read', readRow?.role ?? 'missing')
check('metadata merged (size)', readRow?.size === 2048, formatBytes(readRow?.size))
check('metadata merged (lines)', readRow?.lines === 3)
check('attachment appears as input', t2.sections.input.some((f) => f.name === 'shot.png'), t2.sections.input.map((f) => f.name).join(','))
check('output has summary.ps1', t1.sections.output.some((f) => f.name === 'summary.ps1'))
check('summary.ps1 role deliver', t1.sections.output.find((f) => f.name === 'summary.ps1')?.role === 'deliver')
check('delivered files captured', t1.delivered.length === 1 && t1.delivered[0].path.endsWith('summary.ps1'))
check('no intermediate rows here', t1.sections.intermediate.length === 0)

check('usage summed input', t1.usage.inputTokens === 3000, String(t1.usage.inputTokens))
check('usage summed output', t1.usage.outputTokens === 410, String(t1.usage.outputTokens))
check('usage summed cache read', t1.usage.cacheReadTokens === 10000, String(t1.usage.cacheReadTokens))
check('model identity recorded', t1.models[0]?.model === 'deepseek-flash')

const skills = t1.skills
check('skill invocation counted', skills.length === 1 && skills[0].name === 'office-docx' && skills[0].count === 1)

const language = languageSummary(t1)
check('language inferred from .ps1', language.languages.includes('PowerShell'), language.languages.join(','))
check('shell inferred', language.shells.includes('bash'), language.shells.join(','))

const reuse = reuseVerdict(t1)
check('task judged reusable', reuse.reusable === true, JSON.stringify(reuse.reasons))

check('flow summary prefers description', summarizeCall(t1.calls.find((c) => c.name === 'bash')) === 'run summary')
check('flow summary falls back to path', summarizeCall(t1.calls.find((c) => c.name === 'read')).endsWith('report.md'))

check('unknown task returns null', buildTaskModel(fold, 99, {}) === null)

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) {
  console.error('FAILED:', failed.map((c) => `${c.label} ${c.detail}`).join('; '))
  process.exitCode = 1
} else {
  console.log('ANALYZER OK')
}
