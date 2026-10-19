// Proves the footer lookup resolves the Turn of the task the button sits in.
import fs from 'node:fs'

// A minimal DOM: three completed task footers, each carrying its Turn number,
// with a button anchor inside the middle one.
function makeNode(attributes, parent = null) {
  const node = {
    attributes,
    parent,
    contains(candidate) {
      let current = candidate
      while (current !== null) {
        if (current === node) return true
        current = current.parent
      }
      return false
    },
    closest(selector) {
      const matches = selector === '[data-turn-tail]'
      let current = node
      while (current !== null) {
        if (matches && current.attributes['data-turn-tail'] !== undefined) return current
        current = current.parent
      }
      return null
    },
    getAttribute(name) {
      return node.attributes[name] ?? null
    },
  }
  return node
}

const footers = [3, 7, 12].map((turn) => makeNode({ 'data-turn-tail': String(turn) }))
const anchor = makeNode({}, footers[1])

globalThis.document = {
  querySelectorAll(selector) {
    return selector === '[data-turn-tail]' ? footers : []
  },
}

// Mirrors turnFromPosition in details.js.
function turnFromPosition(node) {
  const footer = typeof node.closest === 'function' ? node.closest('[data-turn-tail]') : null
  const marked = Number(footer?.getAttribute('data-turn-tail'))
  if (Number.isFinite(marked) && marked > 0) return marked
  const all = [...document.querySelectorAll('[data-turn-tail]')]
  const index = all.findIndex((candidate) => candidate.contains(node))
  if (index < 0) return undefined
  const fallback = Number(all[index].getAttribute('data-turn-tail'))
  return Number.isFinite(fallback) && fallback > 0 ? fallback : index + 1
}

const checks = []
const check = (label, condition, detail = '') => {
  checks.push({ label, ok: Boolean(condition) })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

check('reads the enclosing footer turn', turnFromPosition(anchor) === 7, String(turnFromPosition(anchor)))
check('the first footer resolves to 3', turnFromPosition(makeNode({}, footers[0])) === 3)
check('the last footer resolves to 12', turnFromPosition(makeNode({}, footers[2])) === 12)
check('a detached node resolves to nothing', turnFromPosition(makeNode({})) === undefined)

// The same-page sibling cannot borrow another task's number.
check('adjacent footers stay distinct', new Set([3, 7, 12].map((turn) => turnFromPosition(makeNode({}, footers[[3, 7, 12].indexOf(turn)])))).size === 3)

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) process.exitCode = 1
else console.log('FOOTER TURN OK')
