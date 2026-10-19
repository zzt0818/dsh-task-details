/**
 * Stylesheet for the task-details panel and its trigger.
 *
 * Every colour comes from the host's `--dsw-alias-*` tokens and every size
 * from one scale declared at the top of the sheet, so a theme change or a
 * panel resize scales a single system.
 */

/** @type {string} Stylesheet identity used for the document tag and its disposal. */
export const STYLE_ID = 'dsh-task-details/panel.css'

/** @type {string} */
export const STYLES = String.raw`
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
