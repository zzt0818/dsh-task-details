window.__ModuleLoader__.load({
  id: 'dsh-task-details',
  factory(require) {
    const __exports = {}
    const __modules = {}
    const __define = (name, build) => { if (__modules[name] === undefined) __modules[name] = build() }
    __define("model.js", () => {
      // ---- model.js ----
      /** @type {string} The tab kind this package owns. */
      const DETAILS_KIND = 'task-details'
      /** @type {string} This implementation's identity in the tab system, and the key its body registers under. */
      const DETAILS_ID = 'dsh-task-details'
      /** @type {string} Locale namespace. */
      const NS = 'taskDetails'
      /** @type {string} Preference key shared by every tab of this type. */
      const PREFERENCE_KEY = 'dsh.task-details.v1'
      /** @type {number} Panel width bounds, in CSS pixels. */
      const WIDTH_MIN = 320
      const WIDTH_MAX = 860
      const WIDTH_DEFAULT = 460
      /** @type {number} Width at or above which file rows expand into full detail. */
      const WIDTH_DETAILED = 560
      /** @type {number} Width below which the panel switches to the stacked single column. */
      const WIDTH_STACKED = 430
      /** @type {number} Route served by the Host half. */
      const DETAILS_ROUTE = '/api/plugins/ui-task-details/describe'
      const JOURNAL_ROUTE = '/api/plugins/ui-task-details/journal'

      /**
       * Build the address of one task's tab.
       * @param {string} sessionId Session owning the task.
       * @param {number} turn Turn number.
       * @returns {string} a `dsh-resource://` address.
       */
      function taskAddress(sessionId, turn) {
        return `dsh-resource://${DETAILS_KIND}/session/${encodeURIComponent(sessionId)}/turn/${turn}`
      }

      /**
       * Read the Session id and Turn number back out of an address.
       * @param {string} address recorded tab address.
       * @returns {{ sessionId: string, turn: number } | null} parsed coordinates.
       */
      function parseTaskAddress(address) {
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
      function usageBucket(usage, bucket) {
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
      function formatBytes(bytes) {
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
      function formatCount(value) {
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
      function formatDuration(ms) {
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
      function formatTime(time) {
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
      function clampWidth(value) {
        const numeric = typeof value === 'number' && Number.isFinite(value) ? value : WIDTH_DEFAULT
        return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Math.round(numeric)))
      }

      /**
       * Hide the home directory in a displayed path without losing the tail.
       * @param {string} filePath absolute path.
       * @returns {string} path with the user profile abbreviated.
       */
      function prettyPath(filePath) {
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
      function directoryOf(filePath) {
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
      function fileAddress(sessionId, filePath) {
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
      function languageSummary(model) {
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
      function reuseVerdict(model) {
        const reasons = []
        if ((model.delivered ?? []).length > 0) reasons.push({ key: 'reusable.delivered' })
        if ((model.skills ?? []).length > 0) reasons.push({ key: 'reusable.skill', params: { names: model.skills.map((skill) => skill.name).join(', ') } })
        const scripts = (model.sections?.output ?? []).filter((file) => /\.(ps1|sh|bat|cmd|py|mjs|cjs|js|ts)$/i.test(file.path))
        if (scripts.length > 0) reasons.push({ key: 'reusable.artifact' })
        const projectWrites = (model.sections?.output ?? []).filter((file) => file.role === 'write').length
        if (reasons.length === 0 && projectWrites > 0) reasons.push({ key: 'reusable.project' })
        return { reusable: reasons.length > 0, reasons }
      }

      __exports["model.js"] = { taskAddress, parseTaskAddress, usageBucket, formatBytes, formatCount, formatDuration, formatTime, clampWidth, prettyPath, directoryOf, fileAddress, languageSummary, reuseVerdict, DETAILS_KIND, DETAILS_ID, NS, PREFERENCE_KEY, WIDTH_MIN, WIDTH_MAX, WIDTH_DEFAULT, WIDTH_DETAILED, WIDTH_STACKED, DETAILS_ROUTE, JOURNAL_ROUTE };

      return __exports["model.js"] ?? {}
    })
    __define("analyzer.js", () => {
      // ---- analyzer.js ----
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
      function foldTurns(entries) {
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
      function summarizeCall(call) {
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
      function buildTaskModel(fold, turnNumber, options = {}) {
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
      function reasonKind(reason) {
        const kind = reason?.kind
        if (typeof kind === 'string') return kind
        return 'completed'
      }

      /** Re-exported for the client bundle's tests. */
      const internals = { classifyPath, pathCandidates, addUsage, userContentOf }

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
      function summarizePhases(model, describe) {
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
      function summarizeOutcome(model) {
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

      __exports["analyzer.js"] = { foldTurns, summarizeCall, buildTaskModel, reasonKind, summarizePhases, summarizeOutcome, internals };

      return __exports["analyzer.js"] ?? {}
    })
    __define("copy.js", () => {
      // ---- copy.js ----
      /**
       * Copy for the task-details panel. The client bundle imports this module and
       * registers both dictionaries with the Client locale service.
       */

      const zh = {
        'button.label': '查看任务详情',
        'button.title': '查看任务详情',
        'button.running': '任务进行中，结束后可查看详情',
        'type.label': '任务详情',
        'type.entryTitle': '任务详情',
        'type.entryDescription': '查看任务的输入、产物、工具与模型用量',
        'panel.heading': '任务详情',
        'panel.subtitle': '第 {turn} 个任务',
        'panel.close': '关闭',
        'panel.refresh': '刷新文件信息',
        'panel.resize': '拖拽调整宽度',
        'status.running': '进行中',
        'status.completed': '已完成',
        'status.error': '失败',
        'status.interrupted': '已中断',
        'status.blocked': '已阻止',
        'status.cancelled': '已取消',
        'metrics.duration': '耗时',
        'metrics.steps': '步骤',
        'metrics.calls': '工具调用',
        'metrics.files': '涉及文件',
        'metrics.tokens': 'Token',
        'metrics.cacheHit': '缓存命中',
        'metrics.cost': '估算费用',
        'overview.title': '任务概况',
        'overview.turn': '任务',
        'overview.status': '状态',
        'overview.model': '模型',
        'overview.started': '开始时间',
        'overview.reason': '结束原因',
        'overview.session': '会话',
        'overview.workspace': '工作目录',
        'section.inputs': '输入的文件',
        'section.intermediate': '中间产物',
        'section.outputs': '输出的文件/产物',
        'section.tools': '使用的工具/skill',
        'section.language': '使用的语言或其他',
        'section.reusable': '可复用/生成本地技能/工具？',
        'section.flow': '对话任务的流程/框架',
        'section.usage': '模型的提供方、模型名称、模型的用量、对话缓存输入输出',
        'empty.inputs': '暂无',
        'empty.intermediate': '暂无',
        'empty.outputs': '暂无',
        'empty.tools': '暂无',
        'empty.language': '暂无',
        'empty.flow': '暂无',
        'empty.usage': '暂无用量数据',
        'input.userText': '用户消息',
        'input.attachment': '附件',
        'file.kind.file': '文件',
        'file.kind.directory': '目录',
        'file.exists': '存在',
        'file.missing': '不存在或不可访问',
        'file.size': '大小',
        'file.modified': '修改时间',
        'file.lines': '行数',
        'file.path': '保存路径',
        'file.section.input': '输入',
        'file.section.intermediate': '中间产物',
        'file.section.output': '输出',
        'file.role.read': '读取',
        'file.role.write': '写入',
        'file.role.deliver': '交付',
        'file.open': '打开预览',
        'file.reveal': '复制路径',
        'file.copied': '已复制',
        'tools.calls': '{count} 次',
        'tools.failed': '失败 {count}',
        'tools.avg': '平均 {ms}',
        'tools.skill': '技能',
        'language.platform': '平台',
        'language.tools': '工具',
        'language.commands': '命令执行',
        'language.shells': '命令行',
        'language.scripts': '脚本/代码',
        'language.skills': '技能',
        'language.langs': '语言',
        'language.platformValue': '{os} / {arch}',
        'language.commandCount': '{count} 次命令',
        'language.shellWithCount': '{shell} {count} 次',
        'reusable.yes': '以下内容可复用',
        'reusable.no': '本任务没有明显的可复用产出（未写入脚本或技能文件）。',
        'reusable.delivered': '已交付文件，可直接复用',
        'reusable.skill': '调用了技能：{names}',
        'reusable.artifact': '生成了可复用的脚本/产物',
        'reusable.project': '修改了项目文件',
        'flow.node.start': '开始',
        'flow.node.end': '结束',
        'flow.node.step': '步骤 {step}',
        'flow.calls': '{count} 次调用',
        'flow.failed': '{count} 次失败',
        'flow.empty': '本任务没有工具调用。',
        'flow.steps': '第 {from}–{to} 步',
        'flow.throughout': '贯穿全程',
        'flow.start': '开始',
        'flow.end': '结束',
        'usage.provider': '提供方',
        'usage.model': '模型名称',
        'usage.input': '输入 Token',
        'usage.uncachedInput': '未缓存输入',
        'usage.output': '输出 Token',
        'usage.cacheRead': '缓存读取',
        'usage.cacheWrite': '缓存写入',
        'usage.reasoning': '推理 Token',
        'usage.total': '总计',
        'usage.cacheHitRate': '缓存命中率',
        'usage.missing': '该任务未记录用量',
        'usage.price': '估算费用（按 {provider}/{model} 单价）',
        'usage.preview': 'Token 统计',
        'loading': '正在读取文件信息…',
        'error.title': '无法读取任务详情',
        'error.retry': '重试',
        'meta.summary': '{files} 个文件 · {tools} 种工具 · {calls} 次调用',
        'phase.explore': '了解情况',
        'phase.change': '修改文件',
        'phase.run': '运行验证',
        'phase.deliver': '交付结果',
        'phase.ask': '向你确认',
        'phase.skill': '调用技能',
        'phase.plan': '整理计划',
        'phase.parallel': '并行执行',
        'phase.other': '其他操作',
        'phase.calls': '{count} 次',
        'outcome.delivered': '交付了 {count} 个文件，可直接使用',
        'outcome.written': '写入或修改了 {count} 个文件',
        'outcome.failed': '有 {count} 次工具调用失败，可参考流程排查',
        'outcome.skills': '使用了技能：{names}',
        'reusable.none': '本任务没有产出可复用的内容。',
        'noCoordinates': '无法确定该标签页对应的任务。',
        'emptyJournal': '该会话还没有写入任何事件。',
        'turnNotLoaded': '任务 {turn} 不在已加载的日志中。',
        'turnNotLoadedHint': '这可能是一个刚创建或尚未执行的任务。',
      }

      const en = {
        'button.label': 'View task details',
        'button.title': 'View task details',
        'button.running': 'Task running; details are available once it finishes',
        'type.label': 'Task details',
        'type.entryTitle': 'Task details',
        'type.entryDescription': "A task's inputs, artifacts, tools, and model usage",
        'panel.heading': 'Task details',
        'panel.subtitle': 'Task {turn}',
        'panel.close': 'Close',
        'panel.refresh': 'Refresh file information',
        'panel.resize': 'Drag to resize',
        'status.running': 'Running',
        'status.completed': 'Completed',
        'status.error': 'Failed',
        'status.interrupted': 'Interrupted',
        'status.blocked': 'Blocked',
        'status.cancelled': 'Cancelled',
        'metrics.duration': 'Duration',
        'metrics.steps': 'Steps',
        'metrics.calls': 'Tool calls',
        'metrics.files': 'Files',
        'metrics.tokens': 'Tokens',
        'metrics.cacheHit': 'Cache hit',
        'metrics.cost': 'Est. cost',
        'overview.title': 'Overview',
        'overview.turn': 'Task',
        'overview.status': 'Status',
        'overview.model': 'Model',
        'overview.started': 'Started',
        'overview.reason': 'End reason',
        'overview.session': 'Session',
        'overview.workspace': 'Workspace',
        'section.inputs': 'Input files',
        'section.intermediate': 'Intermediate artifacts',
        'section.outputs': 'Output files / deliverables',
        'section.tools': 'Tools / skills used',
        'section.language': 'Languages and other',
        'section.reusable': 'Reusable / worth a local skill or tool?',
        'section.flow': 'Task flow (timeline)',
        'section.usage': 'Model provider, model name, usage, cached input/output',
        'empty.inputs': 'None',
        'empty.intermediate': 'None',
        'empty.outputs': 'None',
        'empty.tools': 'None',
        'empty.language': 'None',
        'empty.flow': 'None',
        'empty.usage': 'No usage recorded',
        'input.userText': 'User message',
        'input.attachment': 'Attachments',
        'file.kind.file': 'File',
        'file.kind.directory': 'Directory',
        'file.exists': 'Exists',
        'file.missing': 'Missing or unreadable',
        'file.size': 'Size',
        'file.modified': 'Modified',
        'file.lines': 'Lines',
        'file.path': 'Path',
        'file.section.input': 'Input',
        'file.section.intermediate': 'Intermediate',
        'file.section.output': 'Output',
        'file.role.read': 'Read',
        'file.role.write': 'Write',
        'file.role.deliver': 'Deliver',
        'file.open': 'Preview',
        'file.reveal': 'Copy path',
        'file.copied': 'Copied',
        'tools.calls': '{count} calls',
        'tools.failed': '{count} failed',
        'tools.avg': 'avg {ms}',
        'tools.skill': 'Skill',
        'language.platform': 'Platform',
        'language.tools': 'Tools',
        'language.commands': 'Commands',
        'language.shells': 'Shells',
        'language.scripts': 'Scripts/code',
        'language.skills': 'Skills',
        'language.langs': 'Languages',
        'language.platformValue': '{os} / {arch}',
        'language.commandCount': '{count} commands',
        'language.shellWithCount': '{shell} ×{count}',
        'reusable.yes': 'Reusable output',
        'reusable.no': 'This task produced nothing obviously reusable (no script or skill file was written).',
        'reusable.delivered': 'Delivered files, reusable as-is',
        'reusable.skill': 'Invoked skills: {names}',
        'reusable.artifact': 'Produced reusable scripts or artifacts',
        'reusable.project': 'Modified project files',
        'flow.node.start': 'Start',
        'flow.node.end': 'End',
        'flow.node.step': 'Step {step}',
        'flow.calls': '{count} calls',
        'flow.failed': '{count} failed',
        'flow.empty': 'No tool calls in this task.',
        'flow.steps': 'step {from}–{to}',
        'flow.throughout': 'throughout',
        'flow.start': 'Start',
        'flow.end': 'End',
        'usage.provider': 'Provider',
        'usage.model': 'Model',
        'usage.input': 'Input tokens',
        'usage.uncachedInput': 'Uncached input',
        'usage.output': 'Output tokens',
        'usage.cacheRead': 'Cache read',
        'usage.cacheWrite': 'Cache write',
        'usage.reasoning': 'Reasoning tokens',
        'usage.total': 'Total',
        'usage.cacheHitRate': 'Cache hit rate',
        'usage.missing': 'No usage recorded for this task',
        'usage.price': 'Estimated cost (rates for {provider}/{model})',
        'usage.preview': 'Token usage',
        'loading': 'Reading file information…',
        'error.title': 'Could not read task details',
        'error.retry': 'Retry',
        'meta.summary': '{files} files · {tools} tools · {calls} calls',
        'phase.explore': 'Getting oriented',
        'phase.change': 'Changing files',
        'phase.run': 'Running and verifying',
        'phase.deliver': 'Delivering results',
        'phase.ask': 'Checking with you',
        'phase.skill': 'Loading a skill',
        'phase.plan': 'Planning',
        'phase.parallel': 'Running in parallel',
        'phase.other': 'Other work',
        'phase.calls': '{count}',
        'outcome.delivered': 'Delivered {count} file(s), ready to use',
        'outcome.written': 'Wrote or changed {count} file(s)',
        'outcome.failed': '{count} tool call(s) failed; see the flow above',
        'outcome.skills': 'Used skills: {names}',
        'reusable.none': 'This task produced nothing reusable.',
        'noCoordinates': 'Could not tell which task this tab belongs to.',
        'emptyJournal': 'This Session has no recorded events yet.',
        'turnNotLoaded': 'Task {turn} is not in the loaded journal.',
        'turnNotLoadedHint': 'It may be a new task that has not run yet.',
      }

      __exports["copy.js"] = { zh, en };

      return __exports["copy.js"] ?? {}
    })
    __define("styles.js", () => {
      // ---- styles.js ----
      /**
       * Stylesheet for the task-details panel and its trigger.
       *
       * Every colour comes from the host's `--dsw-alias-*` tokens and every size
       * from one scale declared at the top of the sheet, so a theme change or a
       * panel resize scales a single system.
       */

      /** @type {string} Stylesheet identity used for the document tag and its disposal. */
      const STYLE_ID = 'dsh-task-details/panel.css'

      /** @type {string} */
      const STYLES = String.raw`
      /* ---- design tokens -------------------------------------------------------
         Every size below comes from this scale. A section, a card, and a row all
         take their type from --td-text-* and their edge from --td-line, so zooming
         the panel scales one system instead of exposing mismatched literals. */
      .td-split {
        --td-text-3xs: 10px;
        --td-text-2xs: 10.5px;
        --td-text-xs: 11.5px;
        --td-text-sm: 12.5px;
        --td-text-md: 13.5px;
        --td-text-lg: 15px;
        --td-text-xl: 17px;
        --td-line: 1px;
        --td-radius: 10px;
        --td-radius-sm: 7px;
        --td-gap: 10px;
        --td-pad: 14px;
        --td-mono: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Consolas, monospace);
        --td-measure: 720px;
        --td-sans: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
          "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif);
      }

      /* ---- trigger ------------------------------------------------------------- */
      .td-triggerWrap {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .td-trigger {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        height: 32px;
        padding: 0 12px;
        border: var(--td-line) solid var(--dsw-alias-border-l3);
        border-radius: var(--td-radius-sm, 7px);
        background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        line-height: 1;
        cursor: pointer;
        visibility: visible;
        opacity: 1;
        pointer-events: auto;
        user-select: none;
        transition: background-color .14s ease, color .14s ease, border-color .14s ease;
      }
      .td-trigger:hover {
        background: var(--dsw-alias-interactive-bg-hover);
        color: var(--dsw-alias-brand-primary);
        border-color: var(--dsw-alias-brand-primary);
      }
      .td-trigger:focus-visible {
        outline: 2px solid var(--dsw-alias-brand-primary);
        outline-offset: 2px;
      }
      .td-triggerIcon { flex: none; color: var(--dsw-alias-brand-primary); }
      .td-triggerLabel { white-space: nowrap; }
      .td-fileRow {
        border-top: var(--td-line) solid var(--dsw-alias-border-l2);
        padding: 7px 0;
        min-width: 0;
      }
      .td-fileRow:first-child { border-top: none; padding-top: 1px; }
      .td-fileHead {
        display: flex;
        /* Baseline, not centre: a two-line file name would otherwise leave the size
           and badge floating halfway down the row. */
        align-items: baseline;
        gap: 7px;
        min-width: 0;
      }
      .td-fileIcon {
        flex: none;
        width: 12px;
        text-align: center;
        font-size: var(--td-text-3xs);
        color: var(--dsw-alias-label-tertiary);
      }
      .td-fileIcon.ok { color: var(--dsw-alias-state-success-primary); }
      .td-fileIcon.missing { color: var(--dsw-alias-state-warn-primary); }

      /* A file name is text with a hover affordance, never a boxed control: a button
         frame inside a dense list reads as an unexplained widget. */
      .td-fileName {
        -webkit-appearance: none;
        appearance: none;
        display: inline;
        background: none;
        border: 0;
        border-radius: 0;
        box-shadow: none;
        outline: none;
        margin: 0;
        padding: 0;
        font-family: var(--td-sans);
        font-size: var(--td-text-sm);
        line-height: 1.5;
        color: var(--dsw-alias-label-primary);
        cursor: pointer;
        text-align: start;
        /* A file name is never clipped: a name is how the reader identifies the
           file, so it wraps instead of ending in an ellipsis. */
        white-space: normal;
        overflow-wrap: anywhere;
        min-width: 0;
      }
      .td-fileName:hover:not(:disabled) {
        color: var(--dsw-alias-link);
        text-decoration: underline;
      }
      /* A name that cannot be opened must not look like one that can. */
      .td-fileName:disabled {
        cursor: default;
        color: var(--dsw-alias-label-secondary);
      }
      .td-fileName:focus-visible {
        outline: 2px solid var(--dsw-alias-brand-primary);
        outline-offset: 2px;
        border-radius: 3px;
      }

      .td-fileBadge {
        flex: none;
        font-size: var(--td-text-3xs);
        line-height: 16px;
        padding: 0 6px;
        border-radius: 999px;
        background: var(--dsw-alias-bg-module-platform);
        color: var(--dsw-alias-label-tertiary);
      }
      .td-fileBadge.badge--write { color: var(--dsw-alias-state-business-primary); }
      .td-fileBadge.badge--deliver { color: var(--dsw-alias-state-success-primary); }
      .td-fileSize {
        margin-inline-start: auto;
        flex: none;
        font-size: var(--td-text-xs);
        color: var(--dsw-alias-label-tertiary);
        font-variant-numeric: tabular-nums;
      }

      /* The copy action stays out of the way until the row is hovered. */
      .td-iconButton {
        -webkit-appearance: none;
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 4px;
        background: transparent;
        box-shadow: none;
        outline: none;
        margin: 0;
        padding: 0 3px;
        color: var(--dsw-alias-label-tertiary);
        font: inherit;
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
        opacity: 0;
        flex: none;
        transition: opacity .12s ease, color .12s ease;
      }
      .td-fileRow:hover .td-iconButton { opacity: 1; }
      .td-iconButton:hover { color: var(--dsw-alias-label-primary); }
      /* Focused by keyboard, the copy control needs a visible target: opacity alone
         reveals it without saying which element has focus. */
      .td-iconButton:focus-visible {
        opacity: 1;
        outline: 2px solid var(--dsw-alias-brand-primary);
        outline-offset: 1px;
        border-radius: 4px;
        color: var(--dsw-alias-label-primary);
      }

      .td-filePath {
        margin-top: 2px;
        font-family: var(--td-mono);
        font-size: var(--td-text-2xs);
        color: var(--dsw-alias-label-tertiary);
        /* The save path is the detail the reader widens the panel for, so it wraps
           onto a second line rather than ending in an ellipsis. */
        white-space: normal;
        overflow-wrap: anywhere;
      }

      /* Details appear once there is room for them. */
      .td-fileMeta {
        display: none;
        flex-wrap: wrap;
        gap: 4px 0;
        margin-top: 4px;
        font-size: var(--td-text-xs);
        color: var(--dsw-alias-label-tertiary);
      }
      .td-fileTools { display: none; margin-top: 3px; font-size: var(--td-text-2xs); color: var(--dsw-alias-label-tertiary); }
      .td-kv { display: inline-flex; gap: 5px; align-items: baseline; }
      .td-kvKey { color: var(--dsw-alias-label-tertiary); }
      .td-kvValue { color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
      .td-kvValue.warn { color: var(--dsw-alias-state-warn-primary); }
      .td-kv + .td-kv::before {
        content: '';
        display: inline-block;
        width: 1px;
        height: 10px;
        margin-inline: 9px;
        background: var(--dsw-alias-border-l2);
        align-self: center;
      }
      @container (min-width: 480px) {
        .td-fileMeta { display: flex; }
      }
      @container (min-width: 620px) {
        .td-fileTools { display: block; }
      }
      /* Past this width the panel also shows the two-column facts layout, so the
         last stretch of the drag still adds something rather than padding. */
      @container (min-width: 760px) {
        .td-factKey { width: 96px; }
        .td-facts--wide { display: grid; grid-template-columns: 1fr 1fr; column-gap: 18px; }
        .td-facts--wide .td-fact:nth-child(2) { border-top: none; padding-top: 0; }
      }

      .td-triggerChevron {
        flex: none;
        font-size: 16px;
        line-height: 1;
        color: var(--dsw-alias-label-tertiary);
      }
      .td-triggerProblem {
        font-size: 12px;
        color: var(--dsw-alias-state-warn-primary);
        border: var(--td-line) dashed var(--dsw-alias-state-warn-primary);
        border-radius: var(--td-radius-sm, 7px);
        padding: 2px 8px;
        /* The problem text is the explanation; clipping it left the reader with a
           warning they could not read. It wraps instead. */
        max-width: 340px;
        white-space: normal;
        overflow-wrap: anywhere;
      }

      /* ---- frame --------------------------------------------------------------- */
      .td-split {
        position: relative;
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        min-width: 0;
        font-family: var(--td-sans);
        font-size: var(--td-text-sm);
        color: var(--dsw-alias-label-primary);
      }
      .td-handle {
        position: absolute;
        inset-block: 0;
        /* A 6px strip offset -3px left half of it outside the panel, leaving a ~3px
           grab target once the seat clips. The hit area now sits fully inside and is
           wide enough to grab, while the visible line stays a thin 2px rule. */
        inset-inline-start: 0;
        width: 9px;
        cursor: col-resize;
        z-index: 3;
        background: transparent;
        transition: background-color .14s ease;
      }
      .td-handle::after {
        content: '';
        position: absolute;
        inset-block: 0;
        inset-inline-start: 0;
        width: 2px;
        background: transparent;
        transition: background-color .14s ease;
      }
      .td-handle:hover::after,
      .td-handle--active::after {
        background: var(--dsw-alias-brand-primary);
      }
      .td-handle:hover,
      .td-handle--active {
        background: transparent;
      }
      .td-handle:focus-visible {
        outline: 2px solid var(--dsw-alias-brand-primary);
        outline-offset: -2px;
      }

      .td-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 12px;
        padding: 12px var(--td-pad) 11px;
        border-bottom: var(--td-line) solid var(--dsw-alias-border-l2);
      }
      .td-toolbarTitle {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .td-toolbarHeading {
        font-size: var(--td-text-lg);
        font-weight: 600;
        letter-spacing: .01em;
      }
      .td-toolbarSub { font-size: var(--td-text-sm); color: var(--dsw-alias-label-secondary); }
      .td-toolbarMeta {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-inline-start: auto;
        font-size: var(--td-text-xs);
        color: var(--dsw-alias-label-tertiary);
        font-variant-numeric: tabular-nums;
      }
      .td-toolbarModel {
        font-family: var(--td-mono);
        font-size: var(--td-text-xs);
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--dsw-alias-bg-module-platform);
        color: var(--dsw-alias-label-secondary);
      }

      .td-scroll {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        padding: var(--td-pad);
        display: block;
        scrollbar-width: thin;
        /* The token this used to name does not exist in the host's theme, so the
           rule silently did nothing. These are the two the shipped panels use. */
        scrollbar-color: var(--dsw-alias-border-l3) transparent;
      }

      /* ---- metrics: one compact strip ----------------------------------------- */
      .td-metrics {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        max-width: var(--td-measure);
        margin-inline: auto;
        margin-bottom: var(--td-gap);
      }
      .td-metric {
        display: flex;
        align-items: baseline;
        gap: 6px;
        border: var(--td-line) solid var(--dsw-alias-border-l2);
        border-radius: 999px;
        padding: 3px 11px;
        min-width: 0;
        background: var(--dsw-alias-bg-layer-1);
      }
      .td-metricLabel {
        font-size: var(--td-text-xs);
        color: var(--dsw-alias-label-tertiary);
        white-space: nowrap;
      }
      .td-metricValue {
        font-size: var(--td-text-sm);
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--dsw-alias-label-primary);
        white-space: nowrap;
      }

      /* ---- sections ----------------------------------------------------------- */
      .td-sections {
        display: flex;
        flex-direction: column;
        gap: var(--td-gap);
        /* Deliberately uncapped. The panel can be dragged to WIDTH_MAX, so any
           max-width here turns the last stretch of that drag into dead space. */
        width: 100%;
        min-width: 0;
      }
      .td-section {
        /* The same box everywhere: one width, one radius, one border weight, so a
           short section never looks narrower than a long one. */
        box-sizing: border-box;
        width: 100%;
        border: var(--td-line) solid var(--dsw-alias-border-l2);
        border-radius: var(--td-radius);
        padding: 11px 13px 12px;
        background: var(--dsw-alias-bg-layer-1);
        min-width: 0;
      }
      .td-sectionHead {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin-bottom: 8px;
      }
      .td-sectionTitle {
        font-size: var(--td-text-sm);
        font-weight: 600;
        color: var(--dsw-alias-label-secondary);
      }
      .td-empty {
        font-size: var(--td-text-sm);
        color: var(--dsw-alias-label-tertiary);
        padding: 1px 0;
      }

      /* ---- quiet chips: languages, attachments, tool names --------------------- */
      /* Deliberately flat. A filled, bordered pill at the same size as body text
         competes with the section title; these are annotations, not controls. */
      .td-chips {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        margin: 2px 0;
        min-width: 0;
      }
      .td-chip {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        padding: 1px 8px;
        border-radius: 999px;
        background: var(--dsw-alias-bg-module-platform);
        color: var(--dsw-alias-label-secondary);
        font-size: var(--td-text-xs);
        line-height: 18px;
        /* A chip grows or wraps with its label rather than hiding part of it. */
        white-space: normal;
        overflow-wrap: anywhere;
      }
      .td-chip--muted { background: none; color: var(--dsw-alias-label-tertiary); padding-inline: 2px; }

      /* ---- outcome notes under the deliverables -------------------------------- */
      .td-outcome {
        list-style: none;
        margin: 10px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 7px;
      }
      .td-outcomeItem {
        display: flex;
        flex-direction: column;
        gap: 5px;
        padding-left: 14px;
        position: relative;
        font-size: var(--td-text-sm);
        line-height: 1.55;
        color: var(--dsw-alias-label-secondary);
        min-width: 0;
      }
      .td-outcomeItem::before {
        content: '';
        position: absolute;
        left: 2px;
        top: 7px;
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--dsw-alias-label-tertiary);
      }
      .td-outcomeItem--delivered::before { background: var(--dsw-alias-state-success-primary); }
      .td-outcomeItem--failed::before { background: var(--dsw-alias-state-warn-primary); }
      .td-outcomeText { overflow-wrap: anywhere; }
      /* Deliverable names read as text that happens to open on click, matching the
         file rows above instead of introducing a row of small buttons. */
      .td-outcomeFiles { display: flex; flex-wrap: wrap; gap: 4px 12px; min-width: 0; }
      .td-outcomeFile {
        -webkit-appearance: none;
        appearance: none;
        background: none;
        border: 0;
        box-shadow: none;
        border-radius: 0;
        margin: 0;
        padding: 0;
        font: inherit;
        font-size: var(--td-text-sm);
        font-family: var(--td-mono);
        color: var(--dsw-alias-label-primary);
        cursor: pointer;
        text-align: left;
        overflow-wrap: anywhere;
      }
      .td-outcomeFile:hover { color: var(--dsw-alias-brand-primary); text-decoration: underline; }
      .td-outcomeFile:focus-visible {
        outline: 2px solid var(--dsw-alias-brand-primary);
        outline-offset: 2px;
      }

      /* ---- tool table: name, then its facts, one row per line ------------------- */
      .td-table { display: flex; flex-direction: column; }
      .td-tableRow {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 4px 10px;
        padding: 5px 0;
        border-top: var(--td-line) solid var(--dsw-alias-border-l2);
        min-width: 0;
      }
      .td-tableRow:first-child { border-top: none; padding-top: 0; }
      .td-tableName {
        flex: none;
        font-family: var(--td-mono);
        font-size: var(--td-text-sm);
        color: var(--dsw-alias-label-primary);
      }
      .td-tableRow--skill .td-tableName { color: var(--dsw-alias-brand-primary); }
      .td-tableCount { font-size: var(--td-text-xs); color: var(--dsw-alias-label-secondary); }
      .td-tableDim { font-size: var(--td-text-xs); color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
      .td-tableWarn { font-size: var(--td-text-xs); color: var(--dsw-alias-state-warn-primary); }
      /* A long tool or skill name wraps inside its own row instead of pushing the
         counts off the edge. */
      .td-tableName { overflow-wrap: anywhere; }

      /* The user's own words, when a task genuinely needs quoting. */
      .td-files { display: flex; flex-direction: column; min-width: 0; }

      /* ---- overview: label/value rows that never truncate --------------------- */
      .td-facts {
        display: flex;
        flex-direction: column;
        margin: 0;
      }
      .td-fact {
        display: flex;
        align-items: baseline;
        gap: 12px;
        padding: 4px 0;
        border-top: var(--td-line) solid var(--dsw-alias-border-l2);
        min-width: 0;
      }
      .td-fact:first-child { border-top: none; padding-top: 0; }
      .td-factKey {
        flex: none;
        width: 72px;
        font-size: var(--td-text-xs);
        color: var(--dsw-alias-label-tertiary);
      }
      .td-factValue {
        margin: 0;
        min-width: 0;
        font-size: var(--td-text-sm);
        color: var(--dsw-alias-label-primary);
        /* A long value wraps onto its own lines instead of ending in an ellipsis. */
        overflow-wrap: anywhere;
      }
      .td-factValue--ok { color: var(--dsw-alias-state-success-primary); font-weight: 600; }
      .td-factValue--run { color: var(--dsw-alias-brand-primary); font-weight: 600; }
      .td-factValue--warn { color: var(--dsw-alias-state-warn-primary); font-weight: 600; }
      .td-factValue--muted { color: var(--dsw-alias-label-tertiary); }
      .td-fact code {
        font-family: var(--td-mono);
        font-size: var(--td-text-xs);
      }

      /* ---- phases: one horizontal row of compact chips ------------------------ */
      .td-phases {
        display: flex;
        flex-direction: row;
        flex-wrap: nowrap;
        align-items: center;
        gap: 6px;
        width: 100%;
        overflow-x: auto;
        overflow-y: hidden;
        padding-bottom: 4px;
        scrollbar-width: thin;
        /* At the default width a long flow runs off the edge. The fade says there
           is more to the right instead of letting the row look complete. */
        -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 22px), transparent);
        mask-image: linear-gradient(to right, #000 calc(100% - 22px), transparent);
      }
      /* Once the row is scrolled to its end the fade would dim the last chip for no
         reason, so it is dropped there. */
      .td-phases--end {
        -webkit-mask-image: none;
        mask-image: none;
      }
      .td-phase {
        display: inline-flex;
        flex-direction: row;
        align-items: center;
        gap: 5px;
        border: var(--td-line) solid var(--dsw-alias-border-l2);
        border-radius: 999px;
        padding: 1px 9px 1px 7px;
        background: var(--dsw-alias-bg-layer-2);
        font-size: var(--td-text-xs);
        line-height: 20px;
        color: var(--dsw-alias-label-primary);
        white-space: nowrap;
        flex: none;
      }
      /* A small chevron between chips expresses order without wrapping the row. */
      .td-phase + .td-phase::before {
        content: '\203A';
        margin-inline-end: 2px;
        color: var(--dsw-alias-label-tertiary);
        font-size: var(--td-text-xs);
      }
      .td-phaseDot {
        flex: none;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--dsw-alias-brand-primary);
      }
      .td-phase--deliver .td-phaseDot { background: var(--dsw-alias-state-success-primary); }
      .td-phase--run .td-phaseDot { background: var(--dsw-alias-state-business-primary); }
      .td-phase--warn .td-phaseDot { background: var(--dsw-alias-state-warn-primary); }
      .td-phaseLabel { white-space: nowrap; }
      .td-phaseSample {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 190px;
        color: var(--dsw-alias-label-secondary);
        font-size: var(--td-text-xs);
        font-family: var(--td-mono);
      }
      .td-phaseText { display: inline-flex; flex-direction: column; min-width: 0; gap: 1px; }
      .td-phaseCount {
        flex: none;
        font-size: var(--td-text-3xs);
        line-height: 15px;
        min-width: 15px;
        text-align: center;
        padding: 0 3px;
        border-radius: 999px;
        background: var(--dsw-alias-bg-module-platform);
        color: var(--dsw-alias-label-tertiary);
        font-variant-numeric: tabular-nums;
      }
      /* A failure count sits on the chip it belongs to, so the reader can point at
         the step that went wrong instead of scanning the row for a colour. */
      .td-phaseFail {
        flex: none;
        font-size: var(--td-text-3xs);
        line-height: 15px;
        padding: 0 5px;
        border-radius: 999px;
        color: var(--dsw-alias-state-warn-primary);
        background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      /* The ends of the flow, so the row reads as a span of work rather than as a
         row of tags that could start anywhere. */
      .td-phaseEnd {
        flex: none;
        display: inline-flex;
        align-items: center;
        font-size: var(--td-text-3xs);
        line-height: 20px;
        color: var(--dsw-alias-label-tertiary);
        white-space: nowrap;
      }
      .td-phaseEnd--start::after,
      .td-phaseEnd--finish::before {
        content: '';
        display: inline-block;
        width: 12px;
        height: 1px;
        background: var(--dsw-alias-border-l3);
        margin-inline: 3px;
      }
      .td-pill {
        flex: none;
        font-size: var(--td-text-2xs);
        line-height: 18px;
        padding: 0 8px;
        border-radius: 999px;
        background: var(--dsw-alias-bg-module-platform);
        color: var(--dsw-alias-label-secondary);
      }
      .td-pill--completed { color: var(--dsw-alias-state-success-primary); }
      .td-pill--running { color: var(--dsw-alias-brand-primary); }
      .td-pill--error, .td-pill--blocked { color: var(--dsw-alias-state-warn-primary); }

      .td-loading { font-size: var(--td-text-sm); color: var(--dsw-alias-label-tertiary); }
      .td-debug {
        margin-top: 10px;
        font-family: var(--td-mono);
        font-size: var(--td-text-xs);
        line-height: 1.6;
        color: var(--dsw-alias-label-tertiary);
        word-break: break-all;
      }

      @media (prefers-reduced-motion: reduce) {
        .td-trigger, .td-handle, .td-triggerChevron { transition: none; }
      }
      `

      __exports["styles.js"] = { STYLE_ID, STYLES };

      return __exports["styles.js"] ?? {}
    })
    __define("preference.js", () => {
      // ---- preference.js ----
      ﻿/**
       * Panel width preference shared by every task-details tab in this browser.
       *
       * The sidebar persists layout per Session; the content width is a reader
       * preference, so it lives on its own and every tab follows the same value.
       */
      const { clampWidth, WIDTH_DEFAULT, PREFERENCE_KEY: DEFAULT_KEY } = __modules["model.js"];
      /** Storage key shared by every tab of this type. */
      const DETAILS_PREFERENCE_KEY = DEFAULT_KEY

      /** @type {Set<(width: number) => void>} */
      const listeners = new Set()
      /** @type {number} */
      let current = WIDTH_DEFAULT
      /** @type {boolean} */
      let loaded = false

      /** Notify readers of the current width. */
      function publish() {
        for (const listener of listeners) {
          try {
            listener(current)
          } catch {
            /* one failing reader must not block the rest */
          }
        }
      }

      /** Load the stored preference once, and follow changes other tabs write. */
      function ensureLoaded() {
        if (loaded) return
        loaded = true
        current = readWidth()
        window.addEventListener('storage', (event) => {
          if (event.key !== DETAILS_PREFERENCE_KEY || event.newValue === null) return
          const next = clampWidth(Number(event.newValue))
          if (next === current) return
          current = next
          publish()
        })
      }

      /**
       * Read the persisted panel width.
       * @param {string} key storage key.
       * @returns {number} clamped width.
       */
      function readWidth(key = DETAILS_PREFERENCE_KEY) {
        try {
          const raw = window.localStorage.getItem(key)
          if (raw === null) return WIDTH_DEFAULT
          return clampWidth(Number(raw))
        } catch {
          return WIDTH_DEFAULT
        }
      }

      /**
       * Persist the panel width and notify readers.
       * @param {string} key storage key.
       * @param {number} width width to store.
       */
      function writeWidth(key, width) {
        const next = clampWidth(width)
        current = next
        try {
          window.localStorage.setItem(key, String(next))
        } catch {
          /* storage is optional; a blocked write only costs persistence */
        }
        publish()
      }

      /**
       * Subscribe to width changes.
       * @param {(width: number) => void} listener reader.
       * @returns {() => void} unsubscribe.
       */
      function subscribeWidth(listener) {
        ensureLoaded()
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      }

      /**
       * Read the current width synchronously.
       * @returns {number} width.
       */
      function currentWidth() {
        ensureLoaded()
        return current
      }

      __exports["preference.js"] = { readWidth, writeWidth, subscribeWidth, currentWidth, DETAILS_PREFERENCE_KEY };

      return __exports["preference.js"] ?? {}
    })
    __define("details.js", () => {
      // ---- details.js ----
      /**
       * The task-details view: the resizable frame and every block the sketch asks
       * for. Layout turns compact cards into full detail tables as the panel grows.
       */
      const { buildTaskModel, foldTurns, summarizeCall, summarizeOutcome, summarizePhases } = __modules["analyzer.js"];
      const { DETAILS_ROUTE, JOURNAL_ROUTE, WIDTH_MAX, WIDTH_MIN, directoryOf, fileAddress, formatBytes, formatCount, formatDuration, formatTime, languageSummary, prettyPath, reuseVerdict, usageBucket } = __modules["model.js"];
      const { DETAILS_PREFERENCE_KEY, readWidth, subscribeWidth, writeWidth } = __modules["preference.js"];
      /** @type {object} */
      let React
      /** @type {Function} */
      let h

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
      function configure(runtime) {
        React = runtime.React
        h = React.createElement
      }

      /**
       * Ask the Host half for filesystem truth about the task's paths.
       * @param {{ sessionId: string, paths: string[], signal: AbortSignal }} request describe request.
       * @returns {Promise<object>} describe payload.
       */
      async function describeTask(request) {
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
          const tokens = usage[bucket]
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
       * @returns {Promise<object[]>} durable events in ascending seq order.
       */
      function loadJournal(sessionId) {
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

        React.useEffect(() => {
          if (typeof sessionId !== 'string') return undefined
          let alive = true
          const adopt = (entries, origin, error) => {
            if (!alive) return
            setState({ owner: sessionId, entries, origin, error })
          }

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
          loadJournal(sessionId)
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
        }, [sessionId, source])

        // A render for a different Session never shows the previous one's entries.
        return state.owner === sessionId ? state : { owner: sessionId, entries: [], origin: 'fetching', error: undefined }
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
        }, [paths, sessionId, active])
        return { ...state, home: home ?? state.home }
      }

      /**
       * Read the shared panel width preference.
       */
      function usePanelWidth() {
        const [width, setWidth] = React.useState(() => readWidth(DETAILS_PREFERENCE_KEY))
        React.useEffect(() => subscribeWidth(setWidth), [])
        return [width, React.useCallback((next) => writeWidth(DETAILS_PREFERENCE_KEY, next), [])]
      }

      /** One metric cell. */
      function metric(label, value) {
        if (value === '' || value === undefined || value === null) return null
        return h(
          'div',
          { className: 'td-metric', key: `m-${label}` },
          h('div', { className: 'td-metricLabel' }, label),
          h('div', { className: 'td-metricValue' }, value),
        )
      }

      /**
       * One titled section.
       *
       * Sections take any number of content fragments, so a block can append extra
       * rows (Host-side memory or Session logs, for example) after its main list
       * without nesting another box.
       *
       * @param {string} id section id.
       * @param {string} title section title.
       * @param {...object} children content fragments; falsy entries are skipped.
       * @returns {object} element.
       */
      /**
       * One label/value row in the overview.
       *
       * A definition-list row keeps a long value on its own line instead of clipping
       * it: fixed-width cards forced a timestamp and a model name into ellipses,
       * which told the reader nothing.
       *
       * @param {string} label row label.
       * @param {string} value row value.
       * @param {string} [tone] optional emphasis: "ok", "run", or "warn".
       * @returns {object | null} element.
       */
      function fact(label, value, tone) {
        if (value === '' || value === undefined) return null
        return h(
          'div',
          { className: 'td-fact', key: 'fact-' + label },
          h('dt', { className: 'td-factKey' }, label),
          h('dd', { className: 'td-factValue' + (tone === undefined ? '' : ' td-factValue--' + tone) }, value),
        )
      }

      /** The empty state of a section. */
      function empty(text) {
        return h('div', { className: 'td-empty' }, text)
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
       */
      function fileRow(file, sessionId, t, openResource) {
        const address = fileAddress(sessionId, file.path)
        const status = file.exists === true ? 'ok' : file.exists === false ? 'missing' : 'unknown'
        const roleLabel = t(
          file.role === 'read' ? 'file.role.read' : file.role === 'deliver' ? 'file.role.deliver' : 'file.role.write',
        )
        return h(
          'div',
          { className: 'td-fileRow', key: file.path, title: file.path },
          h(
            'div',
            { className: 'td-fileHead' },
            h(
              'span',
              { className: `td-fileIcon ${status}`, 'aria-hidden': true },
              file.kind === 'directory' ? '\u25A6' : '\u25A4',
            ),
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
                className: 'td-iconButton',
                title: t('file.reveal'),
                'aria-label': t('file.reveal'),
                onClick: () => {
                  navigator.clipboard?.writeText(file.path).catch(() => {})
                },
              },
              '\u29C9',
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
       * A small document glyph drawn as SVG, so the control keeps its icon in any
       * theme and never depends on an emoji font being installed.
       * @returns {object} element.
       */
      function detailsIcon() {
        return h(
          'svg',
          {
            className: 'td-triggerIcon',
            viewBox: '0 0 16 16',
            width: 15,
            height: 15,
            'aria-hidden': true,
            focusable: false,
          },
          h('path', {
            d: 'M4 1.75h5.1L12.5 5v9.25a.75.75 0 0 1-.75.75h-7.5A.75.75 0 0 1 3.5 14.25V2.5a.75.75 0 0 1 .75-.75Z',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.3,
            strokeLinejoin: 'round',
          }),
          h('path', {
            d: 'M9 1.9v3.2h3.3',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.3,
            strokeLinejoin: 'round',
          }),
          h('path', {
            d: 'M5.6 8h4.8M5.6 10.4h4.8M5.6 12.6h3',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.3,
            strokeLinecap: 'round',
          }),
        )
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
      function TaskDetailsTrigger({ turn: turnProp, node, t, currentSessionId, latestTurn, openResource, owner, sessionId: seatSessionId }) {
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
            setProblem('no session')
            return
          }
          const turn = turnFromProps ?? turnFromPosition() ?? (typeof latestTurn === 'function' ? latestTurn() : undefined)
          if (typeof turn !== 'number' || !Number.isFinite(turn)) {
            setProblem('no turn')
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
      function TaskDetailsView({ sessionId, turn, session, price, t, openResource, describe }) {
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
          return h(
            'div',
            { className: 'td-split' },
            h('div', { className: 'td-toolbar' }, h('div', { className: 'td-toolbarTitle' }, h('span', { className: 'td-toolbarHeading' }, t('panel.heading')))),
            h(
              'div',
              { className: 'td-scroll' },
              lines2
                .filter(Boolean)
                .map((line, index) =>
                  h('div', { className: index === 0 ? 'td-loading' : 'td-debug', key: index }, line),
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

        const section = (id, title, ...children) =>
          h(
            'section',
            { className: 'td-section', 'data-section': id, key: id },
            h('div', { className: 'td-sectionHead' }, h('div', { className: 'td-sectionTitle' }, title)),
            children.filter((child) => child !== null && child !== undefined && child !== false),
          )
        const fileList = (files) =>
          files.length === 0
            ? null
            : h(
                'div',
                { className: 'td-files' },
                files.map((file) => fileRow(withMetadata(file), sessionId, t, openResource)),
              )

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
              h('span', { className: 'td-toolbarHeading' }, t('panel.heading')),
              h('span', { className: 'td-toolbarSub' }, t('panel.subtitle', { turn: task.turn })),
              h('span', { className: 'td-pill td-pill--' + task.status }, statusLabel),
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
                metric(t('metrics.steps'), task.steps.length > 0 ? String(task.steps.length) : ''),
                metric(t('metrics.calls'), task.calls.length > 0 ? String(task.calls.length) : ''),
                metric(t('metrics.files'), task.files.length > 0 ? String(task.files.length) : ''),
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
                  hitRate === undefined ? null : fact(t('usage.cacheHitRate'), (hitRate * 100).toFixed(1) + '%'),
                  uncachedInput === undefined ? null : fact(t('usage.uncachedInput'), formatCount(uncachedInput)),
                  cacheReadTokens === undefined ? null : fact(t('usage.cacheRead'), formatCount(cacheReadTokens)),
                  cacheWriteTokens === undefined ? null : fact(t('usage.cacheWrite'), formatCount(cacheWriteTokens)),
                  outputTokens === undefined ? null : fact(t('usage.output'), formatCount(outputTokens)),
                  reasoningTokens === undefined ? null : fact(t('usage.reasoning'), formatCount(reasoningTokens)),
                  totalTokens === undefined ? null : fact(t('usage.total'), formatCount(totalTokens)),
                  usage?.cost === undefined ? null : fact(t('metrics.cost'), formatCost(usage.cost)),
                ),
              ),
              // 2. What the user gave the task, including attached images.
              section(
                'inputs',
                t('section.inputs'),
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
                          h('span', { className: 'td-tableName' }, 'skill \u00B7 ' + skill.name),
                          h('span', { className: 'td-tableCount' }, t('tools.calls', { count: skill.count })),
                        ),
                      ),
                    ),
              ),
              // 6. The stacks and shells involved.
              section(
                'language',
                t('section.language'),
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
              // 7. The shape of the work, one compact row.
              section(
                'flow',
                t('section.flow'),
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

      __exports["details.js"] = { configure, describeTask, TaskDetailsTrigger, TaskDetailsView };

      return __exports["details.js"] ?? {}
    })
    __define("client-entry.js", () => {
      // ---- client-entry.js ----
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
      const { configure: configureDetails, TaskDetailsTrigger, TaskDetailsView } = __modules["details.js"];
      const { DETAILS_ID, DETAILS_KIND, NS, parseTaskAddress, taskAddress } = __modules["model.js"];
      const { en, zh } = __modules["copy.js"];
      const { STYLES, STYLE_ID } = __modules["styles.js"];
      /** Services this plugin needs; a profile without them leaves the plugin inactive. */
      const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs']

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
      function register(ctx, config) {
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
      function boot(modules, ctx, config) {
        React = modules.React
        rootContext = ctx
        configureDetails({ React })
        register(ctx, config)
      }

      __exports["client-entry.js"] = { register, boot, inject };

      return __exports["client-entry.js"] ?? {}
    })
    const React = require('react')
    const entry = __modules['client-entry.js']
    return {
      inject: entry.inject,
      apply(ctx, config) {
        entry.boot({ React }, ctx, config)
      },
    }
  },
})
