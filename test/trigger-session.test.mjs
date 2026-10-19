// Locks the trigger's Session choice: its own seat wins over the sidebar.
import { register } from '../client-entry.js'

const registrations = []
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
}

// The sidebar is displaying session-B while the button lives in session-A.
let sidebarMounted = 'session-B'
const ctx = {
  locale: { bind: () => (key) => key, register: () => () => {} },
  effect: (factory) => factory(),
  slots: {
    inject: (_owner, callback) => callback(),
    register: (definition, component) => (registrations.push({ definition, component }), () => {}),
  },
  sidebarRightTabs: { register: () => () => {} },
  sidebarRight: {
    mounted: { getSnapshot: () => sidebarMounted },
    openResource: (address) => opened.push(address),
  },
  get: (name) => (name === 'sidebarRight' ? ctx.sidebarRight : undefined),
}

globalThis.document = { querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ dataset: {} }), head: { appendChild() {} } }
globalThis.window = { addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null, setItem() {} } }

const opened = []
const { boot } = await import('../client-entry.js')
boot({ React }, ctx, {})

const checks = []
const check = (label, condition, detail = '') => {
  checks.push({ label, ok: Boolean(condition) })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

const tail = registrations.find((row) => row.definition.name === 'conversation.chat.turnTail')
check('turn tail registered', tail !== undefined)

// The seat renders the entry for a task in session-A.
const injected = tail.definition.inject({ turn: 4, sessionId: 'session-A' })
// The seat merges its owner props with what injection adds; reproduce that.
const element = tail.component({ turn: 4, sessionId: 'session-A', ...injected })

element.children.flat().find((child) => child && child.type === 'button').props.onClick()

const address = opened.at(-1) ?? ''
console.log('opened:', address)
check('the button opens its own Session', address.includes('session-A'), address)
check('the button does not follow the sidebar', !address.includes('session-B'))
check('the button keeps the task number', address.endsWith('/turn/4'), address)

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) process.exitCode = 1
else console.log('TRIGGER SESSION OK')
