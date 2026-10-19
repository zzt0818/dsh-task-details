/**
 * Task aggregation over durable Session events.
 *
 * One "task" is one Turn in the Session journal: from `turn/start` to
 * `turn/end`. Everything the detail panel shows is folded from the events the
 * Session Controller already streamed to the browser, so the panel never
 * re-reads the log and stays correct across reconnect, replay, and history
 * paging.
 *
 * Pure module: no DOM, no services. The client bundle wraps it.
 */

/** Tools that only read, and therefore contribute input files rather than artifacts. */
const READ_TOOLS = new Set(['read', 'read_image', 'grep', 'glob'])
/** Tools that write files. */
const WRITE_TOOLS = new Set(['write', 'edit', 'apply_patch'])
/** Tools that may create files as a side effect of a command. */
const COMMAND_TOOLS = new Set(['bash', 'pwsh', 'exec_command', 'write_stdin', 'run_code'])
/** Tools that deliver files to the user. */
const DELIVER_TOOLS = new Set(['present'])

/** Event types that belong to exactly one Turn. */
const TURN_EVENTS = new Set([
  'turn/start',
  'turn/end',
  'user/message',
  'assistant/message',
  'tool/call',
  'tool/result',
  'deliverables/presented',
  'command/run',
])

/**
 * Every content block of an Assistant message, flattened.
 * @param {object | undefined} message assistant message record.
 * @returns {object[]} blocks.
 */
function blocksOf(message) {
  const content = message?.content
  return Array.isArray(content) ? content : []
}

/**
 * Text of one tool result message, joining every text block.
 * @param {object | undefined} message tool message record.
 * @returns {string} joined text.
 */
function textOf(message) {
  return blocksOf(message)
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

/**
 * Parse tool-call arguments defensively; a malformed call contributes nothing.
 * @param {unknown} raw recorded argument string.
 * @returns {Record<string, unknown>} parsed object or empty.
 */
function argsOf(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return {}
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Sum two usage records field by field, omitting unavailable buckets.
 * @param {object | undefined} total accumulated usage.
 * @param {object | undefined} next one attempt's usage.
 * @returns {object | undefined} summed usage.
 */
function addUsage(total, next) {
  if (next === undefined) return total
  const out = { ...(total ?? {}) }
  for (const [key, value] of Object.entries(next)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    out[key] = (out[key] ?? 0) + value
  }
  return out
}

/**
 * Extract model identity from a source record.
 * @param {object | undefined} source message source.
 * @returns {{ provider?: string, model?: string } | undefined} model identity.
 */
function modelOf(source) {
  if (source?.kind !== 'model') return undefined
  return { provider: source.provider, model: source.model }
}

/**
 * User-visible text of one user message plus its attachment references.
 * @param {object} message user message record.
 * @returns {{ text: string, images: string[], files: object[] }} content summary.
 */
function userContentOf(message) {
  const images = []
  const files = []
  let text = ''
  for (const block of blocksOf(message)) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      text += (text === '' ? '' : '\n') + block.text
      continue
    }
    // A pasted image or attached file arrives as a recorded attachment: its id,
    // media type, byte size, and display name. That record is the only place
    // the original name survives, so read it rather than guessing a path.
    const attachment = block?.attachment
    if (attachment !== undefined && typeof attachment === 'object') {
      const name = typeof attachment.name === 'string' && attachment.name !== '' ? attachment.name : attachment.mediaType ?? 'attachment'
      if (block.type === 'image' || String(attachment.mediaType ?? '').startsWith('image/')) {
        images.push({
          name,
          bytes: attachment.bytes,
          mediaType: attachment.mediaType,
          attachmentId: attachment.attachmentId,
          // The store keeps every upload at objects/<first two hex>/<full id>.
          // The journal records the id as `sha256:<hex>`, so the prefix is
          // stripped before the path is rebuilt.
          path: typeof attachment.attachmentId === 'string' && /^[0-9a-f]{8,}$/i.test(attachment.attachmentId.replace(/^sha256:/i, ''))
            ? 'objects/' + attachment.attachmentId.replace(/^sha256:/i, '').slice(0, 2) + '/' + attachment.attachmentId.replace(/^sha256:/i, '')
            : attachment.path,
        })
      } else {
        files.push({ name, path: attachment.path, size: attachment.bytes, mediaType: attachment.mediaType })
      }
      continue
    }
    if (block?.type === 'image' || block?.type === 'image-url') {
      images.push({ name: block.name ?? block.path ?? 'image' })
    } else if (block?.type === 'file' || block?.type === 'file-reference') {
      files.push({ name: block.name ?? block.path ?? 'file', path: block.path, size: block.size })
    }
  }
  return { text: text.trim(), images, files }
}


