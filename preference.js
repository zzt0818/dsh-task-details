/**
 * Panel width preference shared by every task-details tab in this browser.
 *
 * The sidebar persists layout per Session; the content width is a reader
 * preference, so it lives on its own and every tab follows the same value.
 */
import { clampWidth, WIDTH_DEFAULT, PREFERENCE_KEY as DEFAULT_KEY } from './model.js'

/** Storage key shared by every tab of this type. */
export const DETAILS_PREFERENCE_KEY = DEFAULT_KEY

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
export function readWidth(key = DETAILS_PREFERENCE_KEY) {
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
export function writeWidth(key, width) {
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
export function subscribeWidth(listener) {
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
export function currentWidth() {
  ensureLoaded()
  return current
}
