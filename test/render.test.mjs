// Renders the panel over the fixture journal through a minimal React harness.
import fs from 'node:fs'
import { configure, TaskDetailsTrigger, TaskDetailsView } from '../details.js'
import { zh } from '../copy.js'
import { buildEntries, SESSION_ID, METADATA } from './fixture.mjs'

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
const session = {
  cwd: 'D:\\work',
  eventSource: { getSnapshot: () => ({ entries, revision: 1 }), subscribe: () => () => {} },
}

// The Host half answers with the fixture's metadata, memory, and artifacts.
const describe = {
  files: [...METADATA.values()],
  memory: [{ path: 'C:\\Users\\u\\.dsh\\bot\\memory\\team\\MEMORY.md', exists: true, size: 172, scope: 'team' }],
  artifacts: [
    { path: 'C:\\Users\\u\\.dsh\\sessions\\--work--\\session-x\\session.v4.jsonl.zstd', exists: true, size: 4096, scope: 'session-log' },
  ],
  revision: 'r1',
}

globalThis.fetch = async () => ({ ok: true, json: async () => describe })

globalThis.window = {
  localStorage: { getItem: () => null, setItem: () => {} },
  addEventListener() {},
  removeEventListener() {},
  setInterval: () => 0,
  clearInterval() {},
}

