/**
 * The task-details view: the resizable frame and every block the sketch asks
 * for. Layout turns compact cards into full detail tables as the panel grows.
 */
import { buildTaskModel, foldTurns, summarizeCall, summarizeOutcome, summarizePhases } from './analyzer.js'
import { buildIcon, iconKindForFile } from './icons.js'
import {
  DETAILS_ROUTE,
  JOURNAL_ROUTE,
  WIDTH_MAX,
  WIDTH_MIN,
  directoryOf,
  fileAddress,
  formatBytes,
  formatCount,
  formatCurrency,
  formatDuration,
  formatTime,
  languageSummary,
  prettyPath,
  reuseVerdict,
  usageBucket,
} from './model.js'
import { DETAILS_PREFERENCE_KEY, readWidth, subscribeWidth, writeWidth } from './preference.js'

/** @type {object} */
let React
/** @type {Function} */
let h

/** Copy keys for a footer click that cannot resolve its task. */
const PROBLEM_COPY = {
  'no session': 'problem.noSession',
  'no turn': 'problem.noTurn',
}

/** Storage key for the per-reader collapsed-section set. */
const SECTIONS_PREFERENCE_KEY = DETAILS_PREFERENCE_KEY + '.sections'

/** Sections open by default; collapsing is opt-in per block. */
const DEFAULT_OPEN_SECTIONS = null

/** Every collapsible section id, in render order, for bulk toggling. */
const SECTION_IDS = ['overview', 'inputs', 'intermediate', 'outputs', 'tools', 'language', 'reusable', 'flow']

/**
 * Read the persisted collapsed-section ids.
 * @returns {string[]} ids.
 */
