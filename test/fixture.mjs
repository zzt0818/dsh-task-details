/**
 * A synthetic but realistic Session journal: two tasks, with the user's
 * prompt, file reads and writes, a failing call, skill use, a delivery, and
 * per-attempt usage records in the shape the Session Controller stores.
 */
export const SESSION_ID = 'session-11111111-2222-4333-8444-555555555555'

const TOOL_RESULT = (callId, text, isError = false) => ({
  message: { role: 'tool', toolCallId: callId, content: [{ type: 'text', text }], isError },
})
/** Journal events in ascending seq order, without own seq assignments. */
const EVENTS = [
  { type: 'user/message', data: { turn: 1, id: 'u1', content: [{ type: 'text', text: '帮我整理 D:\\work 下的报告' }] } },
  { type: 'turn/start', data: { turn: 1 } },
  {
    type: 'step/start',
    data: { turn: 1, step: 1 },
  },
  {
    type: 'assistant/message',
    data: {
      turn: 1,
      step: 1,
      message: {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: '先看看目录' },
          { type: 'text', text: '我先列出目录内容。' },
          {
            type: 'tool-call',
            id: 'c1',
            name: 'glob',
            arguments: '{"pattern":"**/*.md","path":"D:\\\\work"}',
          },
        ],
        source: { kind: 'model', provider: 'deepseek-official', model: 'deepseek-flash' },
      },
      usage: { inputTokens: 1000, outputTokens: 120, cacheReadTokens: 3000, cacheWriteTokens: 0, totalTokens: 4120, reasoningTokens: 30 },
    },
  },
  { type: 'tool/call', data: { turn: 1, step: 1, callId: 'c1', name: 'glob', arguments: '{"pattern":"**/*.md","path":"D:\\\\work"}' } },
  { type: 'tool/result', data: { turn: 1, step: 1, ...TOOL_RESULT('c1', 'D:\\work\\report.md\nD:\\work\\notes.md') } },
  {
    type: 'assistant/message',
    data: {
      turn: 1,
      step: 2,
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: '读取报告' },
          { type: 'tool-call', id: 'c2', name: 'read', arguments: '{"file_path":"D:\\\\work\\\\report.md"}' },
          { type: 'tool-call', id: 'c3', name: 'skill', arguments: '{"name":"office-docx"}' },
        ],
        source: { kind: 'model', provider: 'deepseek-official', model: 'deepseek-flash' },
      },
      usage: { inputTokens: 1200, outputTokens: 200, cacheReadTokens: 5000, cacheWriteTokens: 0, totalTokens: 6400 },
    },
  },
  { type: 'tool/call', data: { turn: 1, step: 2, callId: 'c2', name: 'read', arguments: '{"file_path":"D:\\\\work\\\\report.md"}' } },
  { type: 'tool/result', data: { turn: 1, step: 2, ...TOOL_RESULT('c2', 'line1\nline2\nline3') } },
  { type: 'tool/call', data: { turn: 1, step: 2, callId: 'c3', name: 'skill', arguments: '{"name":"office-docx"}' } },
  { type: 'tool/result', data: { turn: 1, step: 2, ...TOOL_RESULT('c3', 'skill loaded') } },
  {
    type: 'assistant/message',
    data: {
      turn: 1,
      step: 3,
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: '生成汇总' },
          { type: 'tool-call', id: 'c4', name: 'write', arguments: '{"file_path":"D:\\\\work\\\\summary.ps1","content":"..."}' },
          { type: 'tool-call', id: 'c5', name: 'bash', arguments: '{"description":"run summary","command":"./summary.ps1"}' },
          { type: 'tool-call', id: 'c6', name: 'present', arguments: '{"files":[{"path":"D:\\\\work\\\\summary.ps1","description":"汇总脚本"}]}' },
        ],
        source: { kind: 'model', provider: 'deepseek-official', model: 'deepseek-flash' },
      },
      usage: { inputTokens: 800, outputTokens: 90, cacheReadTokens: 2000, cacheWriteTokens: 0, totalTokens: 2890 },
    },
  },
  { type: 'tool/call', data: { turn: 1, step: 3, callId: 'c4', name: 'write', arguments: '{"file_path":"D:\\\\work\\\\summary.ps1","content":"..."}' } },
  { type: 'tool/result', data: { turn: 1, step: 3, ...TOOL_RESULT('c4', '<path>D:\\work\\summary.ps1</path>\n<type>file</type>\n<content>\nCreated file\n</content>') } },
  { type: 'tool/call', data: { turn: 1, step: 3, callId: 'c5', name: 'bash', arguments: '{"description":"run summary","command":"./summary.ps1"}' } },
  { type: 'tool/result', data: { turn: 1, step: 3, ...TOOL_RESULT('c5', 'command not found', true) } },
  { type: 'tool/call', data: { turn: 1, step: 3, callId: 'c6', name: 'present', arguments: '{"files":[{"path":"D:\\\\work\\\\summary.ps1","description":"汇总脚本"}]}' } },
  { type: 'tool/result', data: { turn: 1, step: 3, ...TOOL_RESULT('c6', '<path>D:\\work\\summary.ps1</path>') } },
  { type: 'deliverables/presented', data: { turn: 1, callId: 'c6', files: [{ path: 'D:\\work\\summary.ps1', description: '汇总脚本' }] } },
  { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  { type: 'user/message', data: { turn: 2, id: 'u2', content: [{ type: 'text', text: '把这个脚本改一下' }, { type: 'image', attachment: { attachmentId: 'sha256:abc', mediaType: 'image/png', width: 10, height: 10, bytes: 1234, name: 'shot.png' } }] } },
  { type: 'turn/start', data: { turn: 2 } },
  { type: 'assistant/message', data: { turn: 2, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '好的' }], source: { kind: 'model', provider: 'workbuddy-ai', model: 'deepseek-v4.1-flash' } }, usage: { inputTokens: 500, outputTokens: 40, cacheReadTokens: 1000, cacheWriteTokens: 0, totalTokens: 1540 } } },
  { type: 'turn/end', data: { turn: 2, reason: { kind: 'error', error: { code: 'RATE_LIMIT' } } } },
  { type: 'command/run', data: { turn: 2 } },
]

/** Build the entries array with sequential seqs, spaced one second apart. */
export function buildEntries() {
  const base = 1_700_000_000_000
  return EVENTS.map((event, index) => ({
    event: { ...event, seq: index + 1, time: base + index * 1000 },
  }))
}

/** Host-side metadata for the files the journal touches. */
export const METADATA = new Map([
  ['D:\\work\\report.md', { path: 'D:\\work\\report.md', exists: true, kind: 'file', size: 2048, mtime: 1_700_000_500_000, lines: 3 }],
  ['D:\\work\\summary.ps1', { path: 'D:\\work\\summary.ps1', exists: true, kind: 'file', size: 512, mtime: 1_700_000_800_000, lines: 12 }],
  ['D:\\work\\missing.md', { path: 'D:\\work\\missing.md', exists: false, error: 'ENOENT' }],
])