/**
 * A mutable per-Turn accumulator.
 */
class TurnRecord {
  constructor(turn, seq, time) {
    this.turn = turn
    this.startSeq = seq
    this.startTime = time
    this.endSeq = undefined
    this.endTime = undefined
    this.endReason = undefined
    this.inputs = []
    this.calls = []
    this.usage = undefined
    this.models = []
    this.replies = []
    this.notes = []
    this.commandRuns = 0
  }
}

/**
 * Fold the currently loaded Session window into one record per Turn.
 *
 * The fold is a pure function of the entry list, so the caller can recompute it
 * on every journal publication (replace, prepend, or append) and reuse the
 * previous result when nothing changed.
 *
 * @param {readonly { event: object }[]} entries durable Session entries in ascending seq order.
 * @returns {{ turns: TurnRecord[], byNumber: Map<number, TurnRecord> }} the fold result.
 */
export function foldTurns(entries) {
  /** @type {Map<number, TurnRecord>} */
  const byNumber = new Map()
  /** @type {Map<string, { call: object, turn: TurnRecord }>} */
  const callsById = new Map()
  /** Prompts recorded before their Turn started, claimed by the next start. */
  const pendingInputs = []
  let current

  const recordFor = (turn, seq, time) => {
    let record = byNumber.get(turn)
    if (record === undefined) {
      record = new TurnRecord(turn, seq, time)
      byNumber.set(turn, record)
    }
    return record
  }
  const active = (turn, seq, time) => {
    if (current !== undefined && current.turn === turn) return current
    current = recordFor(turn, seq, time)
    return current
  }

  for (const entry of entries) {
    const event = entry?.event
    if (event === undefined) continue
    const data = event.data ?? {}
    // Every task-scoped event names its Turn. An event without one belongs to
    // no task (a session-level command, for example) and must not create a
    // phantom Turn.
    // A user message can precede its own turn/start; it still belongs to the
    // task being started, so only the later structural events require a Turn.
    if (TURN_EVENTS.has(event.type) && !Number.isFinite(Number(data.turn)) && event.type !== 'user/message') continue
    switch (event.type) {
      case 'turn/start': {
        const record = recordFor(data.turn, event.seq, event.time)
        record.startSeq = event.seq
        record.startTime = event.time
        current = record
        // Any prompt recorded before this start belongs to it.
        for (const held of pendingInputs.splice(0)) {
          const content = userContentOf(held.event.data)
          if (content.text !== '' || content.images.length > 0 || content.files.length > 0) {
            record.inputs.push({
              id: held.event.data.id,
              seq: held.event.seq,
              time: held.event.time,
              ...content,
            })
          }
        }
        break
      }
      case 'turn/end': {
        const record = active(data.turn, event.seq, event.time)
        record.endSeq = event.seq
        record.endTime = event.time
        record.endReason = data.reason
        break
      }
      case 'user/message': {
        // A Turn's user message is recorded just before its `turn/start`, so the
        // message carries no Turn of its own. Hold it pending; the next
        // `turn/start` claims it. Without this, every prompt in a Session
        // collapses into one unnamed task.
        if (!Number.isFinite(Number(data.turn))) {
          pendingInputs.push({ event })
          break
        }
        const record = byNumber.get(data.turn) ?? active(data.turn, event.seq, event.time)
        const content = userContentOf(data)
        if (content.text !== '' || content.images.length > 0 || content.files.length > 0) {
          record.inputs.push({ id: data.id, seq: event.seq, time: event.time, ...content })
        }
        break
      }
      case 'assistant/message': {
        const record = active(data.turn, event.seq, event.time)
        record.usage = addUsage(record.usage, data.usage)
        const model = modelOf(data.message?.source)
        if (model !== undefined && !record.models.some((m) => m.provider === model.provider && m.model === model.model)) {
          record.models.push(model)
        }
        const text = blocksOf(data.message)
          .filter((block) => block?.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text)
          .join('\n')
          .trim()
        if (text !== '') record.replies.push({ seq: event.seq, text })
        break
      }
      case 'tool/call': {
        const record = active(data.turn, event.seq, event.time)
        const call = {
          callId: data.callId,
          name: data.name,
          args: argsOf(data.arguments),
          seq: event.seq,
          time: event.time,
          turn: data.turn,
          step: data.step,
          status: 'pending',
          durationMs: undefined,
          isError: false,
          resultText: '',
        }
        record.calls.push(call)
        if (typeof data.callId === 'string') callsById.set(data.callId, { call, turn: record })
        break
      }
      case 'tool/result': {
        const callId = data.message?.toolCallId ?? data.toolCallId
        const found = typeof callId === 'string' ? callsById.get(callId) : undefined
        const call = found?.call
        if (call === undefined) break
        call.status = 'done'
        call.isError = data.message?.isError === true || data.error !== undefined
        call.durationMs = typeof call.time === 'number' ? Math.max(0, event.time - call.time) : undefined
        call.resultText = textOf(data.message).slice(0, 4000)
        break
      }
      case 'deliverables/presented': {
        const record = active(data.turn, event.seq, event.time)
        const files = Array.isArray(data.files) ? data.files : []
        record.notes.push({ kind: 'delivered', files })
        break
      }
      case 'command/run': {
        const record = active(data.turn, event.seq, event.time)
        record.commandRuns += 1
        break
      }
      default:
        break
    }
  }

  return { turns: [...byNumber.values()].sort((a, b) => a.turn - b.turn), byNumber }
}

