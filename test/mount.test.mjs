// Renders the panel with effects actually executing, so a crash inside an
// effect (or a render phase that only runs on mount) surfaces as a failure
// instead of a silently blank panel.
import { configure, TaskDetailsView } from '../details.js'
import { zh } from '../copy.js'
import { buildEntries, SESSION_ID, METADATA } from './fixture.mjs'

const effects = []
const states = []

const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  memo: (component) => component,
  useState: (init) => {
    const value = typeof init === 'function' ? init() : init
    const index = states.length
    states.push(value)
    return [value, () => {}]
  },
  useEffect: (fn) => {
    effects.push(fn)
  },
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
}

configure({ React })

const t = (key, params) =>
  (zh[key] ?? key).replace(/\{(\w+)\}/g, (match, name) => (params?.[name] === undefined ? match : String(params[name])))

const entries = buildEntries()
const session = {
  cwd: 'D:\\work',
  eventSource: { getSnapshot: () => ({ entries, revision: 1 }), subscribe: () => () => {} },
}

globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ files: [...METADATA.values()], memory: [], artifacts: [], revision: 'r1', home: 'C:\\Users\\u\\.dsh' }),
})
globalThis.window = {
  localStorage: { getItem: () => null, setItem: () => {} },
  addEventListener() {},
  removeEventListener() {},
  setInterval: () => 0,
  clearInterval() {},
}
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
}

const checks = []
const check = (label, ok, detail = '') => {
  checks.push({ label, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

let view
let renderError
try {
  view = TaskDetailsView({ sessionId: SESSION_ID, turn: 1, session, t, openResource: () => {}, describe: undefined })
} catch (error) {
  renderError = error
}
check('render does not throw', renderError === undefined, renderError?.message ?? '')
if (renderError !== undefined) throw renderError

// Run every effect the way React would on mount.
let effectError
for (const effect of effects) {
  try {
    const cleanup = effect()
    if (typeof cleanup === 'function') cleanup()
  } catch (error) {
    effectError = error
    break
  }
}
check('effects do not throw', effectError === undefined, effectError?.message ?? '')

// The panel must actually contain its sections.
const walk = (node, visit) => {
  if (node === null || node === undefined || typeof node !== 'object') return
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}
const sections = []
walk(view, (node) => {
  const name = node.props?.className
  if (typeof name === 'string' && name.includes('td-section')) sections.push(node.props['data-section'] ?? name)
})
check('sections rendered', sections.length >= 6, String(sections.length))

const text = JSON.stringify(view)
check('has flow content', text.includes('td-phase') || text.includes('td-phases'))
console.log(sections.join(' | '))

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) {
  console.error('FAILED:', failed.map((c) => c.label).join('; '))
  process.exitCode = 1
} else {
  console.log('MOUNT OK')
}
