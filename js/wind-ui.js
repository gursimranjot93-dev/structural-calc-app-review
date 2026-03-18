(function () {
  const { getWindModule } = window.StructuralCalcModules.require('wind-state');
  const { escapeHtml, escapeAttr, renderSheetPage } = window.StructuralCalcModules.require('common');
  const overlayUI = window.StructuralCalcModules.require('wind-overlay-ui');

  function renderWindSetupPage(state) {
    const wind = getWindModule(state);
    const pressure = wind.inputs.pressure || {};
    const geometry = wind.inputs.pressure || {};
    const kztSource = pressure.KztSource || 'one';
    const kztValue = effectiveKzt(wind);

    return renderSheetPage({
      title: 'Wind',
      note: 'Sheet 4 stores the Chapter 26 setup, building geometry, and Kzt selection. Sheet 4.1 reports pressures. Sheet 4.2 converts those pressures into diaphragm loads. Sheet 4.3 appears only when Kzt is calculated.',
      wide: true,
      body: `
        <div class="top-band desktop-lock wind-top-band">
          ${renderFieldBox('Chapter 26 Setup', `
            ${numberInput('Basic Wind Speed, V', 'wind-pressure', 'V', pressure.V, 'mph')}
            ${selectInput('Exposure', 'wind-pressure-select', 'exposure', pressure.exposure, ['B','C','D'])}
            ${numberInput('Kd', 'wind-pressure', 'Kd', pressure.Kd, '')}
            ${numberInput('G', 'wind-pressure', 'G', pressure.G, '')}
            ${readonlyRow('Enclosure', 'Enclosed')}
            ${readonlyRow('GCpi Cases', '+0.18 / -0.18')}
          `)}
          ${renderFieldBox('Building Geometry', `
            ${numberInput('Longer Dimension', 'wind-pressure', 'longerDimension', geometry.longerDimension, 'ft')}
            ${numberInput('Shorter Dimension', 'wind-pressure', 'shorterDimension', geometry.shorterDimension, 'ft')}
            ${numberInput('Mean Roof Height, h', 'wind-pressure', 'h', geometry.h, 'ft')}
            ${selectInput('Roof Entry', 'wind-pressure-select', 'roofSlopeMode', geometry.roofSlopeMode, [{value:'slope', label:'Slope'}, {value:'flat', label:'Flat'}])}
            ${numberInput('Roof Slope', 'wind-pressure', 'roofSlopeRise', geometry.roofSlopeRise, ':12')}
            ${readonlyRow('Roof Angle', wind.results && wind.results.pressure ? formatNum(wind.results.pressure.roofAngleDeg, 2) + '°' : '—')}
          `)}
          ${renderFieldBox('Kzt Selection', `
            ${selectInput('Kzt Source', 'wind-pressure-select', 'KztSource', kztSource, [
              {value:'one', label:'Assume 1.0'},
              {value:'manual', label:'Manual'},
              {value:'linked', label:'Calculated'}
            ])}
            ${numberInput('Manual Kzt', 'wind-pressure', 'KztManual', pressure.KztManual, '')}
            ${readonlyRow('Effective Kzt', formatNum(kztValue, 3))}
            ${readonlyRow('4.3 Kzt Sheet', kztSource === 'linked' ? 'Shown in tree' : 'Hidden')}
          `)}
        </div>
      `
    });
  }

  function bindWindSetupEvents(handlers) {
    bindAll('[data-wind-pressure]', 'input', (el) => handlers.updateWindPressureField(el.dataset.field, el.value));
    bindAll('[data-wind-pressure-select]', 'change', (el) => handlers.updateWindPressureField(el.dataset.field, el.value));
  }

  function renderWindPressurePage(state) {
    const wind = getWindModule(state);
    const results = wind.results;
    return renderSheetPage({
      title: 'Pressure Sheet',
      note: 'Sheet 4.1 is the Chapter 27 pressure sheet only. Chapter 26 setup and geometry are controlled from Sheet 4. Wall pressures are reported by height band. Roof pressure is reported separately at the mean roof height.',
      wide: true,
      body: results ? renderWindResults(results) : `<div class="muted">No wind results available.</div>`
    });
  }

  function bindWindPressureEvents() {}

  function renderWindKztPage(state) {
    const wind = getWindModule(state);
    const kzt = wind.inputs.kzt || {};
    const topo = wind.results && wind.results.topo ? wind.results.topo : null;
    const axes = kzt.scanAxes || {};
    const axisKeys = ['ns', 'ew', 'nwse', 'nesw'];
    return renderSheetPage({
      title: 'Kzt Calculation',
      note: 'Sheet 4.3 reads the Sheet 1 address, can derive site latitude/longitude, and can generate four terrain profile lines for Kzt review before final direct-input selection.',
      wide: true,
      body: `
        <div class="top-band desktop-lock wind-top-band" style="margin-top:12px; grid-template-columns: 1.2fr 1fr 1fr;">
          ${renderFieldBox('Project Location / Terrain Scan', `
            ${readonlyRow('Sheet 1 Address', state.project && state.project.jobSiteAddress ? escapeHtml(state.project.jobSiteAddress) : 'No job site address entered on Sheet 1')}
            ${numberInput('Site Latitude', 'wind-kzt', 'siteLat', kzt.siteLat, 'deg')}
            ${numberInput('Site Longitude', 'wind-kzt', 'siteLon', kzt.siteLon, 'deg')}
            ${numberInput('Points Each Side', 'wind-kzt', 'pointCountEachSide', kzt.pointCountEachSide, '')}
            ${numberInput('Total Line Length', 'wind-kzt', 'totalLineMiles', kzt.totalLineMiles, 'mile')}
            <div class="sheet-inline-actions" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
              <button class="toolbar-btn" data-kzt-action="geocode">Get Site Lat / Lon</button>
              <button class="toolbar-btn" data-kzt-action="scan">Generate Points + Profiles</button>
              <button class="toolbar-btn" data-kzt-action="clear-scan">Clear Profiles</button>
            </div>
            ${kzt.geocodeStatus ? `<div class="muted" style="margin-top:8px;">${escapeHtml(kzt.geocodeStatus)}</div>` : ''}
            ${kzt.scanStatus ? `<div class="muted" style="margin-top:4px;">${escapeHtml(kzt.scanStatus)}</div>` : ''}
          `)}
          ${renderFieldBox('Direct Kzt Inputs', `
            ${selectInput('Shape', 'wind-kzt-select', 'shape', kzt.shape, ['2-D Ridge','2-D Escarp','3-D Hill'])}
            ${selectInput('Exposure', 'wind-kzt-select', 'exposure', kzt.exposure, ['B','C','D'])}
            ${selectInput('Side of hill', 'wind-kzt-select', 'sideOfHill', kzt.sideOfHill, ['Upwind','Downwind'])}
            ${numberInput('H', 'wind-kzt', 'H', kzt.H, 'ft')}
            ${numberInput('Lh', 'wind-kzt', 'LhMiles', kzt.LhMiles, 'mile')}
            ${numberInput('x', 'wind-kzt', 'xMiles', kzt.xMiles, 'mile')}
            ${numberInput('z', 'wind-kzt', 'z', kzt.z, 'ft')}
          `)}
          ${renderFieldBox('Computed Factors', topo ? `
            ${readonlyRow('H/Lh', formatNum(topo.HLh, 3))}
            ${readonlyRow('mu', formatNum(topo.mu, 3))}
            ${readonlyRow('gamma', formatNum(topo.gamma, 3))}
            ${readonlyRow('K1', formatNum(topo.K1, 3))}
            ${readonlyRow('K2', formatNum(topo.K2, 3))}
            ${readonlyRow('K3', formatNum(topo.K3, 3))}
            ${readonlyRow('Kzt', formatNum(topo.Kzt, 3))}
            ${readonlyRow('Condition', topo.conditionMet ? 'Met' : 'Not met')}
          ` : '<div class="muted">No Kzt output yet.</div>')}
        </div>

        <div style="display:grid; gap:12px; margin-top:14px;">
          ${axisKeys.some((key) => axes[key] && axes[key].points && axes[key].points.length) ? axisKeys.map((key) => axes[key] && axes[key].points && axes[key].points.length ? renderKztAxisCard(axes[key]) : '').join('') : `<div class="page-card compact-page sheet-page wind-print-sheet"><h4 style="margin-bottom:8px;">Terrain Profiles</h4><div class="muted">Run the terrain scan to populate the four profile lines.</div></div>`}
        </div>
      `
    });
  }

  function bindWindKztEvents(handlers) {
    bindAll('[data-wind-kzt]', 'input', (el) => handlers.updateWindKztField(el.dataset.field, el.value));
    bindAll('[data-wind-kzt-select]', 'change', (el) => handlers.updateWindKztField(el.dataset.field, el.value));
    bindAll('[data-kzt-action]', 'click', (el) => {
      const action = el.dataset.kztAction;
      if (action === 'geocode') handlers.geocodeWindKztProjectAddress();
      if (action === 'scan') handlers.runWindKztTerrainScan();
      if (action === 'clear-scan') handlers.clearWindKztTerrainScan();
    });
  }

  function renderKztAxisCard(axis) {
    return `
      <div class="page-card compact-page sheet-page wind-print-sheet">
        <h4 style="margin-bottom:10px;">${escapeHtml(axis.label)} Terrain Profile</h4>
        <div style="display:grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, 1fr); gap:12px; align-items:start;">
          <div style="overflow:auto;">
            <table class="combo-table wind-table">
              <thead><tr><th>Pt</th><th>Offset</th><th>Latitude</th><th>Longitude</th><th>Elevation</th></tr></thead>
              <tbody>
                ${axis.points.map((pt) => `<tr${pt.isSite ? ' style="background:#f7f8fb; font-weight:700;"' : ''}><td>${pt.index}</td><td>${formatNum(pt.offsetMiles, 2)} mi</td><td>${formatNum(pt.lat, 6)}</td><td>${formatNum(pt.lon, 6)}</td><td>${pt.elevation == null ? '—' : formatNum(pt.elevation, 1) + ' m'}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div>${renderKztProfileSvg(axis)}</div>
        </div>
      </div>
    `;
  }

  function renderKztProfileSvg(axis) {
    const pts = (axis.points || []).filter((pt) => Number.isFinite(pt.elevation));
    if (!pts.length) return `<div class="muted">No elevation values available yet.</div>`;
    const width = 460;
    const height = 220;
    const pad = { l: 42, r: 12, t: 10, b: 28 };
    const minX = Math.min(...pts.map((pt) => pt.offsetMiles));
    const maxX = Math.max(...pts.map((pt) => pt.offsetMiles));
    const minY = Math.min(...pts.map((pt) => pt.elevation));
    const maxY = Math.max(...pts.map((pt) => pt.elevation));
    const sx = (x) => pad.l + ((x - minX) / Math.max(1e-9, maxX - minX)) * (width - pad.l - pad.r);
    const sy = (y) => height - pad.b - ((y - minY) / Math.max(1e-9, maxY - minY || 1)) * (height - pad.t - pad.b);
    const poly = pts.map((pt) => `${sx(pt.offsetMiles)},${sy(pt.elevation)}`).join(' ');
    const site = pts.find((pt) => pt.isSite);
    return `<svg viewBox="0 0 ${width} ${height}" style="width:100%; height:auto; border:1px solid #cfd5df; border-radius:8px; background:#fff;">
      <line x1="${pad.l}" y1="${height - pad.b}" x2="${width - pad.r}" y2="${height - pad.b}" stroke="#555" stroke-width="1"></line>
      <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${height - pad.b}" stroke="#555" stroke-width="1"></line>
      <polyline points="${poly}" fill="none" stroke="#3676d9" stroke-width="2"></polyline>
      ${site ? `<line x1="${sx(site.offsetMiles)}" y1="${pad.t}" x2="${sx(site.offsetMiles)}" y2="${height - pad.b}" stroke="#2d7e5f" stroke-dasharray="6 4" stroke-width="1.5"></line><circle cx="${sx(site.offsetMiles)}" cy="${sy(site.elevation)}" r="4" fill="#2d7e5f"></circle>` : ''}
      <text x="${width / 2}" y="${height - 6}" text-anchor="middle" font-size="11" fill="#1d2a4d">Offset from site (miles)</text>
      <text x="16" y="${height / 2}" text-anchor="middle" font-size="11" fill="#1d2a4d" transform="rotate(-90 16 ${height / 2})">Elevation (m)</text>
      <text x="${pad.l}" y="${pad.t + 12}" font-size="10" fill="#1d2a4d">Max ${formatNum(maxY,1)} m</text>
      <text x="${pad.l}" y="${height - pad.b - 4}" font-size="10" fill="#1d2a4d">Min ${formatNum(minY,1)} m</text>
    </svg>`;
  }
  function renderWindOverlayPage(state) {
    return overlayUI.renderWindOverlayPage(state);
  }

  function bindWindOverlayEvents(handlers) {
    overlayUI.bindWindOverlayEvents(handlers);
  }

  function renderWindResults(results) {
    return `
      <div class="combo-block">
        <h3>Global Pressure Inputs Used by Sheet 4.1</h3>
        <table class="combo-table wind-table">
          <thead><tr><th>Kzt</th><th>qh</th><th>Roof Angle</th><th>Rounded Angle</th></tr></thead>
          <tbody><tr>
            <td>${formatNum(results.pressure.Kzt, 3)}</td>
            <td>${formatNum(results.pressure.qh, 2)} psf</td>
            <td>${formatNum(results.pressure.roofAngleDeg, 2)}°</td>
            <td>${formatNum(results.pressure.roundedRoofAngleDeg, 0)}°</td>
          </tr></tbody>
        </table>
      </div>
      ${results.directions.map((dir) => renderDirectionResultBlock(dir)).join('')}
    `;
  }

  function renderDirectionResultBlock(dir) {
    const roof = dir.rows && dir.rows.length ? dir.rows[dir.rows.length - 1] : null;
    return `
      <div class="combo-block">
        <h3>${escapeHtml(dir.directionLabel)}</h3>
        <div class="muted" style="margin-bottom:8px;">L = ${formatNum(dir.L, 2)} ft, B = ${formatNum(dir.B, 2)} ft, L/B = ${formatNum(dir.ratioLB, 3)}, h/L = ${formatNum(dir.ratiohL, 3)}</div>
        <table class="combo-table wind-table" style="margin-bottom:12px;">
          <thead>
            <tr><th>Ht</th><th>z (ft)</th><th>Kz</th><th>qz (psf)</th><th>pz, wall (psf)</th><th>ph, wall (psf)</th><th>p, wall (psf)</th><th>0.6 × p, wall (psf)</th></tr>
          </thead>
          <tbody>
            ${(dir.rows || []).map((row) => `
              <tr>
                <td>${escapeHtml(row.band)}</td>
                <td>${formatNum(row.z, 0)}</td>
                <td>${formatNum(row.Kz, 3)}</td>
                <td>${formatNum(row.qz, 2)}</td>
                <td>${formatNum(row.windward.governing, 2)}</td>
                <td>${formatNum(row.leeward.governing, 2)}</td>
                <td>${formatNum(row.wall.governing, 2)}</td>
                <td>${formatNum(row.wall.net06, 2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <table class="combo-table wind-table">
          <thead>
            <tr><th>Roof at h</th><th>ph, roof, WW1 (psf)</th><th>ph, roof, WW2 (psf)</th><th>ph, roof, LW (psf)</th><th>p, roof, for LFRS design (psf)</th><th>0.6 × p, roof, for LFRS design (psf)</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Mean roof height</td>
              <td>${roof ? formatNum(roof.roofWw1.governing, 2) : '—'}</td>
              <td>${roof ? formatNum(roof.roofWw2.governing, 2) : '—'}</td>
              <td>${roof ? formatNum(roof.roofLw.governing, 2) : '—'}</td>
              <td>${formatNum(dir.summary.governingRoof, 2)}</td>
              <td>${formatNum(dir.summary.governingRoof * 0.6, 2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function renderFieldBox(title, inner) {
    return `<div class="box"><div class="box-title">${title}</div><div class="box-body">${inner}</div></div>`;
  }

  function numberInput(label, datasetPrefix, field, value, unit) {
    return `<div class="tri-field"><div class="label">${label}</div><input class="input yellow-input" data-${datasetPrefix} data-field="${field}" value="${escapeAttr(value)}" /><div class="unit">${unit || ''}</div></div>`;
  }


  function selectInput(label, datasetPrefix, field, value, options) {
    const items = options.map((option) => typeof option === 'string' ? { value: option, label: option } : option);
    return `<div class="tri-field"><div class="label">${label}</div><select class="select yellow-input" data-${datasetPrefix} data-field="${field}">${items.map((item) => `<option value="${escapeAttr(item.value)}" ${String(value) === String(item.value) ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select><div class="unit"></div></div>`;
  }

  function readonlyRow(label, value) {
    return `<div class="tri-field"><div class="label">${label}</div><div class="input readonly-like">${escapeHtml(String(value))}</div><div class="unit"></div></div>`;
  }

  function effectiveKzt(wind) {
    if (wind.inputs.pressure.KztSource === 'manual') return Number(wind.inputs.pressure.KztManual) || 1;
    if (wind.inputs.pressure.KztSource === 'linked' && wind.results && wind.results.topo) return Number(wind.results.topo.Kzt) || 1;
    return 1;
  }

  function bindAll(selector, event, handler) {
    document.querySelectorAll(selector).forEach((el) => el.addEventListener(event, () => handler(el)));
  }

  function formatNum(value, decimals) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(decimals);
  }



  function getTreeNodes(state) {
    const wind = getWindModule(state);
    return [{
      id: 'wind-root',
      number: '4',
      type: 'section',
      label: 'Wind',
      page: { type: 'windPage' },
      children: [
        { id: 'wind-pressure', number: '4.1', type: 'wind-sheet', label: 'Pressure Sheet', page: { type: 'windPressure' } },
        { id: 'wind-overlay', number: '4.2', type: 'wind-sheet', label: 'Tributary Wind Loads to Diaphragms', page: { type: 'windOverlay' } },
        ...(wind.inputs.pressure.KztSource === 'linked' ? [{ id: 'wind-kzt', number: '4.3', type: 'wind-sheet', label: 'Kzt Calculation', page: { type: 'windKzt' } }] : [])
      ]
    }];
  }

  function getHeaderInfo(state, active) {
    if (active.type === 'windPage') return { title: 'Wind', subtitle: 'Setup, Chapter 26 inputs, geometry, and Kzt selection' };
    if (active.type === 'windPressure') return { title: 'Pressure Sheet', subtitle: 'Chapter 27 working sheet' };
    if (active.type === 'windKzt') return { title: 'Kzt Calculation', subtitle: 'Topographic helper sheet' };
    if (active.type === 'windOverlay') return { title: 'Tributary Wind Loads to Diaphragms', subtitle: 'Two fixed elevation directions, tracing, and diaphragm loads' };
    return null;
  }

  function canRenderPage(activeType) {
    return ['windPage', 'windPressure', 'windKzt', 'windOverlay'].includes(activeType);
  }

  function renderPage(state, active, handlers) {
    if (active.type === 'windPage') return { html: renderWindSetupPage(state), bind() { bindWindSetupEvents(handlers); } };
    if (active.type === 'windPressure') return { html: renderWindPressurePage(state), bind() { bindWindPressureEvents(handlers); } };
    if (active.type === 'windKzt') return { html: renderWindKztPage(state), bind() { bindWindKztEvents(handlers); } };
    if (active.type === 'windOverlay') return { html: renderWindOverlayPage(state), bind() { bindWindOverlayEvents(handlers); } };
    return null;
  }

  const api = { getTreeNodes, getHeaderInfo, canRenderPage, renderPage };
  window.StructuralCalcWindUI = api;
  if (window.StructuralCalcModules) window.StructuralCalcModules.register('wind-ui', api);
})();
