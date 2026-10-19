/**
 * Browser half of the task-details plugin.
 *
 * Two contributions, both inside the plugin's own effects:
 *
 * 1. A list entry in `conversation.chat.turnTail` - the row Chat renders at the
 *    bottom of every finished task - offering "查看任务详情".
 * 2. A right-sidebar tab type `task-details`, addressed as
 *    `dsh-resource://task-details/session/<id>/turn/<n>`, whose body is the
 *    resizable detail panel.
 *
 * The module body resolves React once; the tab body needs it synchronously to
 * build its component, so it is read here rather than inside the lazy factory.
 */
import { configure as configureDetails, TaskDetailsTrigger, TaskDetailsView } from './details.js'
import { DETAILS_ID, DETAILS_KIND, NS, parseTaskAddress, taskAddress } from './model.js'
import { en, zh } from './copy.js'
import { STYLES, STYLE_ID } from './styles.js'

/** Services this plugin needs; a profile without them leaves the plugin inactive. */
export const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs']

/** @type {object | undefined} */
let React
/** @type {object | undefined} The client root context, kept for optional service lookups. */
let rootContext

/**
 * Install the stylesheet once per document.
 * @returns {() => void} disposer.
 */
function installStyles() {
  let tag = document.querySelector(`style[data-plugin-style="${STYLE_ID}"]`)
  if (tag === null) {
    tag = document.createElement('style')
    tag.dataset.pluginStyle = STYLE_ID
    tag.textContent = STYLES
    document.head.appendChild(tag)
  }
  const installed = tag
  return () => {
    installed.remove()
  }
}

/**
 * The tab type declaration.
 * @param {Function} t translate.
 * @returns {object} registry definition.
 */
function detailsDefinition(t) {
  return {
    id: DETAILS_ID,
    kind: DETAILS_KIND,
    priority: 'extension',
    patterns: ['dsh-resource://task-details/**'],
    title: (address) => {
      const parsed = parseTaskAddress(address)
      return parsed === null ? t('type.label') : `${t('type.label')} · ${t('panel.subtitle', { turn: parsed.turn })}`
    },
    guide: [
      {
        id: 'task-details',
        order: 30,
        title: () => t('type.entryTitle'),
        description: () => t('type.entryDescription'),
      },
    ],
    multiple: true,
  }
}

/**
 * Pick the Session id and Turn number out of whatever the seat exposes.
 *
 * The sidebar keeps the address on the tab record; the panel also works when a
 * caller opens it with navigation params only.
 *
 * @param {object} props slot props.
 * @returns {{ sessionId: string | undefined, turn: number | undefined }} coordinates.
 */
function coordinatesOf(props) {
  // The address is the authority: the tab record and its title both come from
  // it, so a tab opened for task 3 can never describe task 11. Navigation
  // parameters and seat props apply only when no address is reachable.
  const info = props.tab ?? props
  const record = info?.record ?? info?.tab ?? {}
  const addresses = [
    info?.address,
    info?.navigation?.address,
    record?.address,
    info?.contentId,
    record?.contentId,
    props.address,
  ]
  for (const address of addresses) {
    const parsed = parseTaskAddress(address)
    if (parsed !== null) return parsed
  }
  const params = info?.navigation?.params ?? info?.params ?? props.params
  return {
    sessionId: props.sessionId ?? params?.sessionId,
    turn: Number.isFinite(Number(params?.turn)) ? Number(params.turn) : undefined,
  }
}

/**
 * Client plugin body.
 *
 * @param {object} ctx client root context.
 * @param {object | undefined} config row config; `price` supplies optional
 *   per-million-token rates as `{ input, output, cacheRead, cacheWrite }`.
 */
