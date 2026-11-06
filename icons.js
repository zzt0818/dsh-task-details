/**
 * Inline SVG icons for the task-details panel.
 *
 * Icons are built as vectors so they stay crisp at any panel size and inherit
 * their colour from CSS (`currentColor`), which keeps them correct in both
 * themes without shipping any image asset. Every glyph lives in a shared
 * 16×16 grid and reads at the sizes the panel uses (11–15px).
 */

/** Glyph operations per icon kind, drawn on a 16×16 grid. */
const ICONS = {
  /** A page with a folded corner and text lines: the generic document. */
  doc: [
    { tag: 'path', attrs: { d: 'M4 1.75h5.1L12.5 5v9.25a.75.75 0 0 1-.75.75h-7.5A.75.75 0 0 1 3.5 14.25V2.5a.75.75 0 0 1 .75-.75Z', 'stroke-linejoin': 'round' } },
    { tag: 'path', attrs: { d: 'M9 1.9v3.2h3.3', 'stroke-linejoin': 'round' } },
    { tag: 'path', attrs: { d: 'M5.6 8h4.8M5.6 10.4h4.8M5.6 12.6h3', 'stroke-linecap': 'round' } },
  ],
  /** Angle brackets and a slash: source code and scripts. */
  code: [
    { tag: 'path', attrs: { d: 'M5.5 6 3 8l2.5 2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } },
    { tag: 'path', attrs: { d: 'M10.5 6 13 8l-2.5 2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } },
    { tag: 'path', attrs: { d: 'M9.2 4.5 6.8 11.5', 'stroke-linecap': 'round' } },
  ],
  /** A framed picture with a sun and a horizon: images. */
  image: [
    { tag: 'rect', attrs: { x: 2.75, y: 3.75, width: 10.5, height: 8.5, rx: 1 } },
    { tag: 'circle', attrs: { cx: 5.6, cy: 6.6, r: 1.05 } },
    { tag: 'path', attrs: { d: 'M2.9 11.4 6 8.4l2.4 2.3 1.8-1.7 2.9 2.4', 'stroke-linejoin': 'round' } },
  ],
  /** A table with a header row: structured data and spreadsheets. */
  data: [
    { tag: 'rect', attrs: { x: 2.75, y: 3.25, width: 10.5, height: 9.5, rx: 1 } },
    { tag: 'path', attrs: { d: 'M2.75 6.4h10.5' } },
    { tag: 'path', attrs: { d: 'M6.6 6.4v6.35M10.3 6.4v6.35' } },
  ],
  /** A shipping box with a handle: archives, bundles, and logs. */
  archive: [
    { tag: 'path', attrs: { d: 'M2.75 5.6 5.1 2.85h5.8l2.35 2.75v7.55a.7.7 0 0 1-.7.7H3.45a.7.7 0 0 1-.7-.7Z', 'stroke-linejoin': 'round' } },
    { tag: 'path', attrs: { d: 'M2.75 5.6h10.5' } },
    { tag: 'path', attrs: { d: 'M6.1 5.6v1.6a1.9 1.9 0 0 0 3.8 0V5.6' } },
  ],
  /** A folder: directories. */
  folder: [
    { tag: 'path', attrs: { d: 'M2.25 4.25a.75.75 0 0 1 .75-.75h3.1L7.6 5.3h5.4a.75.75 0 0 1 .75.75v6.95a.75.75 0 0 1-.75.75H3a.75.75 0 0 1-.75-.75Z', 'stroke-linejoin': 'round' } },
  ],
  /** A four-point spark with a small companion: skill invocations. */
  skill: [
    { tag: 'path', attrs: { d: 'M8 2.6c.42 2.7 1.98 4.26 4.68 4.68-2.7.42-4.26 1.98-4.68 4.68-.42-2.7-1.98-4.26-4.68-4.68 2.7-.42 4.26-1.98 4.68-4.68Z', 'stroke-linejoin': 'round' } },
    { tag: 'path', attrs: { d: 'M12.4 10.9c.16 1 .75 1.59 1.75 1.75-1 .16-1.59.75-1.75 1.75-.16-1-.75-1.59-1.75-1.75 1-.16 1.59-.75 1.75-1.75Z', 'stroke-linejoin': 'round' } },
  ],
  /** A circular arrow: refresh file information. */
  refresh: [
    { tag: 'path', attrs: { d: 'M12.7 7.6a4.8 4.8 0 1 1-1.3-3.1', 'stroke-linecap': 'round' } },
    { tag: 'path', attrs: { d: 'M12.8 2.9v2.6h-2.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } },
  ],
  /** Two chevrons pointing up and down: expand/collapse all sections. */
  expand: [
    { tag: 'path', attrs: { d: 'M4.2 6.2 8 2.6l3.8 3.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } },
    { tag: 'path', attrs: { d: 'M4.2 9.8 8 13.4l3.8-3.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } },
  ],
  /** A small chevron pointing right: section / metric affordances. */
  chevron: [
    { tag: 'path', attrs: { d: 'M6 3.5 10.5 8 6 12.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } },
  ],
}

/** Extension buckets, lowercase with the leading dot. */
const CODE_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.ps1', '.psm1', '.sh',
  '.bat', '.cmd', '.go', '.rs', '.java', '.cs', '.c', '.cpp', '.rb', '.php',
  '.html', '.css',
])
const DOC_EXT = new Set(['.md', '.txt', '.doc', '.docx', '.rtf', '.pdf'])
const DATA_EXT = new Set(['.json', '.jsonl', '.csv', '.tsv', '.xlsx', '.xls', '.yml', '.yaml', '.toml', '.xml', '.sql', '.ini'])
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp'])
const ARCHIVE_EXT = new Set(['.zstd', '.zip', '.gz', '.tar', '.7z', '.rar'])

/**
 * Pick the icon kind that represents one file.
 * @param {{ kind?: string, path?: string, name?: string }} file the file row.
 * @returns {string} an icon kind.
 */
export function iconKindForFile(file) {
  if (file?.kind === 'directory') return 'folder'
  const text = typeof file?.path === 'string' ? file.path : file?.name
  if (typeof text !== 'string') return 'doc'
  const index = text.lastIndexOf('.')
  if (index < 0) return 'doc'
  const extension = text.slice(index).toLowerCase()
  if (CODE_EXT.has(extension)) return 'code'
  if (DOC_EXT.has(extension)) return 'doc'
  if (DATA_EXT.has(extension)) return 'data'
  if (IMAGE_EXT.has(extension)) return 'image'
  if (ARCHIVE_EXT.has(extension)) return 'archive'
  return 'doc'
}

/**
 * Build one icon element.
 * @param {Function} h the createElement function to build with.
 * @param {string} kind an icon kind.
 * @param {string} className class for the `svg` element.
 * @param {number} [size] rendered square size.
 * @returns {object} the icon element.
 */
export function buildIcon(h, kind, className, size = 12) {
  const ops = ICONS[kind] ?? ICONS.doc
  return h(
    'svg',
    {
      className,
      viewBox: '0 0 16 16',
      width: size,
      height: size,
      'aria-hidden': true,
      focusable: false,
    },
    ops.map((op, index) =>
      h(op.tag, { key: index, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, ...op.attrs }),
    ),
  )
}
