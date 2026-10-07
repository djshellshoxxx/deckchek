// Inline SVG icon set (CSP: no remote assets). 24px grid, stroke = currentColor.

const P = {
  quick: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  speed: '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="M12 13l4-5"/><circle cx="12" cy="13" r="1.4"/>',
  cartridge: '<path d="M5 5h9l3 5-5 3H7z"/><path d="M12 13l1.5 6"/><circle cx="13.6" cy="19.4" r="1"/>',
  dvs: '<circle cx="12" cy="12" r="8.5"/><path d="M7 12c1.2-3 2.4-3 3.6 0s2.4 3 3.6 0 2.4-3 3.6 0"/>',
  vinyl: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 5.5a6.5 6.5 0 0 1 6.5 6.5"/>',
  calibration: '<path d="M5 4v16M12 4v16M19 4v16"/><rect x="3" y="7" width="4" height="3" rx="1"/><rect x="10" y="13" width="4" height="3" rx="1"/><rect x="17" y="9" width="4" height="3" rx="1"/>',
  equipment: '<rect x="3.5" y="4" width="17" height="6" rx="1.5"/><rect x="3.5" y="14" width="17" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/>',
  system: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="M6 10h3l1.5-2.5 3 5L15 10h3"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/>',
  pass: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9.5"/>',
  review: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  warn: '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.2h.01"/>',
  fail: '<path d="M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z"/><path d="M9 9l6 6M15 9l-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.6M12 17.2h.01"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 14h6M9 17h4"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  record: '<circle cx="12" cy="12" r="6"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4 19.5h16"/>',
  upload: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M4 19.5h16"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  chevronDown: '<path d="M5 9l7 7 7-7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plug: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
  compare: '<path d="M8 3v18M16 3v18"/><path d="M3 8h5M16 16h5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.2h.01"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.3L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.3L20 15"/><path d="M20 20v-5h-5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  wave: '<path d="M2 12h2l2-5 3 10 3-14 3 16 3-11 2 4h2"/>',
  arrowRight: '<path d="M4 12h15M14 6.5l5.5 5.5-5.5 5.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  minus: '<path d="M5 12h14"/>',
};

/** SVG markup for an icon name; decorative (aria-hidden) unless a label is given. */
export function icon(name, { size = 20, label = null, cls = '' } = {}) {
  const body = P[name] || P.info;
  const a11y = label ? `role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${body}</svg>`;
}

export const STATUS = {
  pass: { icon: 'pass', label: 'PASS' },
  review: { icon: 'review', label: 'REVIEW' },
  warn: { icon: 'warn', label: 'WARNING' },
  fail: { icon: 'fail', label: 'FAIL' },
  info: { icon: 'info', label: 'INFO' },
};

/** Status chip: icon + uppercase word + colour (never colour alone). */
export function chip(status, text = null, { size = 16 } = {}) {
  const s = STATUS[status] || STATUS.info;
  return `<span class="chip chip-${status in STATUS ? status : 'info'}">${icon(s.icon, { size })}<span>${text ?? s.label}</span></span>`;
}