export function register(ctx, config) {
  const t = ctx.locale.bind(NS)
  const price = config?.price
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-task-details: dictionaries')
  ctx.effect(() => installStyles(), 'ui-task-details: styles')
  ctx.effect(() => ctx.sidebarRightTabs.register(detailsDefinition(t)), 'ui-task-details: tab type')

  // 1. "查看任务详情" under every finished task.
  //
  // The turnTail owner carries only `{ turn, seq, openFile }` and no Session
  // id, so the Session is resolved through the sessions service when the
  // button is pressed. A Session-scoped seat always renders inside the active
  // Session, which makes that lookup exact.
  ctx.effect(
    () =>
      ctx.slots.inject('conversation.chat.turnTail', () =>
        ctx.slots.register(
          {
            name: 'conversation.chat.turnTail',
            id: 'task-details',
            order: 10,
            locale: NS,
            // `inject` replaces the props an entry receives, so the seat's own
            // owner props must be forwarded along with the extras this plugin
            // needs, or the entry loses the Turn number it renders for.
            // Injection adds this plugin's helpers to the props the seat already
            // passes. It must not rebuild the prop set: the seat supplies the
            // Turn number and dropping it is what made every button claim the
            // last task.
            inject: () => ({
              t,
              currentSessionId: () => selectedSessionId(ctx),
              latestTurn: () => latestClosedTurn(ctx),
              openResource: (address) => openDetailTab(ctx, address),
            }),
          },
          TaskDetailsTrigger,
        ),
      ),
    'ui-task-details: turn tail',
  )

  // 2. The detail panel as a right-sidebar tab.
  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register(
          {
            name: 'sidebar.right.pane.tab',
            key: DETAILS_ID,
            locale: NS,
            inject: () => ({ t, price }),
          },
          TabBody,
        ),
      ),
    'ui-task-details: panel body',
  )
}

/**
 * Open the detail tab.
 *
 * The controller needs the Session's sidebar store to be adopted before it can
 * place a tab, and a column that was never expanded has not adopted one yet.
 * Expanding first is therefore the ordinary path, not a recovery step; the
 * open is retried on the next frame so the seat renders its store first.
 *
 * @param {object} ctx client root context.
 * @param {string} address resource address.
 */
function openDetailTab(ctx, address) {
  const controller = ctx.get?.('sidebarRight') ?? ctx.sidebarRight
  if (controller === undefined) {
    console.warn('[ui-task-details] sidebarRight is unavailable; cannot open the panel')
    return
  }
  const attempt = (retriesLeft) => {
    try {
      controller.openResource(address)
      return
    } catch (error) {
      if (retriesLeft <= 0) {
        console.warn('[ui-task-details] could not open the details tab', { address, error })
        throw error
      }
      try {
        controller.toggleExpanded?.()
      } catch {
        /* an expanded column may refuse the toggle; the retry still runs */
      }
      // The column renders and adopts its store in this frame; retry after it.
      const schedule = typeof window?.setTimeout === 'function' ? window.setTimeout : setTimeout
      schedule(() => {
        try {
          attempt(retriesLeft - 1)
        } catch {
          /* the last attempt already reported itself */
        }
      }, 60)
    }
  }
  attempt(2)
}

/**
 * Resolve the Session currently shown in the Conversation.
 *
 * `sessions` exposes the catalog snapshot; the right-sidebar controller's
 * `mounted` observable names the very Session its seat renders for, which is
 * the same Session the turn-tail button belongs to.
 *
 * @param {object} ctx client root context.
 * @returns {string | undefined} Session id.
 */
function selectedSessionId(ctx) {
  const sidebar = ctx.get?.('sidebarRight')
  const mounted = sidebar?.mounted?.getSnapshot?.()
  if (typeof mounted === 'string' && mounted !== '') return mounted
  const sessions = ctx.get?.('sessions')
  const selected = sessions?.selected?.getSnapshot?.()
  if (typeof selected === 'string') return selected
  if (typeof selected?.sessionId === 'string') return selected.sessionId
  const list = sessions?.list?.getSnapshot?.()
  const current = list?.selected ?? list?.current
  if (typeof current === 'string') return current
  return undefined
}

/**
 * Read the newest Turn that has ended in the current Session.
 *
 * @param {object} ctx client root context.
 * @returns {number | undefined} Turn number.
 */
function latestClosedTurn(ctx, preferredSessionId) {
  const sessionId = typeof preferredSessionId === 'string' ? preferredSessionId : selectedSessionId(ctx)
  if (typeof sessionId !== 'string') return undefined
  const sessions = ctx.get?.('sessions')
  const entries = sessions?.binding?.(sessionId)?.session?.eventSource?.getSnapshot?.()?.entries ?? []
  let latest
  for (const entry of entries) {
    const event = entry?.event
    if (event?.type !== 'turn/end') continue
    const turn = Number(event.data?.turn)
    if (Number.isFinite(turn) && (latest === undefined || turn > latest)) latest = turn
  }
  return latest
}

