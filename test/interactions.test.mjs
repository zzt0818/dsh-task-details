// Regression tests for the interaction fixes: copy-path passes the file path,
// metric chips jump through the flash/expand handler, the toolbar exposes a
// manual refresh and a collapse-all control, and section headings carry counts.
import fs from 'node:fs'
import { configure, TaskDetailsView } from '../details.js'
import { zh } from '../copy.js'
import { buildEntries, METADATA, SESSION_ID } from './fixture.mjs'
import { at } from './paths.mjs'

// A React harness that records state updates so callbacks can be exercised.
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

const entries = buildEntries()
const session = { cwd: 'D:\\work', eventSource: { getSnapshot: () => ({ entries, revision: 1 }), subscribe: () => () => {} } }
const describe = { files: [...METADATA.values()], memory: [], artifacts: [], revision: 'r' }

let copied = ''
globalThis.fetch = async () => ({ ok: true, json: async () => describe })
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { clipboard: { writeText: (text) => { copied = text; return Promise.resolve() } } },
})
globalThis.window = {
  localStorage: { getItem: () => null, setItem() {} },
  addEventListener() {},
  removeEventListener() {},
  setInterval: () => 0,
  clearInterval() {},
  setTimeout: () => 0,
  clearTimeout() {},
}
globalThis.document = { querySelector: () => null }

const view = TaskDetailsView({
  sessionId: SESSION_ID,
  turn: 1,
  session,
  t,
  price: { input: 0.5, output: 8 },
  openResource: () => {},
  describe,
})

function collect(node, predicate, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) collect(child, predicate, out)
    return out
  }
  if (predicate(node)) out.push(node)
  for (const child of (Array.isArray(node.children) ? node.children : [])) collect(child, predicate, out)
  return out
}
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

// 1. Copy button passes the file path, not the click event. The panel stores
//    the copied state, so invoking onClick must hand the row's own path to the
//    clipboard helper.
const copyButtons = collect(view, (n) => typeof n.props?.className === 'string' && n.props.className.startsWith('td-iconButton') && n.props.className.includes('td-iconButton'))
check('copy controls exist', copyButtons.length > 0, String(copyButtons.length))
const firstCopy = copyButtons.find((b) => b.props['aria-label'] === t('file.reveal'))
check('copy control has the reveal label', firstCopy !== undefined)
firstCopy?.props.onClick?.({ type: 'click' })
check('click copies a real path, not a mouse event', copied.includes('.') || copied.includes('/') || copied.includes('\\'), copied.slice(0, 60))
check('click never copies the event object', !copied.includes('MouseEvent') && !copied.includes('[object'), copied.slice(0, 60))

// 2. Metric chips use the flash/expand jump handler. The onClick closure keeps
//    a reference to the section id it scrolls to.
const metrics = collect(view, (n) => typeof n.props?.className === 'string' && /(?:^| )td-metric--link/.test(n.props.className))
check('linked metrics render', metrics.length >= 3, String(metrics.length))
check('metric clicks are wired', metrics.every((m) => typeof m.props.onClick === 'function'))
check('metric click does not throw without a DOM', (() => {
  try { metrics.forEach((m) => m.props.onClick()); return true } catch { return false }
})())

// 3. Toolbar: a refresh button and a collapse-all button, both labelled.
const toolbarButtons = collect(view, (n) => typeof n.props?.className === 'string' && n.props.className.includes('td-toolbarButton'))
const refreshButton = toolbarButtons.find((b) => b.props['aria-label'] === t('panel.refresh'))
const collapseButton = toolbarButtons.find((b) => b.props['aria-label'] === t('panel.collapseAll'))
check('manual refresh button present', refreshButton !== undefined && typeof refreshButton.props.onClick === 'function')
check('collapse-all button present', collapseButton !== undefined && typeof collapseButton.props.onClick === 'function')
check('toolbar buttons are always visible', /\.td-toolbarButton \{[\s\S]*?opacity: 1/.test(fs.readFileSync(at('styles.js'), 'utf8')))

// 4. Section headings carry a count badge with an accessible label.
const counts = collect(view, (n) => n.props?.className === 'td-sectionCount')
check('section count badges render', counts.length > 0, String(counts.length))
check('count badges are numeric', counts.every((badge) => /^\d+$/.test(text(badge))))
check('count badges are labelled for assistive tech', counts.every((badge) => typeof badge.props['aria-label'] === 'string'))

// 5. New copy keys exist in both dictionaries (imported from the module).
const en = (await import('../copy.js')).en
for (const key of ['panel.collapseAll', 'panel.expandAll', 'section.count']) {
  check(`${key} translated in zh`, typeof zh[key] === 'string' && zh[key] !== key)
  check(`${key} translated in en`, typeof en[key] === 'string' && en[key] !== key)
}

// 6. Theme fallbacks: the stylesheet defines local aliases for tokens that
//    the public Theme contract does not guarantee.
const css = fs.readFileSync(at('styles.js'), 'utf8')
check('theme fallbacks declared', ['--td-tertiary', '--td-module', '--td-border-l3', '--td-link', '--td-hover', '--td-business'].every((name) => css.includes(`${name}:`)))
check('no unguarded tertiary alias in rules', !/:\s*var\(--dsw-alias-label-tertiary\)/.test(css))

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) process.exitCode = 1
else console.log('INTERACTIONS OK')
