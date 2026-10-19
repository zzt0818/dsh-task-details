// Loads the built client.js the way the page does and proves it activates.
//
// The earlier version only checked that the module loader was called, so a
// boot() that silently registered nothing still passed while the panel showed
// a blank page. This asserts the registrations boot() is required to make.
import fs from 'node:fs'
import { at } from './paths.mjs'

const source = fs.readFileSync(at('client.js'), 'utf8')

const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  memo: (component) => component,
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
}

let loaded
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ dataset: {}, textContent: '' }),
  head: { appendChild() {} },
}
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      loaded = definition
    },
  },
  localStorage: { getItem: () => null, setItem() {} },
  addEventListener() {},
  removeEventListener() {},
  setInterval: () => 0,
  clearInterval() {},
  dispatchEvent() {},
}
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init) {
    this.type = type
    this.detail = init?.detail
  }
}
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, events: [] }) })

// Evaluate the artifact exactly as a <script> would. A top-level statement that
// throws here is the white-screen failure this test exists to catch.
let evaluationError
try {
  new Function(source)()
} catch (error) {
  evaluationError = error
}

const checks = []
const check = (label, condition, detail = '') => {
  checks.push({ label, ok: Boolean(condition) })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

check('artifact evaluates without throwing', evaluationError === undefined, evaluationError ? String(evaluationError) : '')
check('artifact called the module loader', loaded !== undefined)
check('module id is stable', loaded?.id === 'dsh-task-details')

const plugin = loaded.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected module request: ${name}`)
})
check('plugin exposes inject and apply', typeof plugin?.apply === 'function' && Array.isArray(plugin.inject))

const registrations = []
const localeRegistrations = []
const tabTypes = []
const ctx = {
  locale: {
    bind: () => (key) => key,
    register: (namespace) => (localeRegistrations.push(namespace), () => {}),
  },
  effect: (factory) => factory(),
  slots: {
    inject: (_owner, callback) => callback(),
    register: (definition, component) => (registrations.push({ definition, component }), () => {}),
  },
  sidebarRightTabs: { register: (definition) => (tabTypes.push(definition), () => {}) },
  sidebarRight: { mounted: { getSnapshot: () => 'session-x' }, openResource() {} },
  get: () => undefined,
}

let bootError
try {
  plugin.apply(ctx, {})
} catch (error) {
  bootError = error
}

check('apply runs without throwing', bootError === undefined, bootError ? String(bootError) : '')
check('tab type registered', tabTypes.length === 1, `got ${tabTypes.length}`)
check('tab kind is task-details', tabTypes[0]?.kind === 'task-details')
check('locale dictionaries registered', localeRegistrations.length >= 1, `got ${localeRegistrations.length}`)

const tail = registrations.find((row) => row.definition.name === 'conversation.chat.turnTail')
const body = registrations.find((row) => row.definition.name === 'sidebar.right.pane.tab')
check('turn tail entry registered', tail !== undefined)
check('panel body registered', body !== undefined)
check('both seat components are functions', typeof tail?.component === 'function' && typeof body?.component === 'function')

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) {
  console.error('FAILED:', failed.map((c) => c.label).join('; '))
  process.exitCode = 1
} else {
  console.log('BUNDLE OK')
}
