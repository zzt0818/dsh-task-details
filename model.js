/** @type {string} The tab kind this package owns. */
export const DETAILS_KIND = 'task-details'
/** @type {string} This implementation's identity in the tab system, and the key its body registers under. */
export const DETAILS_ID = 'dsh-task-details'
/** @type {string} Locale namespace. */
export const NS = 'taskDetails'
/** @type {string} Preference key shared by every tab of this type. */
export const PREFERENCE_KEY = 'dsh.task-details.v1'
/** @type {number} Panel width bounds, in CSS pixels. */
export const WIDTH_MIN = 320
export const WIDTH_MAX = 860
export const WIDTH_DEFAULT = 460
/** @type {number} Width at or above which file rows expand into full detail. */
export const WIDTH_DETAILED = 560
/** @type {number} Width below which the panel switches to the stacked single column. */
export const WIDTH_STACKED = 430
/** @type {number} Route served by the Host half. */
export const DETAILS_ROUTE = '/api/plugins/ui-task-details/describe'
export const JOURNAL_ROUTE = '/api/plugins/ui-task-details/journal'

/**
 * Build the address of one task's tab.
 * @param {string} sessionId Session owning the task.
 * @param {number} turn Turn number.
 * @returns {string} a `dsh-resource://` address.
 */
export function taskAddress(sessionId, turn) {
  return `dsh-resource://${DETAILS_KIND}/session/${encodeURIComponent(sessionId)}/turn/${turn}`
}

/**
 * Read the Session id and Turn number back out of an address.
 * @param {string} address recorded tab address.
 * @returns {{ sessionId: string, turn: number } | null} parsed coordinates.
 */
export function parseTaskAddress(address) {
  if (typeof address !== 'string') return null
  const match = /^dsh-resource:\/\/task-details\/session\/([^/]+)\/turn\/(\d+)\/?$/.exec(address)
  if (match === null) return null
  const turn = Number(match[2])
  if (!Number.isFinite(turn) || turn <= 0) return null
  return { sessionId: decodeURIComponent(match[1]), turn }
}

/**
 * Read the token total recorded by one usage record.
 *
 * The journal records `inputTokens`/`outputTokens`; an attempt may also carry
 * `cacheReadTokens` and `reasoningTokens`. The panel shows each bucket and this
 * figure together, so both naming schemes resolve here.
 *
 * @param {object | undefined} usage one usage record.
 * @param {'input' | 'output' | 'cacheRead' | 'cacheWrite' | 'reasoning' | 'total'} bucket bucket name.
 * @returns {number | undefined} token count.
 */