/**
 * Classify one path by the section it belongs to.
 * @param {string} filePath absolute or relative path.
 * @returns {'input' | 'output' | 'intermediate'} section.
 */
function classifyPath(filePath) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  if (normalized.includes('/.dsh/') || normalized.includes('/.dsh\\') || /\/\.dsh\//.test(`/${normalized}/`)) return 'intermediate'
  if (/(\/|^)(node_modules|__pycache__|dist|build|\.cache)\//.test(normalized)) return 'intermediate'
  if (/\.(tmp|temp|bak|log|lock)$/.test(normalized)) return 'intermediate'
  if (/\/(_probe|probe)[^/]*\./.test(normalized)) return 'intermediate'
  return 'output'
}

/**
 * Path candidates recorded by one tool call, with the role that call gave them.
 *
 * A read only contributes a file when the argument names one: `glob` names a
 * search directory and `grep` may name either, so those must not turn a whole
 * folder into an "input file".
 *
 * @param {object} call recorded tool call.
 * @returns {{ path: string, role: 'read' | 'write' | 'deliver', tool: string }[]} candidates.
 */
function pathCandidates(call) {
  const args = call.args ?? {}
  const out = []
  const push = (value, role) => {
    if (typeof value !== 'string' || value.trim() === '') return
    out.push({ path: value.trim(), role, tool: call.name })
  }
  if (call.name === 'read' || call.name === 'read_image') {
    push(args.file_path ?? args.path, 'read')
  } else if (call.name === 'grep') {
    // A single-file target is an input; a directory target is a search scope.
    const target = args.file_path ?? args.path
    if (typeof target === 'string' && /\.[A-Za-z0-9]{1,8}$/.test(target)) push(target, 'read')
  }
  // `glob` names a search directory and contributes no input file.
  if (WRITE_TOOLS.has(call.name) || DELIVER_TOOLS.has(call.name)) {
    if (call.name === 'present' && Array.isArray(args.files)) {
      for (const file of args.files) push(file?.path, 'deliver')
    } else {
      push(args.file_path ?? args.path, 'write')
    }
  }
  // `<path>` markers in a tool result identify the file a structured editor
  // actually touched, which is the most reliable output signal available.
  if (typeof call.resultText === 'string' && call.resultText !== '') {
    for (const match of call.resultText.matchAll(/<path>\s*([^<>\n]+?)\s*<\/path>/g)) {
      push(match[1], 'write')
    }
  }
  return out
}

/**
 * Count skill invocations by name from the recorded calls.
 * @param {object[]} calls all calls of one turn.
 * @returns {{ name: string, count: number, failed: number }[]} skill rows.
 */
function skillsOf(calls) {
  const rows = new Map()
  for (const call of calls) {
    if (call.name !== 'skill') continue
    const name = typeof call.args?.name === 'string' ? call.args.name : typeof call.args?.skill === 'string' ? call.args.skill : 'skills'
    const row = rows.get(name) ?? { name, count: 0, failed: 0 }
    row.count += 1
    if (call.isError) row.failed += 1
    rows.set(name, row)
  }
  return [...rows.values()].sort((a, b) => b.count - a.count)
}

/**
 * Short, human-readable tool call summary for the flow diagram.
 * @param {object} call recorded tool call.
 * @returns {string} summary.
 */
export function summarizeCall(call) {
  const args = call.args ?? {}
  if (typeof args.description === 'string' && args.description.trim() !== '') return args.description.trim()
  if (typeof args.file_path === 'string') return args.file_path
  if (typeof args.path === 'string') return args.path
  if (typeof args.pattern === 'string') return args.pattern
  if (typeof args.name === 'string') return args.name
  if (typeof args.command === 'string') return args.command
  if (typeof args.query === 'string') return args.query
  return ''
}

/**
 * Build the panel model for one Turn.
 *
 * @param {{ turns: TurnRecord[], byNumber: Map<number, TurnRecord> }} fold fold result.
 * @param {number} turnNumber the Turn to describe.
 * @param {{ cwd?: string, metadata?: Map<string, object>, sessionId?: string }} options
 *   Host-provided file metadata keyed by absolute path, plus the Session cwd.
 * @returns {object | null} panel model, or null when the Turn is not loaded.
 */
export function buildTaskModel(fold, turnNumber, options = {}) {
  const turn = fold.byNumber.get(turnNumber)
  if (turn === undefined) return null
  const metadata = options.metadata ?? new Map()

  /** @type {Map<string, object>} */
  const files = new Map()
  const addFile = (candidate, source) => {
    const key = candidate.path
    const existing = files.get(candidate.path)
    if (existing !== undefined) {
      if (candidate.role === 'deliver') existing.role = 'deliver'
      else if (candidate.role === 'write' && existing.role === 'read') existing.role = 'write'
      existing.sources.add(source)
      // A later call must not downgrade the deliver role recorded by `present`.
      if (existing.role === 'deliver') existing.section = 'output'
      return
    }
    const synthetic = key.startsWith('[image] ')
    const meta = synthetic ? { exists: true } : metadata.get(key) ?? metadata.get(key.replace(/\\/g, '/')) ?? {}
    files.set(key, {
      path: key,
      name: key.split(/[\\/]/).pop() ?? key,
      role: candidate.role,
      tool: candidate.tool,
      // A file the agent read is not a file the user gave it. Reading a source
      // file is work the task did, so those files belong to its outputs unless
      // a write claim is stronger. Only attachments seed the input section.
      section: classifyPath(key),
      sources: new Set([source]),
      exists: meta.exists,
      size: meta.size,
      mtime: meta.mtime,
      lines: meta.lines,
      kind: meta.kind,
      error: meta.error,
    })
  }

  for (const call of turn.calls) {
    for (const candidate of pathCandidates(call)) addFile(candidate, call.name)
  }

  // The user's own files, which are the only true inputs of a task: an image
  // pasted into the message, or a file sent alongside it. They are tracked by
  // name so the panel can list them even when the journal records no path.
  const userFiles = []
  for (const input of turn.inputs) {
    for (const image of input.images ?? []) {
      const name = typeof image === 'string' ? image : image?.name
      if (name === undefined || name === '') continue
      // The journal records only an attachment id. The store-relative path is
      // passed through so the Host can resolve it against the attachment store
      // and the panel can show where the original file lives.
      const relative = typeof image?.path === 'string' ? image.path : undefined
      userFiles.push({
        path: relative ?? '[image] ' + name,
        name,
        role: 'read',
        tool: 'attachment',
        section: 'input',
        sources: ['attachment'],
        kind: 'file',
        exists: true,
        size: image?.bytes ?? image?.size,
      })
    }
    for (const file of input.files ?? []) {
      const name = typeof file?.name === 'string' && file.name !== '' ? file.name : typeof file?.path === 'string' ? file.path.split(/[\\/]/).pop() : undefined
      if (name === undefined || name === '') continue
      userFiles.push({ path: typeof file?.path === 'string' && file.path !== '' ? file.path : name, name, role: 'read', tool: 'attachment', section: 'input', sources: ['attachment'], kind: 'file', exists: true, size: file?.bytes })
    }
  }

  const fileRows = [...files.values()].map((file) => ({ ...file, sources: [...file.sources] }))
  const toolCounts = new Map()
  for (const call of turn.calls) {
    const row = toolCounts.get(call.name) ?? { name: call.name, count: 0, failed: 0, totalMs: 0 }
    row.count += 1
    if (call.isError) row.failed += 1
    if (typeof call.durationMs === 'number') row.totalMs += call.durationMs
    toolCounts.set(call.name, row)
  }

  const delivered = []
  for (const note of turn.notes) {
    if (note.kind === 'delivered') {
      for (const file of note.files) {
        if (typeof file?.path === 'string') delivered.push({ path: file.path, description: file.description })
      }
    }
  }

  const steps = [...new Set(turn.calls.map((call) => call.step))].sort((a, b) => a - b)
  const failedCalls = turn.calls.filter((call) => call.isError)
  const ended = turn.endSeq !== undefined

  // A file the user attached and the agent later wrote to is still an input:
  // keep it in one place instead of listing the same name in two sections.
  // Attachments are identified by their path, so three pasted screenshots that
  // all happen to be called image.png stay three distinct inputs.
  const seenInput = new Set()
  const uniqueInputs = userFiles.filter((file) => {
    if (seenInput.has(file.path)) return false
    seenInput.add(file.path)
    return true
  })
  const userPaths = new Set(uniqueInputs.map((file) => file.path))
  const workFiles = fileRows.filter((file) => !userPaths.has(file.path))
  const allRows = [...uniqueInputs, ...workFiles]

  return {
    turn: turn.turn,
    sessionId: options.sessionId,
    cwd: options.cwd,
    startedAt: turn.startTime,
    endedAt: turn.endTime,
    durationMs: turn.startTime !== undefined && turn.endTime !== undefined ? Math.max(0, turn.endTime - turn.startTime) : undefined,
    status: ended ? reasonKind(turn.endReason) : 'running',
    reason: turn.endReason,
    inputs: turn.inputs,
    replies: turn.replies,
    files: allRows,
    sections: {
      input: allRows.filter((file) => file.section === 'input'),
      intermediate: allRows.filter((file) => file.section === 'intermediate'),
      output: allRows.filter((file) => file.section === 'output'),
    },
    delivered,
    calls: turn.calls,
    failedCalls,
    tools: [...toolCounts.values()].sort((a, b) => b.count - a.count),
    skills: skillsOf(turn.calls),
    usage: turn.usage,
    models: turn.models,
    steps,
    commandRuns: turn.commandRuns,
    hasMemory: Boolean(options.hasMemory),
  }
}

/**
 * Normalize a recorded Turn end reason into a status word.
 * @param {object | undefined} reason recorded reason.
 * @returns {string} status.
 */
export function reasonKind(reason) {
  const kind = reason?.kind
  if (typeof kind === 'string') return kind
  return 'completed'
}

/** Re-exported for the client bundle's tests. */
export const internals = { classifyPath, pathCandidates, addUsage, userContentOf }

/**
 * Group one task's tool calls into the few plain-language phases a reader
 * cares about.
 *
 * A task can make dozens of calls across many steps; listing them one by one
 * reads like a debug trace, not like an account of what happened. Calls are
 * bucketed by what they achieved - explore, change, run, check, deliver - and
 * consecutive calls of the same kind merge into one phase, so the diagram
 * follows the shape of the work.
 *
 * @param {object} model the panel model for one task.
 * @param {(call: object) => string} describe tool-call summary.
 * @returns {{ kind: string, tools: string[], calls: object[], failed: number, first: number, last: number }[]} phases.
 */
export function summarizePhases(model, describe) {
  const kindOf = (call) => {
    const name = call.name
    if (['read', 'read_image', 'grep', 'glob', 'web_search', 'web_fetch', 'task_board_list'].includes(name)) return 'explore'
    if (['write', 'edit', 'apply_patch'].includes(name)) return 'change'
    if (['bash', 'pwsh', 'exec_command', 'write_stdin', 'run_code', 'terminal_exec'].includes(name)) return 'run'
    if (name === 'present') return 'deliver'
    if (name === 'ask_user_question' || name === 'ask_user') return 'ask'
    if (name === 'skill') return 'skill'
    if (name === 'todo_write' || name.startsWith('task_board_')) return 'plan'
    if (name.startsWith('job_')) return 'parallel'
    return 'other'
  }

  // One entry per distinct kind, in order of first appearance. Repeated
  // alternation adds to the existing entry instead of producing a new chip.
  const byKind = new Map()
  for (const call of model.calls ?? []) {
    const kind = kindOf(call)
    let phase = byKind.get(kind)
    if (phase === undefined) {
      phase = { kind, calls: [], failed: 0, first: call.seq, last: call.seq, sample: [] }
      byKind.set(kind, phase)
    }
    phase.calls.push(call)
    if (call.isError) phase.failed += 1
    phase.last = call.seq
  }

  const phases = [...byKind.values()].sort((left, right) => left.first - right.first)
  for (const phase of phases) {
    const samples = phase.calls.map((call) => describe(call)).filter(Boolean)
    // Keep the distinct summaries, so a merged phase shows what it covered.
    phase.sample = [...new Set(samples)].slice(0, 4)
    // The tools behind the phase. Without them a chip says "changing files"
    // and leaves the reader guessing whether that meant write, edit, or both.
    phase.tools = [...new Set(phase.calls.map((call) => call.name))]
    // The step number this phase first appears in, so the reader can tell a
    // task that planned before acting from one that acted immediately.
    phase.firstStep = phase.calls[0]?.step
    phase.lastStep = phase.calls[phase.calls.length - 1]?.step
    // How much of the task this phase spans. A run that covers steps 2-113 was
    // happening throughout; one confined to steps 7-10 was a single moment.
    // That is the distinction a count of calls cannot make.
    phase.span = model.steps.length > 1 && phase.firstStep !== undefined && phase.lastStep !== undefined
      ? (phase.lastStep - phase.firstStep) / Math.max(1, model.steps[model.steps.length - 1] - model.steps[0])
      : 1
    // Files this phase actually touched, most specific signal of its reach.
    phase.files = [...new Set(phase.calls.map((call) => describe(call)).filter(Boolean))]
      .filter((text) => /[\\/]|\.[A-Za-z0-9]{1,8}$/.test(text))
      .slice(0, 3)
  }
  return phases
}

/**
 * Describe what a task produced, in the reader's terms rather than the tool's.
 *
 * @param {object} model the panel model for one task.
 * @returns {object[]} human-readable outcome lines.
 */
export function summarizeOutcome(model) {
  const lines = []
  const outputFiles = model.sections?.output ?? []
  const delivered = model.delivered ?? []
  if (delivered.length > 0) {
    lines.push({ kind: 'delivered', files: delivered.map((file) => file.path) })
  }
  const written = outputFiles.filter((file) => file.role === 'write')
  if (written.length > 0) lines.push({ kind: 'written', files: written.map((file) => file.path) })
  if ((model.failedCalls ?? []).length > 0) {
    lines.push({ kind: 'failed', count: model.failedCalls.length })
  }
  if ((model.skills ?? []).length > 0) {
    lines.push({ kind: 'skills', names: model.skills.map((skill) => skill.name) })
  }
  return lines
}
