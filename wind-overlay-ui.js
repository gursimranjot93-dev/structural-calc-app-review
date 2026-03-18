(function () {
  const { getWindModule } = window.StructuralCalcModules.require('wind-state');
  const { escapeHtml, escapeAttr } = window.StructuralCalcModules.require('common');
  const { polygonBounds } = window.StructuralCalcModules.require('wind-overlay-engine');

  function renderWindOverlayPage(state) {
    const wind = getWindModule(state);
    const overlay = wind.inputs.overlay || {};
    const panels = overlay.panels || {};
    const longPanel = panels.long;
    const shortPanel = panels.short;

    return `
      <div class="wind-overlay-workspace">
        <div class="wind-overlay-note no-print">
          Sheet 4.2 converts the pressure output from Sheet 4.1 into diaphragm loads by principal direction. The control rail at left is a working area only and is not part of the printed sheet. The printable sheets at right contain the long-direction and short-direction elevation output with diaphragm loads.
        </div>
        <div class="wind-overlay-main-layout">
          <aside class="wind-overlay-controls no-print">
            ${renderOverlayControlPanel('long', longPanel, wind, 1)}
            ${renderOverlayControlPanel('short', shortPanel, wind, 0)}
          </aside>
          <div class="wind-overlay-sheet-stack">
            ${renderOverlayPrintSheet('long', longPanel, wind, 1)}
            ${renderOverlayPrintSheet('short', shortPanel, wind, 0)}
          </div>
        </div>
      </div>
    `;
  }

  function renderOverlayControlPanel(panelKey, panel, wind, directionIndex) {
    const panelData = panel || {};
    const generated = panelData.generated;
    const direction = wind.results && wind.results.directions ? wind.results.directions[directionIndex] : null;
    const roofPressure = direction ? Math.abs(Number(direction.summary && direction.summary.governingRoof) || 0) : 0;
    const modeLabelMap = {
      idle: 'Idle',
      calibrate: 'Calibration mode',
      'trace-building': 'Tracing full elevation outline',
      'trace-roof': 'Tracing roof override region',
      'mark-diaphragm': 'Placing diaphragm marker'
    };
    const markerCount = (panelData.diaphragmMarkers || []).length;
    return `
      <div class="page-card compact-page wind-work-controls">
        <h3 class="wind-overlay-card-title">${escapeHtml(panelData.title || '')} Controls</h3>
        <div class="muted wind-overlay-card-subtitle">${direction ? escapeHtml(direction.directionLabel) : 'Pressure direction not available.'}</div>
        <div class="top-band desktop-lock wind-top-band wind-overlay-control-grid">
          ${renderFieldBox('Image / Scale', `
            <div class="tri-field"><div class="label">Elevation image</div><input class="input yellow-input" type="file" accept="image/*" data-wind-overlay-file data-panel="${panelKey}" /><div class="unit"></div></div>
            ${numberInputWithPanel('Known Dimension', panelKey, 'calibrationDistance', panelData.calibrationDistance, 'ft')}
            ${readonlyRow('Mode', modeLabelMap[panelData.mode] || 'Idle')}
            ${readonlyRow('Scale', panelData.scaleFtPerPx ? formatNum(panelData.scaleFtPerPx, 4) + ' ft/px' : 'Not set')}
            <div class="sheet-inline-actions wind-overlay-actions">
              <button class="toolbar-btn" data-overlay-mode="calibrate" data-panel="${panelKey}">Pick 2 Scale Points</button>
              <button class="toolbar-btn" data-overlay-action="apply-scale" data-panel="${panelKey}">Set Scale</button>
              <button class="toolbar-btn" data-overlay-action="clear-scale" data-panel="${panelKey}">Clear Scale</button>
            </div>
          `)}
          ${renderFieldBox('Trace / Markers', `
            ${readonlyRow('Full Elevation Trace', panelData.buildingTrace && panelData.buildingTrace.length >= 3 ? 'Saved' : 'Not traced')}
            ${readonlyRow('Roof Override Trace', panelData.roofTrace && panelData.roofTrace.length >= 3 ? 'Saved' : 'None')}
            ${readonlyRow('Diaphragm Markers', markerCount)}
            ${readonlyRow('Roof Pressure', roofPressure ? formatNum(roofPressure, 2) + ' psf' : '—')}
            <div class="sheet-inline-actions wind-overlay-actions">
              <button class="toolbar-btn" data-overlay-mode="trace-building" data-panel="${panelKey}" ${(panelData.scaleFtPerPx && !generated) ? '' : 'disabled'}>Trace Full Elevation</button>
              <button class="toolbar-btn" data-overlay-mode="trace-roof" data-panel="${panelKey}" ${(panelData.scaleFtPerPx && !generated) ? '' : 'disabled'}>Trace Roof Override</button>
              <button class="toolbar-btn" data-overlay-mode="mark-diaphragm" data-panel="${panelKey}" ${(panelData.scaleFtPerPx && panelData.buildingTrace && panelData.buildingTrace.length >= 3 && !generated) ? '' : 'disabled'}>Add Diaphragm Marker</button>
              <button class="toolbar-btn" data-overlay-action="undo-point" data-panel="${panelKey}" ${generated ? 'disabled' : ''}>Undo Point</button>
              <button class="toolbar-btn" data-overlay-action="close-trace" data-panel="${panelKey}" ${generated ? 'disabled' : ''}>Close Trace</button>
              <button class="toolbar-btn" data-overlay-action="edit-trace" data-panel="${panelKey}" ${generated ? '' : 'disabled'}>Edit Trace</button>
              <button class="toolbar-btn" data-overlay-action="clear-building" data-panel="${panelKey}" ${generated ? 'disabled' : ''}>Clear Trace</button>
              <button class="toolbar-btn" data-overlay-action="clear-roof" data-panel="${panelKey}" ${generated ? 'disabled' : ''}>Clear Roof Trace</button>
              <button class="toolbar-btn" data-overlay-action="clear-diaphragms" data-panel="${panelKey}" ${generated ? 'disabled' : ''}>Clear Markers</button>
            </div>
          `)}
          ${renderFieldBox('Generate', `
            ${readonlyRow('Building Height', generated ? formatNum(generated.buildingHeightFt, 2) + ' ft' : '—')}
            ${readonlyRow('Roof Override Area', generated ? formatNum(generated.roofAreaFt2, 2) + ' sf' : '—')}
            ${readonlyRow('Total Direction Load', generated ? formatNum(generated.totalLoadLb, 2) + ' lb' : '—')}
            <div class="sheet-inline-actions wind-overlay-actions">
              <button class="toolbar-btn" data-overlay-action="generate" data-panel="${panelKey}" ${(panelData.scaleFtPerPx && panelData.buildingTrace && panelData.buildingTrace.length >= 3 && !generated) ? '' : 'disabled'}>Generate Diaphragm Loads</button>
            </div>
          `)}
        </div>
      </div>
    `;
  }

  function renderOverlayPrintSheet(panelKey, panel, wind, directionIndex) {
    const panelData = panel || {};
    const generated = panelData.generated;
    const direction = wind.results && wind.results.directions ? wind.results.directions[directionIndex] : null;
    return `
      <div class="page-card compact-page sheet-page wind-print-sheet wind-print-stack">
        <h3 class="wind-overlay-card-title">${escapeHtml(panelData.title || '')}</h3>
        <div class="muted wind-overlay-card-subtitle">${direction ? escapeHtml(direction.directionLabel) : 'Pressure direction not available.'}</div>
        <div class="wind-print-panel-inner">
          <div class="page-card compact-page wind-print-sheet wind-overlay-section-card">
            ${renderOverlayCanvas(panelKey, panelData, generated)}
          </div>
          <div class="page-card compact-page wind-print-sheet wind-overlay-section-card">
            <h4 class="wind-overlay-section-title">Diaphragm Loads</h4>
            ${renderGeneratedLoadsTable(generated, panelData)}
          </div>
        </div>
      </div>
    `;
  }
  function bindWindOverlayEvents(handlers) {
    document.querySelectorAll('[data-wind-overlay-file]').forEach((fileInput) => {
      fileInput.addEventListener('change', (evt) => {
        const file = evt.target.files && evt.target.files[0];
        if (file) handlers.uploadWindOverlayImage(fileInput.dataset.panel, file);
      });
    });
    bindAll('[data-wind-overlay-panel]', 'input', (el) => handlers.updateWindOverlayPanelField(el.dataset.panel, el.dataset.field, el.value));
    bindAll('[data-wind-overlay-global]', 'input', (el) => handlers.updateWindOverlayGlobalField(el.dataset.field, el.value));
    bindAll('[data-overlay-mode]', 'click', (el) => handlers.setWindOverlayMode(el.dataset.panel, el.dataset.overlayMode));
    bindAll('[data-overlay-action]', 'click', (el) => handlers.performWindOverlayAction(el.dataset.panel, el.dataset.overlayAction));
    document.querySelectorAll('[data-overlay-board]').forEach((board) => {
      board.addEventListener('click', (evt) => {
        const rect = board.getBoundingClientRect();
        handlers.addWindOverlayPoint(board.dataset.panel, {
          x: evt.clientX - rect.left,
          y: evt.clientY - rect.top,
          width: rect.width,
          height: rect.height
        });
      });
    });
  }

  function renderOverlayCanvas(panelKey, panel, generated) {
    const points = panel.currentTracePoints || [];
    const calibration = panel.calibrationPoints || [];
    const width = 900;
    const height = 520;

    if (!panel.imageDataUrl) {
      return `<div class="muted wind-overlay-empty">Upload the elevation image for this fixed direction to begin.</div>`;
    }

    const panelId = `clip-${panelKey}`;
    const buildingPoly = panel.buildingTrace && panel.buildingTrace.length >= 3 ? panel.buildingTrace.map((pt) => `${pt.x},${pt.y}`).join(' ') : '';
    const generatedMode = !!(generated && generated.rows && generated.rows.length);
    return `
      <div class="wind-overlay-board" data-overlay-board data-panel="${panelKey}" style="position:relative; width:100%; max-width:${width}px; min-height:220px; border:1px solid #cfd5df; border-radius:10px; overflow:hidden; cursor:crosshair; background:#f7f8fb;">
        <img src="${panel.imageDataUrl}" alt="Elevation" style="display:block; width:100%; height:auto; user-select:none; pointer-events:none;" />
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="position:absolute; inset:0; width:100%; height:100%;">
          <defs>
            ${buildingPoly ? `<clipPath id="${panelId}"><polygon points="${buildingPoly}"></polygon></clipPath>` : ''}
            ${renderHatchDefs(panelKey)}
          </defs>
          ${renderPressureGuide(panel, generated)}
          ${generated ? renderTributaryRegions(generated, panel, panelId) : ''}
          ${generatedMode ? renderBuildingOutline(panel) : renderPolygon(panel.buildingTrace, 'rgba(54, 118, 217, 0.10)', '#3676d9', 'Full Elevation')}
          ${generatedMode ? '' : renderPolygon(panel.roofTrace, 'rgba(217, 74, 56, 0.15)', '#d94a38', 'Roof Override')}
          ${renderDiaphragmMarkers(panel)}
          ${generatedMode ? '' : (points.length ? `<polyline points="${points.map((pt) => `${pt.x},${pt.y}`).join(' ')}" fill="none" stroke="#1f8f5f" stroke-width="2"></polyline>` : '')}
          ${generatedMode ? '' : points.map((pt) => `<circle cx="${pt.x}" cy="${pt.y}" r="4" fill="#1f8f5f"></circle>`).join('')}
          ${calibration.map((pt) => `<circle cx="${pt.x}" cy="${pt.y}" r="5" fill="#8756d8"></circle>`).join('')}
          ${calibration.length === 2 ? `<line x1="${calibration[0].x}" y1="${calibration[0].y}" x2="${calibration[1].x}" y2="${calibration[1].y}" stroke="#8756d8" stroke-width="2"></line>` : ''}
        </svg>
      </div>
    `;
  }

  function renderPolygon(points, fill, stroke, label) {
    if (!points || points.length < 3) return '';
    const c = centroid(points);
    return `
      <polygon points="${points.map((pt) => `${pt.x},${pt.y}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="2"></polygon>
      <text x="${c.x}" y="${c.y}" font-size="14" fill="#1d2a4d">${escapeHtml(label)}</text>
    `;
  }

  function renderGeneratedLoadsTable(generated, panel) {
    const markers = panel && Array.isArray(panel.diaphragmMarkers) ? panel.diaphragmMarkers : [];
    const markerNote = markers.length ? `<div class="muted wind-overlay-load-note">Markers placed on image: ${markers.length}. The highest marker is treated as Roof Diaphragm for tributary assignment.</div>` : '<div class="muted wind-overlay-load-note">Add diaphragm markers directly on the elevation after tracing the full outline.</div>';
    if (generated && generated.requiresMarkers) return markerNote + '<div class="muted">Place at least one diaphragm marker before generating loads.</div>';
    if (!generated || !generated.rows || !generated.rows.length) return markerNote + '<div class="muted">Generate diaphragm loads after tracing the full elevation, setting the scale, and placing any diaphragm markers.</div>';
    return markerNote + `
      <table class="combo-table wind-table">
        <thead>
          <tr>
            <th>Diaphragm</th><th>Elev.</th><th>Trib. Range</th><th>Wall Area</th><th>Wall Load</th><th>Roof Area</th><th>Roof Load</th><th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${generated.rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.diaphragm)}</td>
              <td>${formatNum(row.elevationFt, 2)} ft</td>
              <td>${formatNum(row.tributaryLowFt, 2)}-${formatNum(row.tributaryHighFt, 2)} ft</td>
              <td>${formatNum(row.wallAreaFt2, 2)} sf</td>
              <td>${formatNum(row.wallLoadLb, 2)} lb</td>
              <td>${formatNum(row.roofAreaFt2, 2)} sf</td>
              <td>${formatNum(row.roofLoadLb, 2)} lb</td>
              <td>${formatNum(row.totalLoadLb, 2)} lb</td>
            </tr>
            ${row.slices && row.slices.length ? `<tr><td colspan="8" style="background:#fafbfe; font-size:12px;">${row.slices.map((s) => `${escapeHtml(s.label)}: ${formatNum(s.areaFt2, 2)} sf × ${formatNum(s.pressurePsf, 2)} psf = ${formatNum(s.loadLb, 2)} lb`).join(' &nbsp; | &nbsp; ')}</td></tr>` : ''}
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderDiaphragmMarkers(panel) {
    const markers = Array.isArray(panel.diaphragmMarkers) ? panel.diaphragmMarkers.slice().sort((a, b) => a.elevationFt - b.elevationFt) : [];
    const bounds = panel.buildingTrace && panel.buildingTrace.length >= 3 ? polygonBounds(panel.buildingTrace) : null;
    if (!markers.length || !bounds) return '';
    return markers.map((m, i) => `
      <g>
        <line x1="${bounds.minX}" y1="${m.y}" x2="${bounds.maxX}" y2="${m.y}" stroke="#2d7e5f" stroke-width="2" stroke-dasharray="8 5"></line>
        <text x="${bounds.maxX - 4}" y="${m.y - 6}" text-anchor="end" font-size="13" fill="#14513b">${i === markers.length - 1 ? 'Roof Diaphragm' : `Diaphragm ${i + 1}`}</text>
      </g>
    `).join('');
  }

  function renderPressureGuide(panel, generated) {
    if (!generated || !generated.wallBands || !generated.wallBands.length || !panel.scaleFtPerPx || !panel.buildingTrace || panel.buildingTrace.length < 3) return '';
    const bounds = polygonBounds(panel.buildingTrace);
    const guideX = bounds.maxX + 22;
    const scale = Number(panel.scaleFtPerPx) || 0;
    return generated.wallBands.map((band, i) => {
      const yTop = bounds.maxY - (band.highFt / scale);
      const yBot = bounds.maxY - (band.lowFt / scale);
      const fill = i % 2 === 0 ? 'rgba(102, 126, 234, 0.10)' : 'rgba(102, 126, 234, 0.18)';
      const centerY = (yTop + yBot) / 2;
      return `
        <g>
          <rect x="${guideX}" y="${yTop}" width="86" height="${Math.max(0, yBot - yTop)}" fill="${fill}" stroke="#5a6fcf" stroke-width="1"></rect>
          <text x="${guideX + 43}" y="${centerY - 10}" text-anchor="middle" font-size="10" fill="#1d2a4d">${escapeHtml(band.label)}</text>
          <text x="${guideX + 43}" y="${centerY + 2}" text-anchor="middle" font-size="9.5" fill="#1d2a4d">p, wall ${formatNum(Math.abs(band.pressure), 2)}</text>
          <text x="${guideX + 43}" y="${centerY + 14}" text-anchor="middle" font-size="9.5" fill="#1d2a4d">0.6 × p, wall ${formatNum(Math.abs(band.pressure06), 2)}</text>
        </g>
      `;
    }).join('') + `<text x="${guideX + 43}" y="${Math.max(14, bounds.minY + 14)}" text-anchor="middle" font-size="10.5" fill="#1d2a4d">Wall Pressure Bands</text>`;
  }

  function renderTributaryRegions(generated, panel, clipId) {
    if (!generated || !generated.rows || !generated.rows.length || !panel.scaleFtPerPx || !panel.buildingTrace || panel.buildingTrace.length < 3) return '';
    const bounds = polygonBounds(panel.buildingTrace);
    const scale = Number(panel.scaleFtPerPx) || 0;
    const roofPoly = panel.roofTrace && panel.roofTrace.length >= 3 ? panel.roofTrace.map((pt) => `${pt.x},${pt.y}`).join(' ') : '';
    const roofClipId = roofPoly ? `${clipId}-roof` : '';
    let svg = roofPoly ? `<defs><clipPath id="${roofClipId}"><polygon points="${roofPoly}"></polygon></clipPath></defs>` : '';
    svg += generated.rows.map((row, i) => {
      const yTop = bounds.maxY - (row.tributaryHighFt / scale);
      const yBot = bounds.maxY - (row.tributaryLowFt / scale);
      const patternId = `hatch-${clipId}-${i % 2}`;
      return `
        <g clip-path="url(#${clipId})">
          <rect x="${bounds.minX}" y="${yTop}" width="${bounds.maxX - bounds.minX}" height="${Math.max(0, yBot - yTop)}" fill="url(#${patternId})"></rect>
        </g>
        <line x1="${bounds.minX}" y1="${yTop}" x2="${bounds.maxX}" y2="${yTop}" stroke="#4d586e" stroke-width="1.2"></line>
        <line x1="${bounds.minX}" y1="${yBot}" x2="${bounds.maxX}" y2="${yBot}" stroke="#4d586e" stroke-width="1.2"></line>
        <text x="${bounds.minX + 8}" y="${Math.max(bounds.minY + 14, yTop + 14)}" font-size="12" fill="#24314d">${escapeHtml(row.diaphragm)}</text>
      `;
    }).join('');
    if (roofPoly) {
      svg += `<g clip-path="url(#${roofClipId})"><polygon points="${roofPoly}" fill="url(#crosshatch-${clipId})" stroke="#a34a3a" stroke-width="1.5"></polygon></g>`;
    }
    return svg;
  }

  function renderBuildingOutline(panel) {
    if (!panel.buildingTrace || panel.buildingTrace.length < 3) return '';
    return `<polygon points="${panel.buildingTrace.map((pt) => `${pt.x},${pt.y}`).join(' ')}" fill="none" stroke="#2a2a2a" stroke-width="2"></polygon>`;
  }

  function renderHatchDefs(panelKey) {
    const base = `clip-${panelKey}`;
    return `
      <pattern id="hatch-${base}-0" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="12" stroke="#4f5f7a" stroke-width="1.2"></line>
      </pattern>
      <pattern id="hatch-${base}-1" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(135)">
        <line x1="0" y1="0" x2="0" y2="12" stroke="#4f5f7a" stroke-width="1.2"></line>
      </pattern>
      <pattern id="crosshatch-${base}" patternUnits="userSpaceOnUse" width="12" height="12">
        <path d="M0,0 l12,12 M12,0 l-12,12" stroke="#8a3e2f" stroke-width="1.1"></path>
      </pattern>
    `;
  }

  function renderFieldBox(title, inner) {
    return `<div class="box"><div class="box-title">${title}</div><div class="box-body">${inner}</div></div>`;
  }

  function numberInputWithPanel(label, panel, field, value, unit) {
    return `<div class="tri-field"><div class="label">${label}</div><input class="input yellow-input" data-wind-overlay-panel data-panel="${panel}" data-field="${field}" value="${escapeAttr(value)}" /><div class="unit">${unit || ''}</div></div>`;
  }

  function readonlyRow(label, value) {
    return `<div class="tri-field"><div class="label">${label}</div><div class="input readonly-like">${escapeHtml(String(value))}</div><div class="unit"></div></div>`;
  }

  function bindAll(selector, event, handler) {
    document.querySelectorAll(selector).forEach((el) => el.addEventListener(event, () => handler(el)));
  }

  function formatNum(value, decimals) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(decimals);
  }

  function centroid(points) {
    if (!points || !points.length) return { x: 0, y: 0 };
    const sum = points.reduce((acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
  }

  const api = { renderWindOverlayPage, bindWindOverlayEvents };
  if (window.StructuralCalcModules) window.StructuralCalcModules.register('wind-overlay-ui', api);
})();
