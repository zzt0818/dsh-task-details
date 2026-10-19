// Proves two different tasks render different content from the same journal.
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
if (!journal.ok) throw new Error(String(journal.error))

const entries = journal.events.map((event) => ({ event }))
const session = { cwd: ROOT, eventSource: { getSnapshot: () => ({ entries, revision: 1 }), subscribe: () => () => {} } }
const describe = { files: [], memory: [], artifacts: [], revision: 'r' }

globalThis.fetch = async () => ({ ok: true, json: async () => describe })
globalThis.window = { localStorage: { getItem: () => null, setItem() {} }, addEventListener() {}, removeEventListener() {}, setInterval: () => 0, clearInterval() {} }

function text(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  return (Array.isArray(node.children) ? node.children : []).map(text).join('')
}

const checks = []
const check = (label, condition, detail = '') => {
  checks.push({ label, ok: Boolean(condition) })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

// Render the same Session at two different tasks.
const render = (turn) =>
  text(
    TaskDetailsView({
      sessionId: SESSION,
      turn,
      session,
      t,
      openResource: () => {},
      describe,
    }),
  )

const early = render(3)
const late = render(20)

const summarize = (value) => (value.match(/任务\s*\d+/) ?? [''])[0]
console.log('task 3 renders:', summarize(early), '| length', early.length)
console.log('task 20 renders:', summarize(late), '| length', late.length)

check('task 3 shows task 3', summarize(early).includes('3'), summarize(early))
check('task 20 shows task 20', summarize(late).includes('20'), summarize(late))
check('the two tasks differ', early !== late)
check('both render content', early.length > 100 && late.length > 100, `${early.length} vs ${late.length}`)

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) process.exitCode = 1
else console.log('DISTINCT TASKS OK')
