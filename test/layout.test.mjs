// Locks the layout requirements: values are never truncated, and the flow is a
// horizontal chip row rather than a vertical list.
import fs from 'node:fs'
import { configure, TaskDetailsView } from '../details.js'
import { zh } from '../copy.js'
import { buildEntries, METADATA, SESSION_ID } from './fixture.mjs'
import { at } from './paths.mjs'

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
globalThis.fetch = async () => ({ ok: true, json: async () => ({ files: [...METADATA.values()], memory: [], artifacts: [], revision: 'r' }) })
globalThis.window = { localStorage: { getItem: () => null, setItem() {} }, addEventListener() {}, removeEventListener() {}, setInterval: () => 0, clearInterval() {} }

const view = TaskDetailsView({
  sessionId: SESSION_ID,
  turn: 1,
  session,
  t,
  openResource: () => {},
  describe: { files: [...METADATA.values()], memory: [], artifacts: [], revision: 'r' },
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

const css = fs.readFileSync(at('styles.js'), 'utf8')

// 1. Overview values must render in full, never as an ellipsis.
const facts = collect(view, (node) => typeof node.props?.className === 'string' && node.props.className.startsWith('td-factValue'))
check('overview renders fact rows', facts.length > 0, String(facts.length))
const factValues = facts.map((node) => text(node))
console.log('facts:', factValues.join(' | '))
check('the timestamp is complete', factValues.some((value) => /\d{4}\/\d{2}\/\d{2}/.test(value) && !value.includes('…')), factValues[2])
check('the model name is complete', factValues.some((value) => value.includes('/') && !value.includes('…')))
check('fact values wrap instead of clipping', /\.td-factValue \{[\s\S]*?overflow-wrap: anywhere/.test(css))
const factRule = /\.td-factValue \{([^}]*)\}/.exec(css)
const factDeclarations = (factRule?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
check('fact values do not clip with text-overflow', !/text-overflow\s*:/.test(factDeclarations))
check('fact values do not force a single line', !/white-space\s*:\s*nowrap/.test(factDeclarations))

// 2. The flow is a horizontal chip row.
const phaseCss = /\.td-phases \{([\s\S]*?)\}/.exec(css)
check('phases use a row layout', phaseCss !== null && /flex-direction: row/.test(phaseCss[1]))
// The row must not wrap onto a second line: two lines read as two flows.
check('phases stay on one line', phaseCss !== null && /flex-wrap: nowrap/.test(phaseCss[1]))
const railRule = /\.td-phase::before \{([^}]*)\}/.exec(css)
check('phases contain no vertical rail', railRule === null || !/bottom: -4px/.test(railRule[1]))

// 3. The metric strip is compact.
const metricCss = /\.td-metric \{([\s\S]*?)\}/.exec(css)
check('metrics are compact pills', metricCss !== null && /border-radius: 999px/.test(metricCss[1]))

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) process.exitCode = 1
else console.log('LAYOUT OK')
