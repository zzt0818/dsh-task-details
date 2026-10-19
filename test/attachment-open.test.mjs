// An attachment row must be clickable: the journal identifies an upload only
// by its store-relative path, so the panel has to reconstruct the absolute
// location itself instead of depending on a Host round trip.
import { fileAddress } from '../model.js'

const checks = []
const check = (label, condition, detail = '') => {
  checks.push({ label, ok: Boolean(condition) })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

const home = 'C:\\Users\\EDY\\.dsh'
const relative = 'objects/02/026afd839787ca662868207ffb0b324b23f6f369e832222725c36f0ecb1e0666'

// The rule the panel applies, kept identical to details.js.
const isStoreRef = (value) => /^objects[\\/][0-9a-f]{2}[\\/][0-9a-f]{8,}$/i.test(value)
const resolve = (value) => {
  if (!isStoreRef(value)) return value
  const tail = value.replace(/[\\/]+/g, '\\').replace(/^\\/, '')
  return home.replace(/[\\/]+$/, '') + '\\attachments\\v1\\' + tail
}

check('store reference recognized', isStoreRef(relative))
check('a normal path is left alone', resolve('D:\\work\\out.txt') === 'D:\\work\\out.txt')

const absolute = resolve(relative)
check('absolute path rebuilt', absolute.startsWith(home + '\\attachments\\v1\\objects\\02\\'), absolute)

const address = fileAddress('session-abc', absolute)
check('attachment row is clickable', address !== null)
check('no empty path segment', address !== null && !address.slice('dsh-resource://'.length).includes('//'), address ?? '')
check('drive letter is a path segment', address !== null && address.includes('/C%3A/'))

// The old behaviour, which left the row disabled.
check('raw reference alone is not openable', fileAddress('session-abc', relative) === null)

const failed = checks.filter((entry) => !entry.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) {
  console.error('FAILED:', failed.map((entry) => entry.label).join('; '))
  process.exitCode = 1
} else {
  console.log('OPEN ATTACHMENT OK')
}
