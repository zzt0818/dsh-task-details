/**
 * Host half of the task-details plugin.
 *
 * The browser half already sees every Session event, so it derives the task
 * structure (the user's input, every tool call, the model's replies) from the
 * Session journal. What the browser cannot know is filesystem truth: whether a
 * reported path still exists, its size, its modification time, and where
 * DSH keeps its own artifacts (session logs, projections, memory files). This
 * half answers exactly that, over one authenticated exact route.
 *
 * The route is composed by the Host, so it inherits the same browser-trust and
 * cookie authentication as every other Host RPC; the plugin adds no policy of
 * its own.
 */
import { createHash } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Exact route the browser half calls. */
export const DETAILS_ROUTE = '/api/plugins/ui-task-details/describe'

/**
 * Decoded journals keyed by file path, invalidated by size and mtime.
 *
 * A Session log is append-only, so a decoded body stays valid until the file
 * grows. Decoding thousands of frames on every panel open would otherwise
 * dominate the open latency, and every task tab of one Session shares it.
 */
const journalCache = new Map()

/** Exact route returning one Session's decoded journal. */
export const JOURNAL_ROUTE = '/api/plugins/ui-task-details/journal'

/** Bounds on one describe request. */
const MAX_PATHS = 400
const MAX_MEMORY_FILES = 12
const MAX_MEMORY_READ = 256 * 1024
const MAX_TEXT_PREVIEW = 4000

/**
 * Resolve the DSH home directory the running Host uses.
 *
 * The Desktop Host does not always export `DSH_HOME` to plugins, so the
 * fallbacks walk outward from this plugin's own location: a profile-installed
 * bundle sits in `<home>/profiles/<name>/node_modules/...`, and a linked
 * bundle names its workspace. The home directory is the one that actually
 * holds the profile or session stores.
 *
 * @param {string} [profileDir] an explicit profile directory, when known.
 * @returns {string} absolute home path.
 */
function dshHome(profileDir) {
  const explicit = process.env.DSH_HOME ?? profileDir ?? process.env.DSH_PROFILE_DIR
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    const resolved = path.resolve(explicit)
    // A profile directory answers with the home above it, not itself.
    return /[\\/]profiles[\\/][^\\/]+$/.test(resolved) ? path.dirname(path.dirname(resolved)) : resolved
  }
  // The profile that loaded this plugin is the strongest available signal:
  // every profile lives at `<home>/profiles/<name>`, so the home is two levels
  // up regardless of where the bundle itself was linked from.
  const fromProfileDir = homeFromProfileDir()
  if (fromProfileDir !== undefined) return fromProfileDir
  for (const home of homeCandidates()) {
    if (isDshHome(home)) return home
  }
  return homeCandidates()[0] ?? path.resolve(process.cwd())
}

/**
 * Derive the home directory from the profile that loaded this bundle.
 *
 * `dsh` resolves a profile-installed bundle through
 * `<home>/profiles/<name>/node_modules/...`, so the module URL of either the
 * package or its link target reveals the home even when no environment
 * variable reaches the Host.
 *
 * @returns {string | undefined} home directory when one can be derived.
 */
function homeFromProfileDir() {
  const candidates = []
  try {
    candidates.push(fileURLToPath(import.meta.url))
  } catch {
    /* a non-file URL cannot name a directory */
  }
  // A symlinked install reports the profile path in the resolved module URL,
  // and the linked target otherwise; check both.
  for (const candidate of candidates) {
    const match = /^(.*)[\\/]profiles[\\/][^\\/]+[\\/](?:node_modules[\\/])?/.exec(candidate)
    if (match !== null && isDshHome(match[1])) return match[1]
  }
  return undefined
}

/**
 * Candidate home directories, most authoritative first.
 * @returns {string[]} absolute candidates.
 */
