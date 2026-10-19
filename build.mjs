/**
 * Build client.js: inline every plugin module into one browser artifact.
 *
 * The page loads a plugin's browser half from one URL and gives it a
 * synchronous `require` over the browser module table. A relative static
 * `import` would make the browser fetch a second, unauthenticated URL the
 * loader never serves, so the whole plugin is concatenated into a single
 * factory body here.
 *
 * Transformations, applied per module:
 *  - `import { a, b as c } from './x.js'` becomes destructuring from a module
 *    namespace object;
 *  - `export function`/`export class`/`export const`/`export let` drop the
 *    keyword and add their names to the namespace object.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Package root: this script lives there. */
const root = path.dirname(fileURLToPath(import.meta.url))

/** Modules in dependency order; every dependency appears before its user. */
const ORDER = [
  'model.js',
  'analyzer.js',
  'copy.js',
  'styles.js',
  'preference.js',
  'details.js',
  'client-entry.js',
]

/** Resolve a relative specifier to the module list's key. */
function keyOf(from, specifier) {
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier))
  return resolved
}

/**
 * Rewrite one module's ESM syntax into factory-scoped code.
 * @param {string} file module name.
 * @param {string} source module text.
 * @returns {string} transformed text.
 */
function transform(file, source) {
  const exportsList = []
  let text = source

  // import { a, b as c } from './x.js'
  text = text.replace(
    /^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm,
    (_match, names, specifier) => {
      const target = keyOf(file, specifier)
      const bindings = names
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const [imported, local] = entry.split(/\s+as\s+/)
          return local === undefined ? imported : `${imported}: ${local}`
        })
        .join(', ')
      return `const { ${bindings} } = __modules[${JSON.stringify(target)}];`
    },
  )

  // export function name(...)
  text = text.replace(/^export\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/gm, (_m, asyncKeyword, name) => {
    exportsList.push(name)
    return `${asyncKeyword ?? ''}function ${name}`
  })

  // export class Name
  text = text.replace(/^export\s+class\s+([A-Za-z_$][\w$]*)/gm, (_m, name) => {
    exportsList.push(name)
    return `class ${name}`
  })

  // export const/let name = ...  (also `export const a = 1, b = 2` is unused here)
  text = text.replace(/^export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (_m, kind, name) => {
    exportsList.push(name)
    return `${kind} ${name}`
  })

  if (/^\s*export\s/m.test(text)) {
    throw new Error(`${file}: unhandled export form remains`)
  }

  return `${text}\n__exports[${JSON.stringify(file)}] = { ${[...new Set(exportsList)].join(', ')} };\n`
}

const pieces = ORDER.map((file) => {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  return `// ---- ${file} ----\n${transform(file, source)}`
})

const artifact = `window.__ModuleLoader__.load({
  id: 'dsh-task-details',
  factory(require) {
    const __exports = {}
    const __modules = {}
    const __define = (name, build) => { if (__modules[name] === undefined) __modules[name] = build() }
${ORDER.map((file) => `    __define(${JSON.stringify(file)}, () => {\n${indent(pieces[ORDER.indexOf(file)] || '', 6)}\n      return __exports[${JSON.stringify(file)}] ?? {}\n    })`).join('\n')}
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
`

/**
 * Indent a block for readability inside the factory.
 * @param {string} text block.
 * @param {number} spaces indent width.
 * @returns {string} indented block.
 */
function indent(text, spaces) {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line === '' ? line : pad + line))
    .join('\n')
}

fs.writeFileSync(path.join(root, 'client.js'), artifact)
console.log(`client.js written: ${artifact.length} bytes, ${ORDER.length} modules`)
