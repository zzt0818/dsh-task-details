// Drives the real registry contract: does our definition claim our address,
// and does openResource reach a tab after registration?
import { DETAILS_ID, DETAILS_KIND, taskAddress, parseTaskAddress } from '../model.js'
import { register } from '../client-entry.js'

// A stand-in for the sidebar's registry: same ranking and glob semantics.
function globToRegExp(pattern) {
  let source = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        source += '.*'
        index += 1
      } else source += '[^/]*'
    } else if (char === '?') source += '.'
    else source += char.replace(/[.+^$()|[\]{}]/g, '\\$&')
  }
  return new RegExp(source + '$', 'i')
}

const registrations = []
const opened = []
let mounted = 'session-abc'

const ctx = {
  locale: { bind: () => (key, params) => key, register: () => () => {} },
  effect(factory) {
    return factory()
  },
  slots: {
    inject(owner, callback) {
      return callback()
    },
    register(definition) {
      registrations.push(definition)
      return () => {}
    },
  },
  sidebarRightTabs: {
    register(definition) {
      registrations.push({ __tabType: true, ...definition })
      return () => {}
    },
  },
  sidebarRight: {
    mounted: { getSnapshot: () => mounted },
    openResource(address) {
      const claimed = registrations.find(
        (entry) => entry.__tabType === true && (entry.patterns ?? []).some((pattern) => globToRegExp(pattern).test(address)),
      )
      if (claimed === undefined) throw new Error(`sidebarRight: no registered tab type claims "${address}"`)
      opened.push({ address, kind: claimed.kind })
    },
    toggleExpanded() {},
  },
  get(name) {
    return name === 'sessions' ? undefined : ctx[name]
  },
}

globalThis.document = { querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ dataset: {} }), head: { appendChild() {} } }
globalThis.window = {}

register(ctx, {})

const checks = []
const check = (label, condition, detail = '') => {
  checks.push({ label, ok: Boolean(condition) })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

const tabType = registrations.find((entry) => entry.__tabType === true)
check('tab type registered', tabType !== undefined)
check('tab type id is stable', tabType?.id === DETAILS_ID)
check('tab type kind is task-details', tabType?.kind === DETAILS_KIND)
check('tab type declares patterns', (tabType?.patterns ?? []).length > 0, JSON.stringify(tabType?.patterns))

const tail = registrations.find((entry) => entry.id === 'task-details' && entry.name === 'conversation.chat.turnTail')
check('turn tail registered', tail !== undefined)
const injected = tail?.inject?.({})
check('tail injects a session resolver', typeof injected?.currentSessionId === 'function')
check('tail injects an opener', typeof injected?.openResource === 'function')

// The click path, end to end.
const address = taskAddress(mounted, 4)
injected.openResource(address)
check('click opens the details tab', opened.length === 1, JSON.stringify(opened[0] ?? null))
check('opened under the right kind', opened[0]?.kind === DETAILS_KIND)
check('address round-trips', parseTaskAddress(opened[0]?.address)?.turn === 4)

// A missing controller must not throw out of the click handler.
const lonelyCtx = { ...ctx, get: () => undefined, sidebarRight: undefined, effect: (f) => f() }
const lonelyRegistrations = []
lonelyCtx.slots = { inject: (o, cb) => cb(), register: (d) => (lonelyRegistrations.push(d), () => {}) }
try {
  register(lonelyCtx, {})
  check('registration survives a profile without sidebarRight', true)
} catch (error) {
  check('registration survives a profile without sidebarRight', false, String(error))
}

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) process.exitCode = 1
else console.log('OPEN PATH OK')