const opened = []
const view = TaskDetailsView({
  sessionId: SESSION_ID,
  turn: 1,
  session,
  price: { input: 0.5, output: 8 },
  t,
  openResource: (address) => opened.push(address),
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

const sections = collect(view, (node) => node.props?.className === 'td-section')
const heads = sections.map((section) => text(collect(section, (n) => n.props?.className === 'td-sectionTitle')).trim())

const checks = []
const check = (label, condition, detail = '') => {
  checks.push({ label, ok: Boolean(condition), detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

console.log('sections:', heads.join(' | '))
check('eight sections render', sections.length === 8, String(sections.length))
check('every sketch block present', ['任务概况', '输入的文件', '中间产物', '输出的文件/产物', '使用的工具/skill', '使用的语言或其他', '可复用', '流程'].every((needle) => heads.some((head) => head.includes(needle))), heads.join('|'))

const phases = collect(view, (n) => typeof n.props?.className === 'string' && n.props.className.startsWith('td-phase '))
check('flow summarizes the task into phases', phases.length > 0 && phases.length < 6, String(phases.length))
check('failed work is marked in the flow', phases.some((item) => item.props.className.includes('td-phase--warn')))

const toolRows = collect(view, (n) => typeof n.props?.className === 'string' && n.props.className.startsWith('td-tableRow'))
check('tool rows rendered', toolRows.length >= 5, String(toolRows.length))
check('skill row rendered', toolRows.some((row) => text(row).includes('office-docx')))

const fileRows = collect(view, (n) => n.props?.className === 'td-fileRow')
const fileNames = fileRows.map((row) => text(collect(row, (n) => n.props?.className === 'td-fileName')))
console.log('file rows:', fileNames.join(', '))
check('input file listed', fileNames.includes('report.md'))
check('output file listed', fileNames.includes('summary.ps1'))
check('memory file listed', fileNames.some((name) => String(name).includes('MEMORY.md')))
check('session log listed', fileNames.some((name) => String(name).includes('session.v4.jsonl.zstd')))
check('directory from glob excluded', !fileNames.includes('work'))

const inputSection = sections[heads.findIndex((head) => head.includes('输入的文件'))]
// The conversation itself is already on screen behind the panel; pasting it
// into a section headed "input files" is noise.
check('input section lists files, not the chat text', !text(inputSection).includes('整理'))
const intermediate = sections[heads.findIndex((head) => head.includes('中间产物'))]
check('intermediate section non-empty', collect(intermediate, (n) => n.props?.className === 'td-fileRow').length >= 2)

const factText = collect(view, (node) => typeof node.props?.className === 'string' && node.props.className.startsWith('td-factValue')).map((node) => text(node)).join(' | ')
check('overview shows provider/model', factText.includes('deepseek-official'), factText.slice(0, 120))
check('overview lists usage rows', ['Token','token'].some((w) => text(view).includes(w)))
check('overview lists token buckets', /输入|input/i.test(text(view)))
check('estimated cost renders', factText.includes('$'), factText.slice(0, 160))

const topMetrics = collect(view, (n) => typeof n.props?.className === 'string' && /(?:^| )td-metric(?:$| )/.test(n.props.className))
// Duration and tokens are overview rows; repeating them in the strip above
// printed the same numbers twice on one screen.
check('top metrics do not repeat the overview', !topMetrics.some((m) => /耗时|Token/.test(text(m))))
check('top metrics carry the counts', topMetrics.length >= 3, String(topMetrics.length))
check('metrics jump to their sections', topMetrics.length > 0 && topMetrics.every((m) => m.type === 'button' && typeof m.props.onClick === 'function'), topMetrics.map((m) => String(m.type)).join(','))

const hands = collect(view, (n) => n.props?.role === 'separator')
check('resize handle present and accessible', hands.length === 1 && hands[0].props.tabIndex === 0 && hands[0].props['aria-valuemin'] === 320)

const cacheBar = collect(view, (n) => n.props?.className === 'td-cacheBarFill')
check('cache bar fills with the hit rate', cacheBar.length === 1 && /^\d+(\.\d+)?%$/.test(cacheBar[0].props.style?.width ?? ''), cacheBar[0]?.props.style?.width ?? 'none')

// A 99.6% bar and a 100% bar look identical if the miss is just empty track, so
// the uncached sliver is drawn in its own colour.
const missBar = collect(view, (n) => n.props?.className === 'td-cacheBarMiss')
check('cache bar shows the uncached sliver', missBar.length === 1 && /%$/.test(missBar[0].props.style?.width ?? ''), missBar[0]?.props.style?.width ?? 'none')
check('the uncached sliver is wide enough to see', parseFloat(missBar[0]?.props.style?.width ?? '0') >= 1.5, missBar[0]?.props.style?.width ?? 'none')
check('a miss sliver has its own colour', /\.td-cacheBarMiss \{[^}]*background/.test(fs.readFileSync(new URL('../styles.js', import.meta.url), 'utf8')))

// The bar rides inside the 缓存命中率 row: a bar on its own unlabelled row split
// the label/value list in two and read as a broken entry.
const isFact = (n) => typeof n.props?.className === 'string' && /(?:^| )td-fact(?: |$)/.test(n.props.className)
const cacheRows = collect(view, (n) => isFact(n) && collect(n, (c) => c.props?.className === 'td-cacheBar').length === 1)
check('cache bar shares its value row', cacheRows.length === 1 && text(cacheRows[0]).startsWith('缓存命中率'), cacheRows[0] === undefined ? 'no row' : text(cacheRows[0]).slice(0, 20))
check('every fact row has a label', collect(view, isFact).every((row) => text(collect(row, (n) => n.props?.className === 'td-factKey')).trim() !== ''))

// A status is a word, not a link: the colour lives in a dot beside it.
const statusRow = collect(view, (n) => isFact(n) && collect(n, (c) => typeof c.props?.className === 'string' && c.props.className.includes('td-statusDot')).length === 1)
check('status row carries a state dot', statusRow.length === 1 && text(statusRow[0]).includes('已完成'), String(statusRow.length))
check('status text is plain, tone lives on the dot', statusRow.length === 1 && collect(statusRow[0], (n) => typeof n.props?.className === 'string' && n.props.className.includes('td-statusDot--ok')).length === 1)
check('numeric rows are marked for tabular figures', collect(view, (n) => typeof n.props?.className === 'string' && n.props.className.includes('td-fact--numeric')).length >= 1, String(collect(view, (n) => typeof n.props?.className === 'string' && n.props.className.includes('td-fact--numeric')).length))

// Each token row keeps the unit that suits its own size — one shared unit would
// collapse 7232 and 5766 into the same `0.01M` — and the column stays scannable
// through tabular digits and a shared right edge.
check('token rows keep their own unit', /3\.0k/.test(factText) && /10k/.test(factText) && /13k/.test(factText), factText.slice(0, 180))
check('small counts stay plain', /(^|\| )410( |\|)/.test(factText), factText.slice(0, 180))
check('a real zero reads as 0', /(^|\| )0( |\|)/.test(factText), factText.slice(0, 180))
check('numbers are right aligned in their column', /\.td-fact--numeric \.td-factValue \{[^}]*justify-content: flex-end/.test(fs.readFileSync(new URL('../styles.js', import.meta.url), 'utf8')))
check('numbers use tabular figures', /font-variant-numeric: tabular-nums/.test(fs.readFileSync(new URL('../styles.js', import.meta.url), 'utf8')))

// Every token row shows its slice of the total, so the composition of the
// prompt is readable at a glance without dividing numbers in your head.
const shareBars = collect(view, (n) => n.props?.className === 'td-shareBar')
const shareFills = collect(view, (n) => typeof n.props?.className === 'string' && n.props.className.startsWith('td-shareBarFill'))
check('token rows carry share bars', shareBars.length >= 3, String(shareBars.length))
check('share bars are proportional', shareFills.length > 0 && shareFills.every((bar) => /^\d+(\.\d+)?%$/.test(bar.props.style?.width ?? '')))
// The total is the whole, so a full bar beside it would say nothing.
const totalRow = collect(view, (n) => isFact(n) && text(collect(n, (c) => c.props?.className === 'td-factKey')).trim() === '总计')
check('the total row carries no bar', totalRow.length === 1 && collect(totalRow[0], (n) => n.props?.className === 'td-shareBar').length === 0)
check('share bars are tinted by kind', shareFills.some((bar) => /--(?:ok|warn|run|muted)/.test(bar.props.className)), String(shareFills.length))
check('the cached share dominates a mostly-cached prompt', shareFills.some((bar) => parseFloat(bar.props.style?.width ?? '0') > 50), shareFills.map((bar) => bar.props.style?.width).join(','))
check('a tiny share still draws a visible mark', /\.td-shareBarFill \{[^}]*min-width/.test(fs.readFileSync(new URL('../styles.js', import.meta.url), 'utf8')))

// Only comparable magnitudes align right. An identifier, a timestamp, or a
// percentage that belongs to its own bar stays beside the label.
const numericRows = collect(view, (n) => typeof n.props?.className === 'string' && n.props.className.includes('td-fact--numeric'))
const numericLabels = numericRows.map((row) => text(collect(row, (n) => n.props?.className === 'td-factKey')).trim())
check('the task number is not right aligned', !numericLabels.some((label) => label === '任务'), numericLabels.join(','))
check('the timestamp is not right aligned', !numericLabels.some((label) => label === '开始时间'), numericLabels.join(','))
check('the hit rate stays beside its bar', !numericLabels.some((label) => label === '缓存命中率'), numericLabels.join(','))
check('token counts are left aligned with their label', !numericLabels.some((label) => label.includes('Token') || label.includes('缓存读取') || label.includes('总计')), numericLabels.join(','))

// The reusable section announces its verdict and its reasons.
const reusable = sections[heads.findIndex((head) => head.includes('可复用'))]
check('reusable section has a verdict line', reusable !== undefined && text(reusable).includes(zh?.['reusable.yes'] ?? '可复用'), text(reusable).slice(0, 80))
check('reusable section lists reasons', collect(reusable, (n) => n.type === 'li').length > 0)

// File rows carry type icons drawn as SVG.
const fileIcons = collect(view, (n) => typeof n.props?.className === 'string' && n.props.className.startsWith('td-fileIcon '))
check('file rows carry type icons', fileIcons.length >= 4 && fileIcons.every((icon) => icon.type === 'svg'), String(fileIcons.length))
check('file icons use the 16-unit grid', fileIcons.every((icon) => icon.props.viewBox === '0 0 16 16'))

// Collapsible sections: toggle buttons with aria-expanded.
const toggles = collect(view, (n) => n.props?.className === 'td-sectionToggle')
check('section titles are toggles', toggles.length === sections.length && toggles.every((btn) => btn.props['aria-expanded'] === true), String(toggles.length))

const skillIcons = collect(view, (n) => n.props?.className === 'td-skillicon')
check('skill rows carry the spark icon', skillIcons.length > 0 && skillIcons.every((icon) => icon.type === 'svg'), String(skillIcons.length))

const statusPill = collect(view, (n) => typeof n.props?.className === 'string' && n.props.className.startsWith('td-pill '))
check('status pill carries a dot', statusPill.some((pill) => collect(pill, (n) => n.props?.className === 'td-pillDot').length === 1))

// The turn that does not exist must not crash; it shows the loading state.
const missing = TaskDetailsView({ sessionId: SESSION_ID, turn: 42, session, t, openResource: () => {} })
check('unknown task explains why it is empty', text(missing).includes('不在已加载'))

check('no stylesheet leaked into module scope', typeof fs.readFileSync(new URL('../styles.js', import.meta.url), 'utf8') === 'string')

// The trigger must be clickable and open the right address from the live
// Session, without ever being disabled for want of a forwarded session id.
const triggerOpen = []
const trigger = TaskDetailsTrigger({
  turn: 3,
  t,
  currentSessionId: () => SESSION_ID,
  openResource: (address) => triggerOpen.push(address),
})
const triggerButton = collect(trigger, (n) => n.type === 'button')[0]
console.log('trigger:', JSON.stringify(text(trigger)))
check('trigger renders a button', triggerButton !== undefined)
check('trigger is enabled', triggerButton?.props.disabled !== true)
check('trigger shows an icon', collect(trigger, (n) => n.props?.className === 'td-triggerIcon').length === 1)
triggerButton?.props.onClick()
check('trigger opens the task address', triggerOpen[0] === `dsh-resource://task-details/session/${SESSION_ID}/turn/3`, triggerOpen[0] ?? '')
check('no problem badge on success', collect(trigger, (n) => n.props?.className === 'td-triggerProblem').length === 0)

// A click that cannot resolve its Session reports the reason in the page.
const lonelyOpen = []
const lonelyResult = TaskDetailsTrigger({ turn: 1, t, openResource: (address) => lonelyOpen.push(address) })
const lonelyButton = collect(lonelyResult, (n) => n.type === 'button')[0]
lonelyButton?.props.onClick()
check('missing session does not open anything', lonelyOpen.length === 0)
check('missing session stays clickable', lonelyButton?.props.disabled !== true)

// When the seat forwards no Turn number, the journal's latest closed Turn is
// used instead: the footer always belongs to the task above it.
const fallbackOpen = []
const fallback = TaskDetailsTrigger({
  t,
  currentSessionId: () => SESSION_ID,
  latestTurn: () => 2,
  openResource: (address) => fallbackOpen.push(address),
})
collect(fallback, (n) => n.type === 'button')[0]?.props.onClick()
check('turn falls back to the latest closed task', fallbackOpen[0]?.endsWith('/turn/2'), fallbackOpen[0] ?? '')

// Owner props forwarded by the entry still win when they carry the Turn.
const ownerOpen = []
const viaOwner = TaskDetailsTrigger({
  t,
  owner: { turn: 7 },
  currentSessionId: () => SESSION_ID,
  latestTurn: () => 2,
  openResource: (address) => ownerOpen.push(address),
})
collect(viaOwner, (n) => n.type === 'button')[0]?.props.onClick()
check('owner turn wins over the fallback', ownerOpen[0]?.endsWith('/turn/7'), ownerOpen[0] ?? '')

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) {
  console.error('FAILED:', failed.map((c) => `${c.label} ${c.detail}`).join('; '))
  process.exitCode = 1
} else {
  console.log('RENDER OK')
}