function homeCandidates() {
  const candidates = []
  const profileDir = process.env.DSH_PROFILE_DIR
  if (typeof profileDir === 'string' && profileDir.trim() !== '') {
    candidates.push(path.dirname(path.dirname(path.resolve(profileDir))))
  }
  // The real home is whichever candidate actually carries a DSH store; a
  // plugin's own location is only a hint, because a linked bundle lives in a
  // workspace far from the home it serves.
  const roots = [
    process.env.USERPROFILE,
    process.env.HOME,
    process.env.APPDATA,
  ].filter((value) => typeof value === 'string' && value.length > 3)
  for (const root of roots) {
    candidates.push(path.join(root, '.dsh'))
    candidates.push(path.join(root, 'dsh'))
  }
  return [...new Set(candidates.filter((entry) => entry !== '' && entry.length > 3))]
}

/**
 * Tell whether a directory looks like a DSH home.
 * @param {string} directory candidate.
 * @returns {boolean} true when it holds a profile or session store.
 */
function isDshHome(directory) {
  for (const marker of ['profiles', 'sessions', 'bot']) {
    try {
      if (existsSync(path.join(directory, marker))) return true
    } catch {
      /* an unreadable candidate is simply not a home */
    }
  }
  return false
}

/**
 * Stat one path without following a final symbolic link into another tree.
 * @param {string} target absolute path.
 * @returns {Promise<object>} metadata record.
 */
async function describePath(target) {
  const record = { path: target, exists: false }
  try {
    const stat = await fs.stat(target)
    record.exists = true
    record.kind = stat.isDirectory() ? 'directory' : 'file'
    record.size = stat.size
    record.mtime = stat.mtimeMs
    record.ctime = stat.ctimeMs
    if (stat.isFile() && stat.size <= MAX_TEXT_PREVIEW) {
      const text = await readTextPrefix(target, MAX_TEXT_PREVIEW)
      if (text !== undefined) {
        record.lines = text.split('\n').length
        record.preview = text
      }
    }
    return record
  } catch (error) {
    record.error = error?.code ?? 'unknown'
    return record
  }
}

/**
 * Read the start of one text file, refusing binary payloads.
 * @param {string} target absolute path.
 * @param {number} limit byte budget.
 * @returns {Promise<string | undefined>} text, or undefined when binary.
 */
async function readTextPrefix(target, limit) {
  let handle
  try {
    handle = await fs.open(target, 'r')
    const buffer = Buffer.alloc(limit)
    const { bytesRead } = await handle.read(buffer, 0, limit, 0)
    const slice = buffer.subarray(0, bytesRead)
    if (slice.includes(0)) return undefined
    return slice.toString('utf8')
  } catch {
    return undefined
  } finally {
    await handle?.close().catch(() => {})
  }
}

/**
 * Collect the memory files that belong to one Session: its own agent memory
 * and the shared team memory.
 * @param {string} sessionId current Session id.
 * @returns {Promise<object[]>} memory records.
 */
async function describeMemory(sessionId) {
  const root = path.join(dshHome(), 'bot', 'memory')
  const candidates = []
  if (typeof sessionId === 'string' && /^session-[0-9a-f-]{8,}$/i.test(sessionId)) {
    candidates.push({ scope: 'session', directory: path.join(root, 'bots', sessionId) })
  }
  candidates.push({ scope: 'team', directory: path.join(root, 'team') })
  const records = []
  for (const candidate of candidates) {
    let entries
    try {
      entries = await fs.readdir(candidate.directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries.slice(0, MAX_MEMORY_FILES)) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
      const target = path.join(candidate.directory, entry.name)
      const described = await describePath(target)
      records.push({ ...described, scope: candidate.scope })
    }
  }
  return records
}

/**
 * Locate the persisted journal files DSH wrote for one Session under any
 * workspace bucket in the Session store.
 * @param {string} sessionId current Session id.
 * @returns {Promise<object[]>} artifact records for the Session log tree.
 */
async function describeSessionArtifacts(sessionId) {
  if (typeof sessionId !== 'string' || !/^session-[0-9a-f-]{8,}$/i.test(sessionId)) return []
  const store = path.join(dshHome(), 'sessions')
  let buckets
  try {
    buckets = await fs.readdir(store, { withFileTypes: true })
  } catch {
    return []
  }
  const found = []
  for (const bucket of buckets) {
    if (!bucket.isDirectory()) continue
    const directory = path.join(store, bucket.name, sessionId)
    let files
    try {
      const stat = await fs.stat(directory)
      if (!stat.isDirectory()) continue
      files = await fs.readdir(directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.isFile()) continue
      const target = path.join(directory, file.name)
      const described = await describePath(target)
      found.push({ ...described, scope: 'session-log', bucket: bucket.name })
    }
  }
  return found
}

