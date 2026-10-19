/**
 * Repository root, derived from this file's own location.
 *
 * Every test used to hard-code `D:\dsh-ui-Sidebar`, so the suite only ran on
 * the machine it was written on. Resolving from `import.meta.url` instead
 * makes a clone work wherever it is checked out.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Absolute path of the repository root (the directory holding package.json). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Join a repo-relative path onto the root.
 * @param {...string} parts path segments.
 * @returns {string} absolute path.
 */
export function at(...parts) {
  return path.join(ROOT, ...parts)
}
