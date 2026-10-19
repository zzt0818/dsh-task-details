// Verifies the address our trigger opens is claimed by our own tab type.
function globToRegExp(pattern) {
  let source = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        source += '.*'
        index += 1
      } else {
        source += '[^/]*'
      }
    } else if (char === '?') {
      source += '.'
    } else {
      source += char.replace(/[.+^$()|[\]{}]/g, '\\$&')
    }
  }
  return new RegExp(source + '$', 'i')
}

const matcher = globToRegExp('dsh-resource://task-details/**')
const address = 'dsh-resource://task-details/session/session-11111111-2222-4333-8444-555555555555/turn/4'

const checks = [
  ['deep address claimed', matcher.test(address)],
  ['file resource not claimed', !matcher.test('dsh-resource://file/session/x/D%3A/a.txt')],
  ['other kind not claimed', !matcher.test('dsh-resource://changes-review/x')],
]

let failed = 0
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failed += 1
}
process.exitCode = failed === 0 ? 0 : 1
