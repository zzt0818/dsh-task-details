// Locks the tab-body contract: coordinates come from useTabInfo, not props.
import { boot } from '../client-entry.js'

const registrations = []
const ctx = {
  locale: { bind: () => (key) => key, register: () => () => {} },
  effect: (factory) => factory(),
  slots: {
    inject: (_owner, callback) => callback(),
    register: (definition, component) => (registrations.push({ definition, component }), () => {}),
  },
  sidebarRightTabs: { register: () => () => {} },
  sidebarRight: { mounted: { getSnapshot: () => 'session-abc' } },
  get: () => undefined,
}

globalThis.document = { querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ dataset: {} }), head: { appendChild() {} } }
globalThis.window = {}

/** Minimal hooks runtime for the component under test. */
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
}

boot({ React }, ctx, {})

const checks = []
const check = (label, condition, detail = '') => {
  checks.push({ label, ok: Boolean(condition) })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

const entry = registrations.find((row) => row.definition.key === 'dsh-task-details')
const body = entry === undefined ? undefined : { ...entry.definition, component: entry.component }
check('panel body registered', body !== undefined)

// The seat renders tab bodies with empty props; the record arrives through a
// hook the seat injects. A body that requires the address as a prop could
// never render, which is exactly the silent "loading" this test prevents.
const injected = body.inject?.() ?? {}
check('body receives no address prop', injected.address === undefined && injected.sessionId === undefined)

// Rendering with an empty prop set and a hook-provided record must not throw.
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, events: [] }) })
const record = {
  tab: {
    id: 't1',
    kind: 'task-details',
    address: 'dsh-resource://task-details/session/session-abc/turn/3',
    navigation: { address: 'dsh-resource://task-details/session/session-abc/turn/3', params: {} },
  },
}
let rendered
let threw
try {
  rendered = body.component({
    ...injected,
    useTabInfo: () => record,
    t: (key) => key,
  })
} catch (error) {
  threw = error
}
check('body renders with the hook record', threw === undefined, threw ? String(threw) : '')
check('body produced an element', rendered !== undefined && rendered !== null)

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) process.exitCode = 1
else console.log('TAB BODY OK')
