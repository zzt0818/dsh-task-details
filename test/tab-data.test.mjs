// Locks the tab-body data path: the record's contentId names the task.
import { boot } from '../client-entry.js'

const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
}

const registrations = []
const opened = []
const ctx = {
  locale: { bind: () => (key) => key, register: () => () => {} },
  effect: (factory) => factory(),
  slots: {
    inject: (_owner, callback) => callback(),
    register: (definition, component) => (registrations.push({ definition, component }), () => {}),
  },
  sidebarRightTabs: { register: () => () => {} },
  sidebarRight: { mounted: { getSnapshot: () => 'session-x' }, openResource: (address) => opened.push(address) },
  get: () => undefined,
}
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ dataset: {} }), head: { appendChild() {} } }
globalThis.window = { addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null, setItem() {} } }
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, events: [] }) })

boot({ React }, ctx, {})

const checks = []
const check = (label, condition, detail = '') => {
  checks.push({ label, ok: Boolean(condition) })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

const body = registrations.find((row) => row.definition.name === 'sidebar.right.pane.tab')
check('panel body registered', body !== undefined)

// The shape the sidebar hands over: the record's contentId is the address.
const record = {
  tab: {
    id: 'tab-1',
    kind: 'task-details',
    contentId: 'dsh-resource://task-details/session/session-A/turn/7',
    navigation: { address: 'dsh-resource://task-details/session/session-A/turn/7', params: {} },
  },
}

const injected = body.definition.inject?.() ?? {}
let rendered
let error
try {
  rendered = body.component({ ...injected, useTabInfo: () => record, t: (key) => key })
} catch (caught) {
  error = caught
}
check('body renders from the record', error === undefined, error ? String(error) : '')

function text(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  return (Array.isArray(node.children) ? node.children : []).map(text).join('')
}

const shown = text(rendered)
console.log('rendered text:', JSON.stringify(shown).slice(0, 160))
check('the body uses the record address', !shown.includes('noCoordinates'), shown.slice(0, 80))

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) process.exitCode = 1
else console.log('TAB DATA PATH OK')
