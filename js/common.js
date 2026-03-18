(function () {
  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(text) {
    return escapeHtml(text).replace(/`/g, '&#96;');
  }

  function pageEquals(a, b) {
    return JSON.stringify(a || {}) === JSON.stringify(b || {});
  }

  function safeFileName(text) {
    return String(text || 'project').replace(/[^a-z0-9_-]+/gi, '_');
  }

  function renderSheetPage(options) {
    const opts = options || {};
    const title = opts.title ? `<div class="page-title-row"><h2>${escapeHtml(opts.title)}</h2>${opts.titleActions || ''}</div>` : '';
    const note = opts.note ? `<div class="sheet-note">${opts.note}</div>` : '';
    const classes = ['page-card', 'compact-page', 'sheet-page'];
    if (opts.wide) classes.push('sheet-page--wide');
    if (opts.printSheet) classes.push('wind-print-sheet');
    return `<div class="${classes.join(' ')}">${title}${note}${opts.body || ''}</div>`;
  }

  const api = { escapeHtml, escapeAttr, pageEquals, safeFileName, renderSheetPage };
  window.StructuralCalcCommon = api;
  if (window.StructuralCalcModules) window.StructuralCalcModules.register('common', api);
})();