export function usageBucket(usage, bucket) {
  if (usage === null || typeof usage !== 'object') return undefined
  const aliases = {
    input: ['input', 'inputTokens'],
    output: ['output', 'outputTokens'],
    cacheRead: ['cacheRead', 'cacheReadTokens'],
    cacheWrite: ['cacheWrite', 'cacheWriteTokens'],
    reasoning: ['reasoning', 'reasoningTokens'],
    total: ['total', 'totalTokens'],
  }
  for (const key of aliases[bucket] ?? []) {
    const value = usage[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

/**
 * Format a byte count for display.
 * @param {number | undefined} bytes byte count.
 * @returns {string} formatted size or an empty string.
 */
export function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`
}

/**
 * Format a token count compactly.
 * @param {number | undefined} value token count.
 * @returns {string} formatted count or an empty string.
 */
export function formatCount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 2)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`
  return String(Math.round(value))
}

/**
 * Format a duration.
 * @param {number | undefined} ms milliseconds.
 * @returns {string} formatted duration or an empty string.
 */
export function formatDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  if (minutes < 60) return `${minutes}m ${rest}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

/**
 * Format an absolute timestamp in the reader's locale.
 * @param {number | undefined} time epoch milliseconds.
 * @returns {string} formatted date-time or an empty string.
 */
export function formatTime(time) {
  if (typeof time !== 'number' || !Number.isFinite(time)) return ''
  try {
    return new Date(time).toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return new Date(time).toISOString()
  }
}

/**
 * Clamp one panel width into the allowed range.
 * @param {unknown} value requested width.
 * @returns {number} clamped width.
 */
export function clampWidth(value) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : WIDTH_DEFAULT
  return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Math.round(numeric)))
}

/**
 * Hide the home directory in a displayed path without losing the tail.
 * @param {string} filePath absolute path.
 * @returns {string} path with the user profile abbreviated.
 */
export function prettyPath(filePath) {
  if (typeof filePath !== 'string') return ''
  const match = /^([A-Za-z]:\\Users\\[^\\]+)/.exec(filePath)
  if (match !== null) return `~${filePath.slice(match[1].length)}`
  const posix = /^\/(?:home|Users)\/[^/]+/.exec(filePath)
  if (posix !== null) return `~${filePath.slice(posix[0].length)}`
  return filePath
}

/**
 * The nearest directory part of one path.
 * @param {string} filePath a path.
 * @returns {string} directory text.
 */
export function directoryOf(filePath) {
  if (typeof filePath !== 'string') return ''
  const index = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  return index <= 0 ? '' : filePath.slice(0, index)
}

/**
 * Turn one absolute path into the `dsh-resource://file/` address the shipped
 * file preview accepts.
 *
 * The preview parses the address as a URI, so a Windows drive letter travels
 * as a leading path segment (`/D:/work/file.txt`) instead of `D:/work/...`,
 * which the URL parser would read as a scheme.
 *
 * @param {string} sessionId Session whose filesystem maps the path.
 * @param {string} filePath absolute path.
 * @returns {string | null} address, or null when the path is not absolute.
 */
export function fileAddress(sessionId, filePath) {
  if (typeof filePath !== 'string' || filePath === '') return null
  const isDrive = /^[A-Za-z]:[\\/]/.test(filePath)
  const isPosix = filePath.startsWith('/')
  const isUnc = filePath.startsWith('\\\\')
  if (!isDrive && !isPosix && !isUnc) return null
  const slashed = filePath.replace(/\\/g, '/')
  const absolute = isDrive ? `/${slashed}` : slashed
  const encoded = absolute
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `dsh-resource://file/session/${encodeURIComponent(sessionId)}${encoded}`
}

/** Shells recognized for the language summary. */
const SHELLS = new Set(['pwsh', 'powershell', 'bash', 'exec_command', 'write_stdin', 'cmd', 'sh', 'zsh', 'terminal'])
/** Extension to language for scripts and code files. */
const LANGUAGES = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.ps1': 'PowerShell',
  '.psm1': 'PowerShell',
  '.sh': 'Shell',
  '.bat': 'Batch',
  '.cmd': 'Batch',
  '.json': 'JSON',
  '.jsonl': 'JSONL',
  '.yml': 'YAML',
  '.yaml': 'YAML',
  '.md': 'Markdown',
  '.css': 'CSS',
  '.html': 'HTML',
  '.sql': 'SQL',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.cs': 'C#',
  '.c': 'C',
  '.cpp': 'C++',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.toml': 'TOML',
  '.xml': 'XML',
  '.svg': 'SVG',
}

/**
 * Summarize the languages, shells, and skills one task touched.
 * @param {object} model panel model.
 * @returns {{ shells: string[], languages: string[], toolNames: string[], commandRuns: number }} summary.
 */
export function languageSummary(model) {
  const shells = new Set()
  for (const tool of model.tools ?? []) {
    if (SHELLS.has(tool.name)) shells.add(tool.name === 'exec_command' || tool.name === 'write_stdin' ? 'shell' : tool.name)
  }
  const languages = new Set()
  for (const file of model.files ?? []) {
    const index = file.path.lastIndexOf('.')
    if (index < 0) continue
    const extension = file.path.slice(index).toLowerCase()
    const language = LANGUAGES[extension]
    if (language !== undefined) languages.add(language)
  }
  return {
    shells: [...shells],
    languages: [...languages].sort(),
    toolNames: (model.tools ?? []).map((tool) => tool.name),
    commandRuns: model.commandRuns ?? 0,
  }
}

/**
 * Decide whether the task left something worth turning into a local skill.
 * @param {object} model panel model.
 * @returns {{ reusable: boolean, reasons: { key: string, params?: object }[] }} verdict.
 */
export function reuseVerdict(model) {
  const reasons = []
  if ((model.delivered ?? []).length > 0) reasons.push({ key: 'reusable.delivered' })
  if ((model.skills ?? []).length > 0) reasons.push({ key: 'reusable.skill', params: { names: model.skills.map((skill) => skill.name).join(', ') } })
  const scripts = (model.sections?.output ?? []).filter((file) => /\.(ps1|sh|bat|cmd|py|mjs|cjs|js|ts)$/i.test(file.path))
  if (scripts.length > 0) reasons.push({ key: 'reusable.artifact' })
  const projectWrites = (model.sections?.output ?? []).filter((file) => file.role === 'write').length
  if (reasons.length === 0 && projectWrites > 0) reasons.push({ key: 'reusable.project' })
  return { reusable: reasons.length > 0, reasons }
}