/**
 * Validate and normalize a requested path list.
 *
 * Attachment paths arrive as store-relative references (`objects/ab/<id>`),
 * because the journal records an attachment id rather than a location. They
 * are resolved against the attachment store here, where the home directory is
 * known, and a reference that does not exist on disk is dropped.
 *
 * @param {unknown} value raw request field.
 * @returns {string[]} deduplicated absolute paths.
 */
function normalizePaths(value) {
  if (!Array.isArray(value)) return []
  const storeRoot = (() => {
    try {
      return path.join(dshHome(), 'attachments', 'v1')
    } catch {
      return undefined
    }
  })()
  const seen = new Set()
  const out = []
  for (const candidate of value) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (trimmed === '' || trimmed.length > 1000) continue
    let absolute = path.isAbsolute(trimmed) ? path.normalize(trimmed) : undefined
    if (absolute === undefined && storeRoot !== undefined && /^objects[\\/][0-9a-f]{2}[\\/][0-9a-f]{8,}$/i.test(trimmed)) {
      const resolved = path.join(storeRoot, trimmed)
      if (existsSync(resolved)) absolute = resolved
    }
    if (absolute === undefined || seen.has(absolute)) continue
    seen.add(absolute)
    out.push(absolute)
    if (out.length >= MAX_PATHS) break
  }
  return out
}

/**
 * Answer one describe request.
 * @param {object} body parsed JSON body.
 * @returns {Promise<object>} describe result.
 */
/**
 * Read and decode one Session's persisted journal.
 *
 * The browser normally reads the journal from its own Session binding. A
 * Session that was never opened in this tab has no binding, so the detail
 * panel would wait forever; this route answers from the files on disk and
 * lets the panel describe any Session the user can see.
 *
 * @param {string} sessionId Session id to read.
 * @param {{ limit?: number }} [options] optional bound on returned events.
 * @returns {Promise<object>} decoded events in ascending seq order.
 */
export async function readJournal(sessionId, options = {}) {
  if (typeof sessionId !== 'string' || !/^session-[0-9a-f-]{8,}/i.test(sessionId)) {
    return { ok: false, error: 'invalid-session' }
  }
  const limit = Math.min(Math.max(Number(options.limit) || 5000, 1), 50000)
  const store = path.join(dshHome(), 'sessions')
  let buckets
  try {
    buckets = await fs.readdir(store)
  } catch {
    return { ok: false, error: 'no-session-store' }
  }
  for (const bucket of buckets) {
    const directory = path.join(store, bucket, sessionId)
    let files
    try {
      files = await fs.readdir(directory)
    } catch {
      continue
    }
    const log = files.filter((name) => name.startsWith('session') && name.endsWith('.jsonl.zstd')).sort().at(-1)
    if (log === undefined) continue
    const full = path.join(directory, log)
    const stat = await fs.stat(full)
    const key = `${stat.size}:${stat.mtimeMs}`
    const cached = journalCache.get(full)
    let events = cached?.key === key ? cached.events : undefined
    if (events === undefined) {
      events = await decodeZstdJournal(full)
      if (journalCache.size > 24) {
        const oldest = journalCache.keys().next().value
        if (oldest !== undefined) journalCache.delete(oldest)
      }
      journalCache.set(full, { key, events })
    }
    return { ok: true, path: full, events: events.slice(-limit) }
  }
  return { ok: false, error: 'session-not-found' }
}

/**
 * Decode a multi-frame zstd journal into its JSON records.
 *
 * The store writes one frame per append, so a whole-file zstd decompress only
 * yields the first frame; frames are located by their magic number and
 * decoded one at a time.
 *
 * @param {string} file journal path.
 * @returns {Promise<object[]>} decoded records in file order.
 */