/**
 * The tab body component: resolves the task's Session binding and hands the
 * panel everything it needs.
 *
 * The panel reads the Session journal directly instead of the Conversation
 * snapshot, so it shows every tool call and usage figure for the task even
 * when Chat folds process rows away.
 *
 * @param {object} props seat props.
 * @returns {object | null} element.
 */
function TabBody(props) {
  // The pane renders every tab body with empty props and hands the record over
  // through this framework-bound reader; reading props for the address would
  // always come up empty.
  const useTabInfo = props.useTabInfo
  const info = typeof useTabInfo === 'function' ? useTabInfo() : undefined
  const tabRecord = info?.tab
  // The record's own fields carry the address: the pane opens a tab by
  // contentId, and its navigation repeats it. Pass the record directly, so
  // those fields are read instead of being hidden one level down.
  const { sessionId, turn } = coordinatesOf(tabRecord ?? {})
  // The address identifies the task. When one tab is reused for another task,
  // the record changes but this component stays mounted; a subscription keyed
  // on the address guarantees a fresh derivation instead of the old result.
  const address = info?.tab?.address ?? info?.tab?.navigation?.address
  const [, setAddressRevision] = React.useState(0)
  React.useEffect(() => {
    setAddressRevision((value) => value + 1)
  }, [address, sessionId, turn])
  const sessions = props.sessions ?? getSessions()
  // Subscribe to catalog changes so a late binding re-renders the panel, but
  // derive the object itself every render: a cached copy would keep pointing at
  // the Session that was open when this tab was created.
  const [, setCatalogRevision] = React.useState(0)
  React.useEffect(() => {
    if (sessions === undefined) return undefined
    return sessions.list?.subscribe?.(() => setCatalogRevision((value) => value + 1))
  }, [sessions])
  const session = sessionOf(sessions, sessionId)

  if (sessionId === undefined || turn === undefined || !Number.isFinite(turn)) {
    const address = tabRecord?.contentId ?? tabRecord?.address ?? tabRecord?.navigation?.address
    return React.createElement(
      'div',
      { className: 'td-split' },
      React.createElement(
        'div',
        { className: 'td-scroll' },
        React.createElement('div', { className: 'td-loading' }, props.t('noCoordinates')),
        React.createElement('div', { className: 'td-debug' }, `address=${String(address)}`),
      ),
    )
  }
  return React.createElement(TaskDetailsView, {
    // Remounting per task guarantees no state (journal, metadata, width of the
    // scrolled position) survives a switch to another task or another Session.
    key: `${sessionId}#${turn}`,
    sessionId,
    turn,
    session,
    price: props.price,
    t: props.t,
    openResource: (address) => openThroughEvents(address),
  })
}

/**
 * Resolve the Session object behind one id.
 * @param {object | undefined} sessions the sessions service.
 * @param {string | undefined} sessionId Session id.
 * @returns {object | undefined} the Session object.
 */
function sessionOf(sessions, sessionId) {
  if (sessions === undefined || typeof sessionId !== 'string') return undefined
  const binding = sessions.binding?.(sessionId)
  if (binding?.session !== undefined) return binding.session
  // A Session that is not rendered has no binding yet; the catalog may still
  // expose the object the journal needs.
  const listed = sessions.list?.getSnapshot?.()?.byId?.[sessionId]
  return listed?.session
}

/**
 * Read the sessions service from the client root context the plugin was
 * applied with; it is optional so the plugin still loads in slimmer profiles.
 * @returns {object | undefined} sessions service.
 */
function getSessions() {
  return rootContext?.get?.('sessions')
}

/**
 * Open a sidebar tab from a seat that does not forward the controller.
 * @param {string} address resource address.
 */
function openThroughEvents(address) {
  const controller = rootContext?.get?.('sidebarRight')
  if (controller !== undefined) {
    controller.openResource(address)
    return
  }
  window.dispatchEvent(new CustomEvent('dsh:task-details-open', { detail: { address } }))
}

/**
 * Provide the module with the browser module table's React, then register.
 * Called by the entry wrapper.
 *
 * @param {object} modules the lazily required modules.
 * @param {object} ctx client root context.
 * @param {object | undefined} config row config.
 */
export function boot(modules, ctx, config) {
  React = modules.React
  rootContext = ctx
  configureDetails({ React })
  register(ctx, config)
}
