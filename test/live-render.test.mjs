// Renders the panel from the live Host journal for a real Session.
import { configure, TaskDetailsView } from '../details.js'
import { zh } from '../copy.js'
import { readJournal } from '../index.js'
import { ROOT } from './paths.mjs'

const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  memo: (component) => component,
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
}
configure({ React })

const t = (key, params) =>
  (zh[key] ?? key).replace(/\{(\w+)\}/g, (match, name) => (params?.[name] === undefined ? match : String(params[name])))

const SESSION = 'session-44d18f6e-b715-4848-88bf-e2619d0e6586'
const journal = await readJournal(SESSION)
if (!journal.ok) throw new Error(`journal: ${journal.error}`)

const entries = journal.events.map((event) => ({ event }))
const session = { cwd: ROOT, eventSource: { getSnapshot: () => ({ entries, revision: 1 }), subscribe: () => () => {} } }

globalThis.fetch = async () => ({ ok: true, json: async () => ({ files: [], memory: [], artifacts: [], revision: 'r' }) })
globalThis.window = { localStorage: { getItem: () => null, setItem() {} }, addEventListener() {}, removeEventListener() {}, setInterval: () => 0, clearInterval() {} }

function collect(node, predicate, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) collect(child, predicate, out)
    return out
  }
  if (predicate(node)) out.push(node)
  const children = Array.isArray(node.children) ? node.children : []
  for (const child of children) collect(child, predicate, out)
  return out
}
function text(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  return (Array.isArray(node.children) ? node.children : []).map(text).join('')
}

// The newest task, which is what the footer belongs to.
const turnNumbers = entries.map((entry) => entry.event).filter((e) => e.type === 'turn/start').map((e) => e.data.turn)
const turn = Math.max(...turnNumbers)
console.log(`rendering session ${SESSION.slice(0, 20)}бн task ${turn} (${entries.length} events)`)

let view
let error
try {
  view = TaskDetailsView({ sessionId: SESSION, turn, session, t, openResource: () => {}, describe: { files: [], memory: [], artifacts: [], revision: 'x' } })
} catch (caught) {
  error = caught
}

const checks = []
const check = (label, condition, detail = '') => {
  checks.push({ label, ok: Boolean(condition) })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

check('view renders without throwing', error === undefined, error ? String(error) : '')
const sections = collect(view ?? null, (n) => n.props?.className === 'td-section')
console.log('sections rendered:', sections.length)
check('sections rendered', sections.length === 7, String(sections.length))
check('panel is not the loading placeholder', !text(view).includes(zh.loading) || sections.length > 0)

const phases = collect(view ?? null, (n) => typeof n.props?.className === 'string' && n.props.className.startsWith('td-phase '))
console.log('phases rendered:', phases.length)
check('flow shows plain-language phases', phases.length > 0, String(phases.length))

const fileRows = collect(view ?? null, (n) => n.props?.className === 'td-fileRow')
console.log('file rows rendered:', fileRows.length)
const tools = collect(view ?? null, (n) => typeof n.props?.className === 'string' && n.props.className.startsWith('td-tableRow'))
console.log('tool rows rendered:', tools.length)
check('tool usage listed', tools.length > 0, String(tools.length))

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) process.exitCode = 1
else console.log('LIVE RENDER OK')