export async function decodeZstdJournal(file) {
  const { zstdDecompressSync } = await import('node:zlib')
  const buffer = await fs.readFile(file)
  const records = []
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
  let offset = 0
  while (offset + 4 <= buffer.length) {
    const found = buffer.indexOf(magic, offset)
    if (found < 0) break
    let next = buffer.indexOf(magic, found + 4)
    if (next < 0) next = buffer.length
    try {
      const text = zstdDecompressSync(buffer.subarray(found, next)).toString('utf8')
      for (const line of text.split('\n')) {
        if (line.trim() === '') continue
        try {
          records.push(JSON.parse(line))
        } catch {
          /* a torn tail record is not a reason to drop the journal */
        }
      }
    } catch {
      /* a frame that fails to decode is skipped; the rest still load */
    }
    offset = next
  }
  return records.filter((record) => typeof record.seq === 'number').sort((a, b) => a.seq - b.seq)
}

export async function describeTask(body) {
  const requested = Array.isArray(body?.paths) ? body.paths.filter((entry) => typeof entry === 'string' && entry.trim() !== '') : []
  const paths = normalizePaths(requested)
  const files = []
  for (const target of paths) {
    const info = await describePath(target)
    // An attachment was requested by its store-relative id; echo the absolute
    // location it resolved to so the panel can show the real save path.
    const origin = requested.find((entry) => entry === target || (!path.isAbsolute(entry.trim()) && target.endsWith(path.normalize(entry.trim()))))
    files.push(origin !== undefined && origin !== target ? { ...info, resolvedPath: target } : info)
  }
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : undefined
  const [memory, artifacts] = await Promise.all([
    describeMemory(sessionId),
    describeSessionArtifacts(sessionId),
  ])
  return {
    ok: true,
    home: dshHome(),
    files,
    memory,
    artifacts,
    // A cheap fingerprint of the answer, so the panel can tell a changed
    // snapshot from a repeated request without diffing whole payloads.
    revision: createHash('sha1').update(JSON.stringify({ files, memory, artifacts })).digest('hex').slice(0, 12),
  }
}

/**
 * Read a bounded JSON request body.
 * @param {import('node:http').IncomingMessage} req incoming request.
 * @returns {Promise<unknown>} parsed body or undefined.
 */
async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > 1024 * 1024) return undefined
    chunks.push(chunk)
  }
  if (chunks.length === 0) return undefined
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
}

/**
 * Write one JSON response.
 * @param {import('node:http').ServerResponse} res response.
 * @param {number} status HTTP status.
 * @param {unknown} body JSON body.
 */
function writeJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(payload)
}

/**
 * Host plugin body: mount the describe route.
 * @param {object} ctx Host plugin context.
 */
export function apply(ctx) {
  ctx.effect(
    () => {
      const disposers = [
        ctx.webServer.register({
          kind: 'exact',
          path: JOURNAL_ROUTE,
          handler: async (req, res) => {
            const url = new URL(req.url ?? '/', 'http://localhost')
            if (req.method !== 'GET') {
              writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
              return
            }
            try {
              writeJson(res, 200, await readJournal(url.searchParams.get('sessionId') ?? '', {}))
            } catch (error) {
              writeJson(res, 500, { ok: false, error: String(error?.message ?? error) })
            }
          },
        }),
        ctx.webServer.register({
          kind: 'exact',
          path: DETAILS_ROUTE,
          handler: async (req, res) => {
            if (req.method !== 'POST') {
              writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
              return
            }
            const body = await readJsonBody(req)
            if (body === undefined) {
              writeJson(res, 400, { ok: false, error: 'invalid-body' })
              return
            }
            try {
              writeJson(res, 200, await describeTask(body))
            } catch (error) {
              ctx.logger?.warn?.('ui-task-details: describe failed', error)
              writeJson(res, 500, { ok: false, error: 'describe-failed' })
            }
          },
        }),
      ]
      return () => {
        for (const dispose of disposers) dispose()
      }
    },
    'ui-task-details: routes',
  )
}

export const inject = ['webServer']