function readCollapsedSections() {
  try {
    const raw = window.localStorage.getItem(SECTIONS_PREFERENCE_KEY)
    if (raw === null) return DEFAULT_OPEN_SECTIONS ?? []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

/**
 * Persist the collapsed-section ids.
 * @param {string[]} ids collapsed ids.
 */
function writeCollapsedSections(ids) {
  try {
    window.localStorage.setItem(SECTIONS_PREFERENCE_KEY, JSON.stringify(ids))
  } catch {
    /* storage is optional; a blocked write only costs persistence */
  }
}

/**
 * Toggle one section in the collapsed set.
 * @param {string[]} collapsed current ids.
 * @param {string} id section id.
 * @returns {string[]} next ids.
 */
function toggleCollapsed(collapsed, id) {
  return collapsed.includes(id) ? collapsed.filter((entry) => entry !== id) : [...collapsed, id]
}

/**
 * Subscribe to collapsed-section changes from other tabs.
 * @param {(ids: string[]) => void} listener reader.
 * @returns {() => void} unsubscribe.
 */
function subscribeCollapsed(listener) {
  const handler = (event) => {
    if (event.key !== SECTIONS_PREFERENCE_KEY || event.newValue === null) return
    try {
      const parsed = JSON.parse(event.newValue)
      if (Array.isArray(parsed)) listener(parsed.filter((id) => typeof id === 'string'))
    } catch {
      /* ignore malformed cross-tab values */
    }
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

/**
 * One Host journal request per Session, shared by every task tab.
 *
 * Opening five tasks of one Session must fetch and decode that log once, not
 * five times. A rejected request is dropped so a later open can retry.
 */
const journalRequests = new Map()

/**
 * Configure the module with the browser module table's React.
 * @param {object} runtime injected modules.
 */
export function configure(runtime) {
  React = runtime.React
  h = React.createElement
}

/**
 * Ask the Host half for filesystem truth about the task's paths.
 * @param {{ sessionId: string, paths: string[], signal: AbortSignal }} request describe request.
 * @returns {Promise<object>} describe payload.
 */
export async function describeTask(request) {
  const response = await fetch(DETAILS_ROUTE, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: request.sessionId, paths: request.paths }),
    signal: request.signal,
  })
  if (!response.ok) throw new Error(`task-details describe failed: ${response.status}`)
  return await response.json()
}

/**
 * Estimate a cost from optional per-million-token rates.
 */
/**
 * Format an estimated cost.
 * @param {number} value cost in the provider's currency unit.
 * @returns {string} formatted cost.
 */
function formatCost(value) {
  return formatCurrency(value)
}

function estimateCost(usage, price) {
  if (usage === undefined || price === undefined) return undefined
  let cost = 0
  let known = false
  for (const bucket of ['input', 'output', 'cacheRead', 'cacheWrite']) {
    const rate = price[bucket]
    const tokens = usageBucket(usage, bucket)
    if (typeof rate !== 'number' || typeof tokens !== 'number' || tokens === 0) continue
    known = true
    cost += (tokens / 1_000_000) * rate
  }
  return known ? cost : undefined
}

/**
 * Snapshot one journal window into the shape the fold consumes.
 * @param {object | undefined} source the Session's event source.
 * @returns {{ entries: object[], revision: number }} window.
 */
function journalSnapshot(source) {
  const snapshot = source?.getSnapshot?.()
  return { entries: snapshot?.entries ?? [], revision: snapshot?.revision ?? 0 }
}

/**
 * Subscribe to one Session journal and return its loaded entry window.
 */
/**
 * Fetch one Session's journal through the shared cache.
 *
 * @param {string} sessionId Session id.
 * @param {boolean} [force] drop a cached success and fetch again.
 * @returns {Promise<object[]>} durable events in ascending seq order.
 */
function loadJournal(sessionId, force = false) {
  if (force) journalRequests.delete(sessionId)
  const pending = journalRequests.get(sessionId)
  if (pending !== undefined) return pending
  const request = fetch(`${JOURNAL_ROUTE}?sessionId=${encodeURIComponent(sessionId)}`, {
    credentials: 'same-origin',
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(String(response.status))
      const payload = await response.json()
      if (!payload.ok) throw new Error(payload.error ?? 'journal-failed')
      return payload.events ?? []
    })
    .catch((error) => {
      journalRequests.delete(sessionId)
      throw error
    })
  journalRequests.set(sessionId, request)
  return request
}

function useJournal(session, sessionId) {
  const source = session?.eventSource
  /**
   * Read whatever this Session already holds in memory.
   * @returns {{ owner: string | undefined, entries: object[], origin: string }} seed.
   */
  const seed = () => {
    const entries = source?.getSnapshot?.()?.entries ?? []
    return {
      owner: sessionId,
      entries,
      origin: entries.length > 0 ? 'binding' : 'fetching',
      error: undefined,
    }
  }

  // Seeded from the binding so the first paint already has content when the
  // Session is loaded; a Session this tab never opened starts as 'fetching'.
  const [state, setState] = React.useState(seed)
  // A retry after a Host failure must bypass the shared request cache and
  // re-run the effect; the failed request already deleted its cache entry, so
  // only the tick is needed.
  const [retryTick, setRetryTick] = React.useState(0)
  const retry = React.useCallback(() => setRetryTick((value) => value + 1), [])

  React.useEffect(() => {
    if (typeof sessionId !== 'string') return undefined
    let alive = true
    const adopt = (entries, origin, error) => {
      if (!alive) return
      setState({ owner: sessionId, entries, origin, error })
    }
    // A retry renders the skeleton again instead of leaving the error text
    // frozen on screen while the new request is in flight.
    if (retryTick > 0) setState({ owner: sessionId, entries: [], origin: 'fetching', error: undefined })

    // Show the binding immediately when it carries events.
    const live = source?.getSnapshot?.()?.entries ?? []
    if (live.length > 0) adopt(live, 'binding', undefined)

    // Follow the binding while it loads or grows.
    const unsubscribe = source?.subscribe?.(() => {
      const next = source.getSnapshot?.()?.entries ?? []
      if (next.length > 0) adopt(next, 'binding', undefined)
    })

    // Also fetch the persisted journal: it is the only source for a Session
    // that is not rendered in this tab, and a fast fallback otherwise.
    loadJournal(sessionId, retryTick > 0)
      .then((events) => {
        if (!alive) return
        setState((previous) =>
          previous.entries.length > 0
            ? previous
            : { owner: sessionId, entries: events.map((event) => ({ event })), origin: 'host', error: undefined },
        )
      })
      .catch((error) => {
        if (!alive) return
        setState((previous) =>
          previous.entries.length > 0
            ? previous
            : { owner: sessionId, entries: [], origin: 'host-failed', error: String(error?.message ?? error) },
        )
      })

    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [sessionId, source, retryTick])

  // A render for a different Session never shows the previous one's entries.
  return state.owner === sessionId ? { ...state, retry } : { owner: sessionId, entries: [], origin: 'fetching', error: undefined, retry }
}
/**
 * Load Host file metadata for a task's paths, refreshing while mounted.
 *
 * A pre-resolved `override` payload skips the round trip, which keeps tests
 * deterministic and lets a host that already holds the answer render it.
 */
function useMetadata(model, sessionId, override) {
  const [state, setState] = React.useState(() =>
    override === undefined
      ? { map: new Map(), memory: [], artifacts: [], state: 'idle', revision: undefined, home: undefined }
      : {
          map: new Map((override.files ?? []).map((file) => [file.path, file])),
          memory: override.memory ?? [],
          artifacts: override.artifacts ?? [],
          state: 'ready',
          revision: override.revision,
          home: override.home,
        },
  )
  const paths = model === null ? '' : model.files.map((file) => file.path).join('\n')
  const active = model !== null && override === undefined
  // Bumping this re-runs the loader for a manual refresh or a retry after an
  // error. React re-runs the effect, which also resets the polling interval.
  const [refreshTick, setRefreshTick] = React.useState(0)
  const refresh = React.useCallback(() => setRefreshTick((value) => value + 1), [])
  // The home directory is needed to make attachment rows clickable, and it is
  // reported even for an empty path list. Asking once, as soon as the panel
  // opens, means the very first paint can already open an attachment instead
  // of waiting for the per-file round trip.
  const [home, setHome] = React.useState(() => override?.home)
  React.useEffect(() => {
    if (override !== undefined || typeof home === 'string') return undefined
    const controller = new AbortController()
    describeTask({ sessionId, paths: [], signal: controller.signal })
      .then((payload) => {
        if (typeof payload.home === 'string' && payload.home !== '') setHome(payload.home)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [sessionId, override, home])
  React.useEffect(() => {
    if (!active) return undefined
    const controller = new AbortController()
    const load = async (first) => {
      try {
        if (first) setState((prev) => ({ ...prev, state: 'loading' }))
        const payload = await describeTask({
          sessionId,
          paths: paths.split('\n').filter(Boolean),
          signal: controller.signal,
        })
        const map = new Map()
        for (const file of payload.files ?? []) map.set(file.path, file)
        setState((prev) =>
          prev.revision === payload.revision
            ? { ...prev, state: 'ready' }
            : {
                map,
                memory: payload.memory ?? [],
                artifacts: payload.artifacts ?? [],
                state: 'ready',
                revision: payload.revision,
              },
        )
      } catch (error) {
        if (error?.name === 'AbortError') return
        setState((prev) => ({ ...prev, state: 'error' }))
      }
    }
    load(true)
    const timer = window.setInterval(() => load(false), 30_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [paths, sessionId, active, refreshTick])
  // `busy` is only true for the first load or an explicit refresh: the quiet
  // 30s polling keeps showing the last good data instead of flashing a state.
  return { ...state, home: home ?? state.home, refresh }
}

/**
 * Read the shared panel width preference.
 */
function usePanelWidth() {
  const [width, setWidth] = React.useState(() => readWidth(DETAILS_PREFERENCE_KEY))
  React.useEffect(() => subscribeWidth(setWidth), [])
  return [width, React.useCallback((next) => writeWidth(DETAILS_PREFERENCE_KEY, next), [])]
}

/**
 * One metric cell.
 *
 * When a target section is given the cell becomes a button that scrolls to
 * that section, so a number on top answers "what is behind it" in one click.
 *
 * @param {string} label headline.
 * @param {string | undefined} value formatted count; empty hides the cell.
 * @param {{ target?: string, title?: string } | undefined} options link extras.
 * @returns {object | null} element.
 */
function metric(label, value, options, onJump) {
  if (value === '' || value === undefined || value === null) return null
  if (options?.target === undefined) {
    return h(
      'div',
      { className: 'td-metric', key: `m-${label}` },
      h('div', { className: 'td-metricLabel' }, label),
      h('div', { className: 'td-metricValue' }, value),
    )
  }
  return h(
    'button',
    {
      type: 'button',
      className: 'td-metric td-metric--link',
      key: `m-${label}`,
      title: options.title ?? label,
      onClick: () => (onJump ?? scrollToSection)(options.target),
    },
    h('div', { className: 'td-metricLabel' }, label),
    h('div', { className: 'td-metricValue' }, value),
  )
}

/**
 * Scroll one named section into view. A no-op guard keeps the call safe in
 * environments without a document; the smooth behaviour is CSS-driven, so a
 * reader with reduced motion never sees the panel scroll itself fly.
 * @param {string} id section id.
 */
function scrollToSection(id) {
  if (typeof document === 'undefined') return
  const node = document.querySelector(`[data-section="${id}"]`)
  node?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
}

/**
 * One label/value row in the overview.
 *
 * A definition-list row keeps a long value on its own line instead of clipping
 * it: fixed-width cards forced a timestamp and a model name into ellipses,
 * which told the reader nothing.
 *
 * An optional extra element rides at the end of the same row, so a value can
 * carry a small visual (a bar, a unit) without breaking the list into a stray
 * unlabelled line — that stray line was what made the overview read unevenly.
 *
 * @param {string} label row label.
 * @param {string} value row value.
 * @param {string} [tone] optional emphasis: "ok", "run", or "warn".
 * @param {object} [extra] element rendered after the value in the same row.
 * @returns {object | null} element.
 */
function fact(label, value, tone, extra) {
  if (value === '' || value === undefined) return null
  // Only counts that a reader compares with their neighbours are pushed to the
  // right edge. An identifier such as a task number, a timestamp, a percentage
  // beside its own bar, or a duration (each one reads on its own) is not a
  // column of magnitudes: right-aligning those flung them away from the label.
  const text = String(value)
  const comparable = /^\$[\d.,]+$/.test(text) || /^<\$[\d.]+$/.test(text)
  return h(
    'div',
    { className: 'td-fact' + (comparable ? ' td-fact--numeric' : ''), key: 'fact-' + label },
    h('dt', { className: 'td-factKey' }, label),
    h(
      'dd',
      { className: 'td-factValue' + (tone === undefined ? '' : ' td-factValue--' + tone) },
      // A toned value is a state word: the dot carries the colour and the text
      // stays in the ordinary label colour, so the row does not look like a
      // link. Every other value is plain text.
      tone === undefined
        ? h('span', { className: 'td-factText' }, value)
        : [
            h('span', { className: 'td-statusDot td-statusDot--' + tone, 'aria-hidden': true, key: 'dot' }),
            h('span', { className: 'td-factText', key: 'text' }, value),
          ],
      extra ?? null,
    ),
  )
}

/** The empty state of a section. */
function empty(text) {
  return h('div', { className: 'td-empty' }, text)
}

/**
 * Token counts as a readable block.
 *
 * Two ways to make a column comparable: one shared unit, or one shared shape.
 * Sharing the unit looks tidier until the numbers differ by an order of
 * magnitude — 7232 and 5766 both collapse to `0.01M`, so two different figures
 * become indistinguishable. Each row therefore keeps the unit that suits its
 * own size and sits beside a bar sized as its share of the prompt it belongs to.
 *
 * Shares are measured against the prompt total (fresh input + cache read), not
 * against the grand total: a cached turn is often 300x its uncached part, and
 * against a grand total both sides round to a sliver while the interesting
 * comparison — how much of the prompt was reused — disappears into the track.
 * Output and reasoning measure against the tokens generated.
 *
 * The row that is the whole carries no bar, because a full bar beside "total"
 * says nothing.
 *
 * @param {Function} t translator.
 * @param {[string, number | undefined, string?, string?][]} entries label / value / tone / `page` (which block the row belongs to).
 * @param {string} barLabel accessible name of the bars.
 * @returns {object[]} fact rows; rows without a value are dropped.
 */
function tokenFacts(t, entries, barLabel) {
  const present = entries.filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
  // A row with no page is a total: it measures the whole and wears no bar.
  const pages = new Map()
  for (const [, value, , page] of present) {
    if (page === undefined) continue
    pages.set(page, (pages.get(page) ?? 0) + value)
  }
  return present
    .map(([label, value, tone, page]) => {
      const base = page === undefined ? undefined : pages.get(page)
      const share = base > 0 ? Math.min(100, (value / base) * 100) : undefined
      const bar =
        share === undefined
          ? undefined
          : h(
              'span',
              { className: 'td-shareBar', role: 'img', 'aria-label': barLabel + ' ' + share.toFixed(1) + '%', title: share.toFixed(1) + '%' },
              h('span', {
                className: 'td-shareBarFill td-shareBarFill--' + (tone ?? 'muted'),
                // Shares are drawn as the square root of the true ratio. At a
                // 99.7% hit rate the honest linear split is a 1px sliver, which
                // reads as "nothing there" and hides the very thing a reader
                // looks for — that some prompt was processed fresh. The rooted
                // scale keeps the order and the contrast while giving every
                // non-zero share a width the eye can find; the exact percentage
                // stays in the tooltip and the accessible name.
                style: { width: (value === 0 ? 0 : Math.max(2, Math.sqrt(share / 100) * 100)) + '%' },
              }),
            )
      return fact(label, formatCount(value), undefined, bar)
    })
    .filter(Boolean)
}

/**
 * The full text behind a clipped flow chip, one fact per line.
 * @param {object} phase one summarized phase.
 * @param {Function} t translator.
 * @returns {string} multi-line summary for the native tooltip.
 */
function phasePreview(phase, t) {
  return [
    t('phase.' + phase.kind),
    t('flow.steps', { from: phase.firstStep + 1, to: phase.lastStep + 1 }),
    phase.tools.join(' · '),
    phase.failed > 0 ? t('tools.failed', { count: phase.failed }) : null,
    ...phase.sample,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * One file-detail pair; omitted entirely when the value is unknown.
 * @param {Function} t translator.
 * @param {string} labelKey copy key for the label.
 * @param {string} value formatted value; empty means unknown.
 * @returns {object | null} element.
 */
function kv(t, labelKey, value) {
  if (typeof value !== 'string' || value === '') return null
  return h(
    'span',
    { className: 'td-kv' },
    h('span', { className: 'td-kvKey' }, t(labelKey)),
    h('span', { className: 'td-kvValue' }, value),
  )
}

/**
 * One file row; the detail table inside it appears once the panel is wide.
 *
 * Copy feedback is owned by the panel (`copiedPath`), not the row: the test
 * harness renders trees without executing function components, and one shared
 * state also means at most one row claims "copied" at a time.
 *
 * @param {object} input row inputs.
 * @returns {object} element.
 */
function fileRow({ file, sessionId, t, openResource, copied, onCopy }) {
  const address = fileAddress(sessionId, file.path)
  const copyCurrent = () => onCopy(file.path)
  const status = file.exists === true ? 'ok' : file.exists === false ? 'missing' : 'unknown'
  const roleLabel = t(
    file.role === 'read' ? 'file.role.read' : file.role === 'deliver' ? 'file.role.deliver' : 'file.role.write',
  )
  const isCopied = copied === file.path
  const glyph = iconKindForFile(file)
  return h(
    'div',
    { className: 'td-fileRow', key: file.path, title: file.path },
    h(
      'div',
      { className: 'td-fileHead' },
      buildIcon(h, glyph, `td-fileIcon ${status}`, 12),
      h(
        'button',
        {
          type: 'button',
          className: 'td-fileName',
          disabled: address === null,
          onClick: () => address !== null && openResource(address),
          title: file.path,
        },
        file.name,
      ),
      h('span', { className: `td-fileBadge badge--${file.role}` }, roleLabel),
      h('span', { className: 'td-fileSize' }, formatBytes(file.size)),
      h(
        'button',
        {
          type: 'button',
          className: isCopied ? 'td-iconButton td-iconButton--copied' : 'td-iconButton',
          title: t(isCopied ? 'file.copied' : 'file.reveal'),
          'aria-label': t(isCopied ? 'file.copied' : 'file.reveal'),
          onClick: copyCurrent,
        },
        isCopied ? '\u2713' : '\u29C9',
      ),
    ),
    h('div', { className: 'td-filePath' }, prettyPath(directoryOf(file.path))),
    h(
      'div',
      { className: 'td-fileMeta' },
      // Unknown facts are omitted rather than printed as a row of dashes: a
      // row of "—" is longer than the row it describes and says nothing.
      kv(t, 'file.size', formatBytes(file.size)),
      kv(t, 'file.modified', formatTime(file.mtime)),
      typeof file.lines === 'number' ? kv(t, 'file.lines', String(file.lines)) : null,
      status === 'unknown'
        ? null
        : h(
            'span',
            { className: 'td-kv' },
            h('span', { className: 'td-kvKey' }, t('file.kind.file')),
            h(
              'span',
              { className: `td-kvValue${status === 'missing' ? ' warn' : ''}` },
              status === 'missing' ? t('file.missing') : t('file.exists'),
            ),
          ),
    ),
    h('div', { className: 'td-fileTools' }, (file.sources ?? []).join(' \u00B7 ')),
  )
}

/**
 * The trigger's document glyph, from the shared icon set at the trigger's size.
 * @returns {object} element.
 */
function detailsIcon() {
  return buildIcon(h, 'doc', 'td-triggerIcon', 15)
}

/**
 * The "view details" control rendered under every finished task.
 *
 * The Turn number arrives on the seat owner (`props.turn`). The Session id is
 * resolved lazily, at click time: the seat does not forward one, and the
 * Session-scoped position proves the active Session is the right one.
 *
 * A click that cannot do its job reports the reason beside the button instead
 * of failing silently, so a misconfiguration is visible in the page and not
 * only in the console.
 */
export function TaskDetailsTrigger({ turn: turnProp, node, t, currentSessionId, latestTurn, openResource, owner, sessionId: seatSessionId }) {
  // Every finished task renders exactly one of these, in task order. When the
  // seat forwards no Turn number, the position of this DOM node among its
  // peers is the Turn: the footer of the third task is the third button.
  const anchorRef = React.useRef(null)
  const candidates = [turnProp, node?.data?.turn, owner?.turn, owner?.node?.data?.turn]
  const turnFromProps = candidates.find((value) => typeof value === 'number')
  const [problem, setProblem] = React.useState('')

  /**
   * Read the 1-based position of this footer among the rendered footers.
   * @returns {number | undefined} position when it can be established.
   */
  const turnFromPosition = () => {
    const anchor = anchorRef.current
    if (anchor === null || typeof document === 'undefined') return undefined
    // Chat marks each completed task's footer with the Turn number itself, and
    // this button renders inside that footer, so the enclosing node answers
    // exactly and needs no guessing about order.
    const footer = typeof anchor.closest === 'function' ? anchor.closest('[data-turn-tail]') : null
    const marked = Number(footer?.getAttribute('data-turn-tail'))
    if (Number.isFinite(marked) && marked > 0) return marked
    const all = [...document.querySelectorAll('[data-turn-tail]')]
    const index = all.findIndex((node) => node.contains(anchor))
    if (index < 0) return undefined
    const fallback = Number(all[index].getAttribute('data-turn-tail'))
    return Number.isFinite(fallback) && fallback > 0 ? fallback : index + 1
  }

  const open = () => {
    const sessionId =
      (typeof seatSessionId === 'string' ? seatSessionId : undefined) ??
      (typeof owner?.sessionId === 'string' ? owner.sessionId : undefined) ??
      (typeof currentSessionId === 'function' ? currentSessionId() : undefined)
    if (typeof sessionId !== 'string' || sessionId === '') {
      setProblem(t(PROBLEM_COPY['no session']))
      return
    }
    const turn = turnFromProps ?? turnFromPosition() ?? (typeof latestTurn === 'function' ? latestTurn() : undefined)
    if (typeof turn !== 'number' || !Number.isFinite(turn)) {
      setProblem(t(PROBLEM_COPY['no turn']))
      return
    }
    setProblem('')
    try {
      openResource('dsh-resource://task-details/session/' + encodeURIComponent(sessionId) + '/turn/' + turn)
    } catch (error) {
      setProblem(String(error?.message ?? error).slice(0, 140))
    }
  }

  return h(
    'span',
    { className: 'td-triggerWrap', ref: anchorRef },
    h(
      'button',
      {
        type: 'button',
        className: 'td-trigger',
        title: t('button.title'),
        'aria-label': t('button.title'),
        onClick: open,
      },
      detailsIcon(),
      h('span', { className: 'td-triggerLabel' }, t('button.label')),
      h('span', { className: 'td-triggerChevron', 'aria-hidden': true }, '\u203A'),
    ),
    problem === '' ? null : h('span', { className: 'td-triggerProblem', role: 'status' }, problem),
  )
}


/** The panel view. */
export function TaskDetailsView({ sessionId, turn, session, price, t, openResource, describe }) {
  const journal = useJournal(session, sessionId)

  // The task identity is part of every derivation below. When a tab is reused
  // for another task, React keeps this component mounted; reading the journal
  // for the new Session or folding the new Turn must not reuse the old result.
  const taskKey = sessionId + '#' + turn
  const fold = React.useMemo(() => foldTurns(journal.entries), [journal.entries, taskKey])
  const model = React.useMemo(
    () => buildTaskModel(fold, turn, { cwd: session?.cwd, sessionId }),
    [fold, turn, sessionId, taskKey, session?.cwd],
  )
  // Whether the task has been folded yet. Declared before any other hook so the
  // empty state and the loaded state run exactly the same hooks.
  const ready = model !== null
  const metadata = useMetadata(model, sessionId, describe)
  // The Host answers for the paths it was asked about, which for an attachment
  // is the store-relative reference. It echoes the absolute path it resolved,
  // so a row matches on its own requested path and then adopts that absolute
  // path for display.
  // An attachment is identified in the journal only by its store-relative
  // path. Until the Host answers, that reference cannot be turned into a
  // clickable address, so the row would stay inert on first paint. Once the
  // Host has reported its home directory, the absolute location can be
  // reconstructed locally and the row opens immediately.
  const resolveAttachment = React.useCallback(
    (filePath) => {
      if (typeof filePath !== 'string' || !/^objects[\\/][0-9a-f]{2}[\\/][0-9a-f]{8,}$/i.test(filePath)) return filePath
      const home = metadata.home
      if (typeof home !== 'string' || home === '') return filePath
      // Exactly one separator between the home directory and the relative
      // reference: a doubled backslash survives into the resource address as
      // an empty path segment, and the preview refuses to open it.
      const tail = filePath.replace(/[\\/]+/g, '\\').replace(/^\\/, '')
      return home.replace(/[\\/]+$/, '') + '\\attachments\\v1\\' + tail
    },
    [metadata.home],
  )
  const withMetadata = React.useCallback(
    (file) => {
      const meta = metadata.map.get(file.path)
      if (meta === undefined) return { ...file, path: resolveAttachment(file.path) }
      const resolved = typeof meta.resolvedPath === 'string' ? meta.resolvedPath : undefined
      return { ...file, ...meta, path: resolved ?? resolveAttachment(file.path) }
    },
    [metadata.map, resolveAttachment],
  )
  const [width, setWidth] = usePanelWidth()
  const [dragging, setDragging] = React.useState(false)
  const phasesRef = React.useRef(null)
  // The flow row fades at its right edge while more chips remain off-screen.
  // Measuring on scroll (and when the content changes) keeps the fade honest
  // instead of always dimming the last chip.
  const [phasesEnd, setPhasesEnd] = React.useState(true)
  const onPhasesScroll = React.useCallback(() => {
    const node = phasesRef.current
    if (node === null) return
    setPhasesEnd(node.scrollLeft + node.clientWidth >= node.scrollWidth - 2)
  }, [])
  React.useEffect(() => {
    onPhasesScroll()
    const node = phasesRef.current
    if (node === null || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(onPhasesScroll)
    observer.observe(node)
    return () => observer.disconnect()
  }, [onPhasesScroll, width])
  // A chip clips its detail line, and the flow row clips its own overflow, so
  // no element inside it can show a popover. This renders one fixed to the
  // viewport instead, positioned from the chip's own box.
  const [preview, setPreview] = React.useState(null)
  const showPreview = React.useCallback((anchor, phase, translator) => {
    if (anchor === null || typeof anchor.getBoundingClientRect !== 'function') return
    const box = anchor.getBoundingClientRect()
    setPreview({ phase, t: translator, x: box.left, y: box.bottom })
  }, [])
  const hidePreview = React.useCallback(() => setPreview(null), [])
  // Copy feedback is panel state, not row state: one row at a time says
  // "copied", and the flag is forgotten after 1.5s so the row returns to its
  // quiet look instead of permanently announcing an old action.
  const [copiedPath, setCopiedPath] = React.useState('')
  const copyTimer = React.useRef(0)
  React.useEffect(() => () => window.clearTimeout(copyTimer.current), [])
  const copyPath = React.useCallback((path) => {
    const done = () => {
      setCopiedPath(path)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopiedPath(''), 1500)
    }
    const fallback = () => {
      // `navigator.clipboard` is unavailable in some insecure contexts and
      // older embedded webviews. A hidden textarea keeps the action working
      // there instead of silently doing nothing.
      try {
        const field = document.createElement('textarea')
        field.value = path
        field.setAttribute('readonly', '')
        field.style.position = 'fixed'
        field.style.opacity = '0'
        document.body.appendChild(field)
        field.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(field)
        if (ok) done()
      } catch {
        /* the row simply stays quiet when copying is refused */
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(path).then(done, fallback)
    } else {
      fallback()
    }
  }, [])
  // Sections the reader collapsed, persisted like the width so a reopen keeps
  // the same reading state. The set is stored as an array of section ids.
  const [collapsed, setCollapsed] = React.useState(() => readCollapsedSections())
  const collapsedRef = React.useRef(collapsed)
  collapsedRef.current = collapsed
  React.useEffect(() => subscribeCollapsed(setCollapsed), [])
  const toggleSection = React.useCallback((id) => {
    const next = toggleCollapsed(collapsedRef.current, id)
    setCollapsed(next)
    writeCollapsedSections(next)
  }, [])
  // One control collapses the whole report when at least one block is open,
  // and opens every block when all are already closed.
  const toggleAllSections = React.useCallback(() => {
    const next = collapsedRef.current.length >= SECTION_IDS.length ? [] : SECTION_IDS.slice()
    setCollapsed(next)
    writeCollapsedSections(next)
  }, [])
  const allCollapsed = collapsed.length >= SECTION_IDS.length
  // Sections open with an animation-fresh mount; a "flash" highlight draws the
  // eye to the block a metric chip jumped to, then fades through CSS.
  const [flashSection, setFlashSection] = React.useState('')
  const flashTimer = React.useRef(0)
  React.useEffect(() => () => window.clearTimeout(flashTimer.current), [])
  const jumpToSection = React.useCallback((id) => {
    // Jumping to a collapsed section would scroll to a heading with no
    // content, so the target is expanded as part of the jump.
    const next = collapsedRef.current.filter((entry) => entry !== id)
    if (next.length !== collapsedRef.current.length) {
      setCollapsed(next)
      writeCollapsedSections(next)
    }
    setFlashSection(id)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlashSection(''), 1600)
    // Expanding needs a paint before the section has a box to scroll to; a
    // zero-delay scroll after the state update lands on the opened content.
    const schedule = typeof window?.setTimeout === 'function' ? window.setTimeout : setTimeout
    schedule(() => scrollToSection(id), 0)
  }, [])
  const dragStart = React.useRef({ x: 0, width })

  React.useEffect(() => {
    if (!dragging) return undefined
    const onMove = (event) => {
      setWidth(
        Math.min(
          WIDTH_MAX,
          Math.max(WIDTH_MIN, Math.round(dragStart.current.width - (event.clientX - dragStart.current.x))),
        ),
      )
    }
    const stop = () => setDragging(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [dragging, setWidth])

  // Nothing is rendered until every hook above has run, so the hook order is
  // identical whether or not the task has loaded yet.
  if (!ready) {
    const origin = journal.origin
    const entryCount = journal.entries.length
    const lines2 =
      origin === 'fetching'
        ? [t('loading')]
        : origin === 'host-failed'
          ? [t('error.title'), String(journal.error ?? '')]
          : entryCount === 0
            ? [t('emptyJournal')]
            : [t('turnNotLoaded', { turn: String(turn) }), t('turnNotLoadedHint')]
    // While the journal is being fetched a skeleton holds the panel's shape;
    // every other state is a real message, because a skeleton that never
    // resolves would look like a hang instead of an explanation.
    return h(
      'div',
      { className: 'td-split' },
      h('div', { className: 'td-toolbar' }, h('div', { className: 'td-toolbarTitle' }, h('span', { className: 'td-toolbarHeading' }, t('panel.heading')))),
      h(
        'div',
        { className: 'td-scroll' },
        origin === 'fetching'
          ? h(
              'div',
              { className: 'td-skeleton', 'aria-hidden': true, 'data-testid': 'td-skeleton' },
              [0, 1, 2, 3].map((index) => h('div', { className: 'td-skeletonRow', key: index })),
              h('div', { className: 'td-loading' }, t('loading')),
            )
          : h(
              'div',
              { className: 'td-loadMessage' },
              lines2
                .filter(Boolean)
                .map((line, index) => h('div', { className: 'td-loading', key: index }, line)),
              origin === 'host-failed'
                ? h(
                    'button',
                    { type: 'button', className: 'td-retry', onClick: journal.retry },
                    buildIcon(h, 'refresh', 'td-retryGlyph', 13),
                    t('error.retry'),
                  )
                : null,
            ),
      ),
    )
  }

  // Every hook below must run on every render. The panel first paints before
  // the journal has a task (model is null) and again once it does, so an early
  // return placed here would change the hook count between those two renders
  // and React would unmount the tree instead of updating it.
  const emptyModel = {
    turn,
    sessionId,
    cwd: session?.cwd,
    startedAt: undefined,
    endedAt: undefined,
    durationMs: undefined,
    status: 'running',
    reason: undefined,
    inputs: [],
    replies: [],
    files: [],
    sections: { input: [], intermediate: [], output: [] },
    delivered: [],
    calls: [],
    failedCalls: [],
    tools: [],
    skills: [],
    usage: undefined,
    models: [],
    steps: [],
    commandRuns: 0,
    hasMemory: false,
  }
  const task = ready ? model : emptyModel

  const usage =
    task.usage === undefined
      ? undefined
      : (() => {
          const merged = {
            ...task.usage,
            provider: task.models?.[0]?.provider,
            model: task.models?.[0]?.model,
          }
          const cost = estimateCost(merged, price)
          return cost === undefined ? merged : { ...merged, cost }
        })()
  const summary = languageSummary(task)
  const outcome = React.useMemo(() => summarizeOutcome(task), [task])
  const phases = React.useMemo(() => summarizePhases(task, summarizeCall), [task])
  // The journal names its buckets `inputTokens`, `cacheReadTokens`, and so on.
  // Reading the bare names here silently dropped every usage row, so every
  // figure goes through the alias-aware accessor.
  const bucket = (name) => usageBucket(usage, name)
  const inputTokens = bucket('input')
  const outputTokens = bucket('output')
  const cacheReadTokens = bucket('cacheRead')
  const cacheWriteTokens = bucket('cacheWrite')
  const reasoningTokens = bucket('reasoning')
  const cacheBase =
    inputTokens === undefined && cacheReadTokens === undefined
      ? 0
      : (inputTokens ?? 0) + (cacheReadTokens ?? 0)
  const totalTokens =
    bucket('total') ??
    (usage === undefined ? undefined : (inputTokens ?? 0) + (outputTokens ?? 0) + (cacheReadTokens ?? 0))
  // "Uncached input" is the part of the prompt the provider had to process
  // fresh. The journal's `inputTokens` already excludes the cached part, so it
  // is reported as recorded rather than derived by subtraction.
  const uncachedInput = inputTokens
  const hitRate = cacheBase > 0 ? (cacheReadTokens ?? 0) / cacheBase : undefined
  // Attachments the journal recorded without a usable path still deserve a
  // line, so a pasted image is visible. Ones that already appear as file rows
  // are not repeated as chips: the same name twice in one section reads like a
  // rendering bug.
  const listedNames = new Set(task.sections.input.map((file) => file.name))
  const attachments = task.inputs
    .flatMap((input) => [
      ...(input.images ?? []).map((image) => (typeof image === 'string' ? image : image?.name)),
      ...(input.files ?? []).map((file) => file.name),
    ])
    .filter((name) => typeof name === 'string' && name !== '' && !listedNames.has(name))
    .filter((name, index, all) => all.indexOf(name) === index)
  const statusKey = 'status.' + task.status
  const statusLabel = t(statusKey) === statusKey ? task.status : t(statusKey)
  const statusTone = task.status === 'completed' ? 'ok' : task.status === 'running' ? 'run' : 'warn'

  /**
   * One titled section, collapsible.
   *
   * Sections take any number of content fragments, so a block can append extra
   * rows (Host-side memory or Session logs, for example) after its main list
   * without nesting another box. The title is a toggle button: collapsing is
   * per reader and persists across tabs, and the chevron + `aria-expanded`
   * state make the affordance discoverable without a separate control.
   *
   * @param {string} id section id.
   * @param {string} title section title.
   * @param {number | undefined} count optional count badge for the heading.
   * @param {...object} children content fragments; falsy entries are skipped.
   * @returns {object} element.
   */
  const section = (id, title, count, ...children) => {
    const isCollapsed = collapsed.includes(id)
    const body = children.filter((child) => child !== null && child !== undefined && child !== false)
    return h(
      'section',
      {
        className:
          'td-section' + (isCollapsed ? ' td-section--collapsed' : '') + (flashSection === id ? ' td-section--flash' : ''),
        'data-section': id,
        key: id,
      },
      h(
        'div',
        { className: 'td-sectionHead' },
        h(
          'button',
          {
            type: 'button',
            className: 'td-sectionToggle',
            'aria-expanded': !isCollapsed,
            title: t('panel.toggle'),
            onClick: () => toggleSection(id),
          },
          h('span', { className: 'td-sectionChevron', 'aria-hidden': true }, '\u25B8'),
          h('span', { className: 'td-sectionTitle' }, title),
          typeof count === 'number' && count > 0
            ? h('span', { className: 'td-sectionCount', 'aria-label': t('section.count', { count }) }, String(count))
            : null,
        ),
      ),
      body.length === 0 || isCollapsed ? null : h('div', { className: 'td-sectionBody' }, body),
    )
  }
  const fileList = (files) =>
    files.length === 0
      ? null
      : h(
          'div',
          { className: 'td-files' },
          files.map((file) =>
            fileRow({ file: withMetadata(file), sessionId, t, openResource, copied: copiedPath, onCopy: copyPath }),
          ),
        )
  // The skill verdict feeds the 可复用 section; it is derived once per render.
  const verdict = React.useMemo(() => reuseVerdict(task), [task])
  const verdictLabel = t(verdict.reusable ? 'reusable.yes' : 'reusable.no')

  return h(
    'div',
    {
      className: 'td-split',
      'data-width': width,
      style: { '--td-width': width + 'px', containerType: 'inline-size' },
    },
    h('div', {
      className: 'td-handle' + (dragging ? ' td-handle--active' : ''),
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-valuemin': WIDTH_MIN,
      'aria-valuemax': WIDTH_MAX,
      'aria-valuenow': width,
      'aria-label': t('panel.resize'),
      tabIndex: 0,
      title: t('panel.resize'),
      onPointerDown: (event) => {
        event.preventDefault()
        dragStart.current = { x: event.clientX, width }
        setDragging(true)
      },
      // A focusable separator is a widget: tabbing to it and finding no
      // keyboard behaviour is a dead stop, so the arrow keys resize and
      // Home/End jump to the bounds.
      onKeyDown: (event) => {
        const step = 16
        const moves = {
          ArrowLeft: width - step,
          ArrowRight: width + step,
          Home: WIDTH_MIN,
          End: WIDTH_MAX,
        }
        const next = moves[event.key]
        if (next === undefined) return
        event.preventDefault()
        setWidth(Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, next)))
      },
    }),
    h(
      'div',
      { className: 'td-toolbar' },
      h(
        'div',
        { className: 'td-toolbarTitle' },
        h('span', { className: 'td-toolbarIcon' }, buildIcon(h, 'doc', 'td-toolbarIconGlyph', 15)),
        h('span', { className: 'td-toolbarHeading' }, t('panel.heading')),
        h('span', { className: 'td-toolbarSub' }, t('panel.subtitle', { turn: task.turn })),
        h(
          'span',
          { className: 'td-pill td-pill--' + task.status },
          h('span', { className: 'td-pillDot', 'aria-hidden': true }),
          statusLabel,
        ),
      ),
      h(
        'div',
        { className: 'td-toolbarMeta' },
        // Duration and tokens live in 任务概况 below. Stating them here too
        // printed the same figures twice and made this block wrap onto a
        // second toolbar line in a narrow panel.
        task.models?.length > 0
          ? h('code', { className: 'td-toolbarModel' }, task.models[0].provider + '/' + task.models[0].model)
          : null,
        h(
          'div',
          { className: 'td-toolbarActions' },
          // Collapse/expand every section in one click. The glyph flips for the
          // collapsed state, so the button always names what it will do next.
          h(
            'button',
            {
              type: 'button',
              className: 'td-iconButton td-toolbarButton' + (allCollapsed ? ' td-toolbarButton--active' : ''),
              title: t(allCollapsed ? 'panel.expandAll' : 'panel.collapseAll'),
              'aria-label': t(allCollapsed ? 'panel.expandAll' : 'panel.collapseAll'),
              'aria-pressed': allCollapsed,
              onClick: toggleAllSections,
            },
            buildIcon(h, 'expand', allCollapsed ? 'td-toolbarGlyph td-toolbarGlyph--flipped' : 'td-toolbarGlyph', 14),
          ),
          h(
            'button',
            {
              type: 'button',
              className:
                'td-iconButton td-toolbarButton' +
                (metadata.state === 'loading' ? ' td-toolbarButton--busy' : '') +
                (metadata.state === 'error' ? ' td-toolbarButton--error' : ''),
              title: t(metadata.state === 'error' ? 'error.retry' : 'panel.refresh'),
              'aria-label': t(metadata.state === 'error' ? 'error.retry' : 'panel.refresh'),
              onClick: metadata.refresh,
            },
            buildIcon(h, 'refresh', 'td-toolbarGlyph', 14),
          ),
        ),
      ),
    ),
    h(
      'div',
      { className: 'td-scroll' },
      // Duration, tokens, and cache hit are already rows in the overview
      // directly below, so the strip carries only the counts the overview
      // does not state. When every count is absent it is omitted entirely
      // rather than left as an empty box with a margin.
      (() => {
        const cells = [
          metric(t('metrics.steps'), task.steps.length > 0 ? String(task.steps.length) : '', {
            target: 'flow',
            title: t('metrics.jumpTo', { section: t('section.flow') }),
          }, jumpToSection),
          metric(t('metrics.calls'), task.calls.length > 0 ? String(task.calls.length) : '', {
            target: 'tools',
            title: t('metrics.jumpTo', { section: t('section.tools') }),
          }, jumpToSection),
          metric(t('metrics.files'), task.files.length > 0 ? String(task.files.length) : '', {
            target: 'outputs',
            title: t('metrics.jumpTo', { section: t('section.outputs') }),
          }, jumpToSection),
        ].filter((cell) => cell !== null)
        return cells.length === 0 ? null : h('div', { className: 'td-metrics' }, cells)
      })(),
      h(
        'div',
        { className: 'td-sections' },
        // 1. The task at a glance, including the model and its usage.
        section(
          'overview',
          t('overview.title'),
          usage === undefined ? undefined : 1,
          h(
            'dl',
            { className: 'td-facts td-facts--wide' },
            fact(t('overview.turn'), String(task.turn)),
            fact(t('overview.status'), statusLabel, statusTone),
            fact(t('overview.started'), formatTime(task.startedAt)),
            task.durationMs === undefined ? null : fact(t('metrics.duration'), formatDuration(task.durationMs)),
            task.cwd === undefined ? null : fact(t('overview.workspace'), prettyPath(task.cwd)),
            // Without usage there is no model figure to show. It stays a real
            // dt/dd pair: a stray div inside the dl would break the row
            // association for assistive technology.
            usage === undefined
              ? fact(t('overview.model'), t('usage.missing'), 'muted')
              : fact(t('usage.model'), (usage.provider ?? '\u2014') + ' / ' + (usage.model ?? '\u2014')),
            hitRate === undefined
              ? null
              : fact(t('usage.cacheHitRate'), (hitRate * 100).toFixed(1) + '%', undefined, h(
                  'span',
                  {
                    className: 'td-cacheBar',
                    role: 'img',
                    // The figure is the reading; the bar restates it in shape.
                    // A full bar cannot distinguish 99.6% from 100%, so the
                    // miss is drawn in a second colour rather than left as
                    // empty track: on a mostly-cached turn the interesting
                    // number is what was NOT cached.
                    'aria-label': t('usage.cacheHitRate') + ' ' + (hitRate * 100).toFixed(1) + '%',
                    title: (hitRate * 100).toFixed(1) + '%',
                  },
                  h('span', {
                    className: 'td-cacheBarFill',
                    style: { width: Math.max(0.5, Math.min(100, hitRate * 100)) + '%' },
                  }),
                  hitRate < 1
                    ? h('span', {
                        className: 'td-cacheBarMiss',
                        style: { width: Math.max(1.5, 100 - hitRate * 100) + '%' },
                      })
                    : null,
                )),
            // Token counts sit left-aligned, each with a bar for its share of
            // the total — the comparison a reader actually makes here.
            ...tokenFacts(
              t,
              [
                // The prompt: what the provider processed fresh against what it
                // read back from cache.
                [t('usage.uncachedInput'), uncachedInput, 'warn', 'prompt'],
                [t('usage.cacheRead'), cacheReadTokens, 'ok', 'prompt'],
                [t('usage.cacheWrite'), cacheWriteTokens, 'muted', 'prompt'],
                // What came out, measured against the generated side.
                [t('usage.output'), outputTokens, 'run', 'generated'],
                [t('usage.reasoning'), reasoningTokens, 'muted', 'generated'],
                [t('usage.total'), totalTokens],
              ],
              t('usage.shareOfTotal'),
            ),
            usage?.cost === undefined ? null : fact(t('metrics.cost'), formatCost(usage.cost)),
          ),
        ),
        // 2. What the user gave the task, including attached images.
        section(
          'inputs',
          t('section.inputs'),
          task.sections.input.length + attachments.length,
          task.sections.input.length === 0 && attachments.length === 0
            ? empty(t('empty.inputs'))
            : null,
          fileList(task.sections.input),
          attachments.length === 0
            ? null
            : h(
                'div',
                { className: 'td-chips' },
                attachments.map((name, index) => h('span', { className: 'td-chip', key: 'att-' + index }, name)),
              ),
        ),
        // 3. Scratch work and the Session's own records.
        section(
          'intermediate',
          t('section.intermediate'),
          task.sections.intermediate.length + metadata.memory.length + metadata.artifacts.length,
          task.sections.intermediate.length === 0 && metadata.memory.length === 0 && metadata.artifacts.length === 0
            ? empty(t('empty.intermediate'))
            : null,
          fileList(task.sections.intermediate),
          fileList(
            metadata.memory.map((file) => ({
              ...file,
              name: file.scope + '/' + file.path.split(/[\\/]/).slice(-2).join('/'),
              role: 'write',
              section: 'intermediate',
              sources: ['memory'],
            })),
          ),
          fileList(
            metadata.artifacts.map((file) => ({
              ...file,
              name: file.path.split(/[\\/]/).pop(),
              role: 'write',
              section: 'intermediate',
              sources: ['session-log'],
            })),
          ),
        ),
        // 4. What the task produced.
        section(
          'outputs',
          t('section.outputs'),
          task.sections.output.length,
          task.sections.output.length === 0 ? empty(t('empty.outputs')) : null,
          fileList(task.sections.output),
          outcome.length === 0
            ? null
            : h(
                'ul',
                { className: 'td-outcome' },
                outcome.map((item, index) =>
                  h(
                    'li',
                    { className: 'td-outcomeItem td-outcomeItem--' + item.kind, key: 'outcome-' + index },
                    h(
                      'span',
                      { className: 'td-outcomeText' },
                      t('outcome.' + item.kind, {
                        count: item.files?.length ?? item.count ?? 0,
                        names: (item.names ?? []).join(', '),
                      }),
                    ),
                    (item.files ?? []).length === 0
                      ? null
                      : h(
                          'div',
                          { className: 'td-outcomeFiles' },
                          // Every delivered file is listed. A silent cap showed
                          // six of twenty and left the reader believing that
                          // was all the task produced.
                          item.files.map((path) => {
                            const address = fileAddress(sessionId, path)
                            return h(
                              'button',
                              {
                                type: 'button',
                                className: 'td-outcomeFile',
                                key: path,
                                title: path,
                                disabled: address === null,
                                onClick: () => {
                                  if (address !== null) openResource(address)
                                },
                              },
                              path.split(/[\\/]/).pop(),
                            )
                          }),
                        ),
                  ),
                ),
              ),
        ),
        // 5. How the work was done.
        section(
          'tools',
          t('section.tools'),
          task.tools.reduce((sum, tool) => sum + tool.count, 0) + task.skills.reduce((sum, skill) => sum + skill.count, 0),
          task.tools.length === 0 && task.skills.length === 0
            ? empty(t('empty.tools'))
            : h(
                'div',
                { className: 'td-table' },
                task.tools.map((tool) =>
                  h(
                    'div',
                    { className: 'td-tableRow', key: tool.name },
                    h('span', { className: 'td-tableName' }, tool.name),
                    h('span', { className: 'td-tableCount' }, t('tools.calls', { count: tool.count })),
                    tool.failed > 0
                      ? h('span', { className: 'td-tableWarn' }, t('tools.failed', { count: tool.failed }))
                      : null,
                    tool.totalMs > 0
                      ? h('span', { className: 'td-tableDim' }, t('tools.avg', { ms: formatDuration(tool.totalMs / tool.count) }))
                      : null,
                  ),
                ),
                task.skills.map((skill) =>
                  h(
                    'div',
                    { className: 'td-tableRow td-tableRow--skill', key: 'skill-' + skill.name },
                    h(
                      'span',
                      { className: 'td-tableName' },
                      buildIcon(h, 'skill', 'td-skillicon', 12),
                      h('span', null, 'skill \u00B7 ' + skill.name),
                    ),
                    h('span', { className: 'td-tableCount' }, t('tools.calls', { count: skill.count })),
                  ),
                ),
              ),
        ),
        // 6. The stacks and shells involved.
        section(
          'language',
          t('section.language'),
          summary.languages.length + summary.shells.length + (summary.commandRuns > 0 ? 1 : 0),
          summary.languages.length === 0 && summary.shells.length === 0 && summary.commandRuns === 0
            ? empty(t('empty.language'))
            : h(
                'div',
                { className: 'td-chips' },
                summary.languages.map((language) => h('span', { className: 'td-chip', key: language }, language)),
                // A shell that ran commands already implies the count; a bare
                // "1 command" chip with no shell beside it told the reader
                // nothing, so the two are merged into one label.
                summary.shells.length === 0
                  ? summary.commandRuns > 0
                    ? h('span', { className: 'td-chip' }, t('language.commandCount', { count: summary.commandRuns }))
                    : null
                  : summary.shells.map((shell) =>
                      h(
                        'span',
                        { className: 'td-chip', key: shell },
                        summary.commandRuns > 0 ? t('language.shellWithCount', { shell, count: summary.commandRuns }) : shell,
                      ),
                    ),
              ),
        ),
        // 7. Whether the work is worth turning into a local skill or tool,
        // derived from deliveries, skill use, and script artifacts.
        section(
          'reusable',
          t('section.reusable'),
          verdict.reasons.length,
          h(
            'div',
            { className: 'td-verdict' + (verdict.reusable ? ' td-verdict--yes' : ' td-verdict--no') },
            buildIcon(h, verdict.reusable ? 'skill' : 'doc', 'td-verdictIcon', 13),
            h('span', { className: 'td-verdictLabel' }, verdictLabel),
          ),
          verdict.reusable
            ? h(
                'ul',
                { className: 'td-verdictReasons' },
                verdict.reasons.map((reason, index) =>
                  h(
                    'li',
                    { key: 'reason-' + index },
                    t(reason.key, { names: reason.params?.names ?? '' }),
                  ),
                ),
              )
            : null,
        ),
        // 8. The shape of the work, one compact row.
        section(
          'flow',
          t('section.flow'),
          phases.reduce((sum, phase) => sum + phase.calls.length, 0),
          phases.length === 0
            ? empty(t('flow.empty'))
            : h(
                'div',
                { className: 'td-phases' + (phasesEnd ? ' td-phases--end' : ''), ref: phasesRef, onScroll: onPhasesScroll },
                h('span', { className: 'td-phaseEnd td-phaseEnd--start' }, t('flow.start')),
                phases.map((phase, index) =>
                  h(
                    'div',
                    {
                      className:
                        'td-phase td-phase--' + phase.kind + (phase.failed > 0 ? ' td-phase--warn' : ''),
                      key: 'phase-' + index,
                      // A native tooltip needs a second of hovering, cannot wrap,
                      // and inherits the row's font. The preview below replaces
                      // it; `title` stays as the fallback for other readers.
                      title: phasePreview(phase, t),
                      onMouseEnter: (event) => showPreview(event.currentTarget, phase, t),
                      onMouseLeave: hidePreview,
                      onFocus: (event) => showPreview(event.currentTarget, phase, t),
                      onBlur: hidePreview,
                      tabIndex: 0,
                    },
                    h('span', { className: 'td-phaseDot', 'aria-hidden': true }),
                    h(
                      'span',
                      { className: 'td-phaseText' },
                      h('span', { className: 'td-phaseLabel' }, t('phase.' + phase.kind)),
                      h(
                        'span',
                        { className: 'td-phaseSample' },
                        // The step range says where in the task this happened,
                        // and "贯穿" versus a narrow range says whether it was
                        // continuous work or a single moment.
                        [
                          t('flow.steps', { from: phase.firstStep + 1, to: phase.lastStep + 1 }),
                          phase.span >= 0.8 ? t('flow.throughout') : null,
                          phase.tools.join(' · '),
                        ]
                          .filter(Boolean)
                          .join(' · '),
                      ),
                    ),
                    phase.failed > 0
                      ? h('span', { className: 'td-phaseFail' }, t('flow.failed', { count: phase.failed }))
                      : null,
                    phase.calls.length > 1
                      ? h('span', { className: 'td-phaseCount' }, String(phase.calls.length))
                      : null,
                  ),
                ),
                h('span', { className: 'td-phaseEnd td-phaseEnd--finish' }, t('flow.end')),
              ),
        ),
      ),
    ),
    preview === null
      ? null
      : h(
          'div',
          {
            className: 'td-preview',
            role: 'tooltip',
            // Fixed positioning escapes both the chip and the scrolling row.
            style: { left: preview.x + 'px', top: preview.y + 6 + 'px' },
          },
          h(
            'div',
            { className: 'td-previewHead' },
            h('span', { className: 'td-previewKind' }, preview.t('phase.' + preview.phase.kind)),
            h(
              'span',
              { className: 'td-previewSteps' },
              preview.t('flow.steps', { from: preview.phase.firstStep + 1, to: preview.phase.lastStep + 1 }),
            ),
            preview.phase.failed > 0
              ? h('span', { className: 'td-previewFail' }, preview.t('tools.failed', { count: preview.phase.failed }))
              : null,
          ),
          h('div', { className: 'td-previewTools' }, preview.phase.tools.join(' · ')),
          (preview.phase.sample ?? []).length === 0
            ? null
            : h(
                'ul',
                { className: 'td-previewList' },
                preview.phase.sample.map((item, index) => h('li', { key: 'p-' + index }, item)),
              ),
        ),
  )
}
