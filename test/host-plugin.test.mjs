// Exercises the Host plugin's apply() against a stub Cordis context.
import { apply, inject, DETAILS_ROUTE, JOURNAL_ROUTE } from '../index.js'
import { at } from './paths.mjs'

const registered = []
const effects = []
const ctx = {
  effect(factory, label) {
    const dispose = factory()
    effects.push({ label, dispose })
    return dispose
  },
  webServer: {
    register(route) {
      registered.push(route)
      return () => {
        const index = registered.indexOf(route)
        if (index >= 0) registered.splice(index, 1)
      }
    },
  },
  logger: { warn: (...args) => console.log('[warn]', ...args) },
}

apply(ctx)

const routes = registered.map((r) => `${r.kind}:${r.path}`)
console.log('inject:', inject.join(', '))
console.log('effects:', effects.map((e) => e.label))
console.log('routes:', routes)

const checks = []
const check = (label, condition, detail = '') => {
  checks.push({ label, ok: Boolean(condition) })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

check('two exact routes are mounted', routes.length === 2, routes.join(', '))
check('describe route present', routes.includes(`exact:${DETAILS_ROUTE}`))
check('journal route present', routes.includes(`exact:${JOURNAL_ROUTE}`))
check('inject declares webServer', inject.join(',') === 'webServer')

/** A fake request/response pair. */
function harness(method, body, url) {
  const request = (async function* () {
    if (body !== undefined) yield Buffer.from(body)
  })()
  request.method = method
  request.url = url
  const chunks = []
  const response = {
    writeHead(status, headers) {
      response.status = status
      response.headers = headers
    },
    end(payload) {
      chunks.push(payload)
    },
  }
  return { request, response, text: () => chunks.join('') }
}

const describeRoute = registered.find((route) => route.path === DETAILS_ROUTE)
const journalRoute = registered.find((route) => route.path === JOURNAL_ROUTE)

const get = harness('GET')
await describeRoute.handler(get.request, get.response)
check('describe rejects GET', get.response.status === 405, get.text())

const bad = harness('POST', '{not json')
await describeRoute.handler(bad.request, bad.response)
check('describe rejects a malformed body', bad.response.status === 400, bad.text())

const post = harness(
  'POST',
  JSON.stringify({ sessionId: 'session-70eab2d4-a88d-4e47-a40a-73adc764ec4d', paths: [at('package.json')] }),
)
await describeRoute.handler(post.request, post.response)
const payload = JSON.parse(post.text())
check('describe answers with file metadata', post.response.status === 200 && payload.files[0]?.exists === true)
check('describe forbids caching', post.response.headers['cache-control'] === 'no-store')

const journalPost = harness('POST', '{}', JOURNAL_ROUTE)
await journalRoute.handler(journalPost.request, journalPost.response)
check('journal rejects POST', journalPost.response.status === 405)

const journalInvalid = harness('GET', undefined, `${JOURNAL_ROUTE}?sessionId=..%2Fetc%2Fpasswd`)
await journalRoute.handler(journalInvalid.request, journalInvalid.response)
check('journal refuses a malformed id', JSON.parse(journalInvalid.text()).ok === false)

for (const effect of effects) effect.dispose()
check('disposal removes every route', registered.length === 0, String(registered.length))

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) process.exitCode = 1
else console.log('HOST PLUGIN OK')
