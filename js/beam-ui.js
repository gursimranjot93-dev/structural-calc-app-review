(function () {
  const { formatNum, formatStation, getDisplayedResult, componentKeys: COMPONENT_KEYS } = window.StructuralCalcEngine;
  const { activeComponentKeys, findMember, findLevel, findMemberLevel } = window.StructuralCalcBeamState;
  const { computeWoodBeamDesign } = window.StructuralCalcModules.require('beam-design-engine');
  const { escapeHtml, escapeAttr } = window.StructuralCalcModules.require('common');
  const libs = () => (window.StructuralCalcLibraries || {});


  function materialRows() {
    const rows = libs().woodMaterials;
    return Array.isArray(rows) ? rows : [];
  }

  function cfReferenceSheet() {
    const sheet = libs().woodCFReferenceSheet;
    return sheet && Array.isArray(sheet.matrix) ? sheet : { sheetName: 'Size Factors CF', matrix: [], merges: [] };
  }

  function buildMergeMaps(merges) {
    const startMap = {};
    const skipMap = {};
    (merges || []).forEach((merge) => {
      const key = `${merge.s.r}:${merge.s.c}`;
      startMap[key] = {
        rowspan: (merge.e.r - merge.s.r) + 1,
        colspan: (merge.e.c - merge.s.c) + 1
      };
      for (let r = merge.s.r; r <= merge.e.r; r += 1) {
        for (let c = merge.s.c; c <= merge.e.c; c += 1) {
          if (r === merge.s.r && c === merge.s.c) continue;
          skipMap[`${r}:${c}`] = true;
        }
      }
    });
    return { startMap, skipMap };
  }

  function renderCfReferenceSheetTable(sheet) {
    const matrix = Array.isArray(sheet.matrix) ? sheet.matrix : [];
    if (!matrix.length) {
      return '<div class="muted">CF table could not be loaded from the Excel library.</div>';
    }

    const { startMap, skipMap } = buildMergeMaps(sheet.merges || []);
    const rows = matrix.map((row, rIdx) => {
      const cells = [];
      (row || []).forEach((value, cIdx) => {
        const key = `${rIdx}:${cIdx}`;
        if (skipMap[key]) return;
        const merge = startMap[key];
        const tag = rIdx <= 6 ? 'th' : 'td';
        const attrs = [];
        if (merge && merge.rowspan > 1) attrs.push(`rowspan="${merge.rowspan}"`);
        if (merge && merge.colspan > 1) attrs.push(`colspan="${merge.colspan}"`);
        const textValue = String(value == null ? '' : value);
        const numericLike = /^-?\d+(\.\d+)?$/.test(textValue.trim());
        const className = numericLike ? 'num' : '';
        cells.push(`<${tag} ${attrs.join(' ')} class="${className}">${escapeHtml(textValue).replace(/\n/g, '<br>')}</${tag}>`);
      });
      return `<tr>${cells.join('')}</tr>`;
    }).join('');

    return `<table class="summary-table compact-summary-table cf-reference-table cf-reference-sheet-table"><tbody>${rows}</tbody></table>`;
  }

  function renderCfModal(state, member, calc) {
    const modal = state.ui && state.ui.cfModal;
    if (!modal || !modal.open || modal.memberId !== member.id) return '';
    const sheet = cfReferenceSheet();
    return `
      <div class="cf-modal" data-close-cf-modal>
        <div class="cf-modal-card" onclick="event.stopPropagation()">
          <div class="page-title-row">
            <h3 style="margin:0;">CF Reference Table</h3>
            <button class="toolbar-btn" data-close-cf-modal>Close</button>
          </div>
          <div class="muted" style="margin:6px 0 10px;">Reference only. Read the table and type the chosen value manually into the CF field.</div>
          <div class="sheet-scroll-table">
            ${renderCfReferenceSheetTable(sheet)}
          </div>
        </div>
      </div>
    `;
  }

  function renderProjectPage(state) {
    return `
      <div class="page-card compact-page">
        <h2>Project</h2>
        <div class="fieldset-grid fieldset-grid-project">
          <div>
            <div class="label">Project Name</div>
            <input class="input yellow-input" data-project-name value="${escapeAttr(state.project.name)}" />
          </div>
          <div>
            <div class="label">Job Number</div>
            <input class="input yellow-input" data-project-job value="${escapeAttr(state.project.jobNumber)}" />
          </div>
          <div>
            <div class="label">Default Application</div>
            <select class="select yellow-input" data-project-application>
              ${Object.keys(state.comboSets).map((key) => `<option value="${key}" ${state.project.application === key ? 'selected' : ''}>${key}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="muted" style="margin-top: 12px;">New files start with 1 level and 1 beam so you can edit immediately.</div>
      </div>
    `;
  }

  function renderComboPage(state) {
    return `
      <div class="page-card compact-page">
        <h2>Load Combinations</h2>
        ${Object.values(state.comboSets).map((set) => `
          <div class="combo-block">
            <h3>${escapeHtml(set.name)}</h3>
            <table class="combo-table">
              <thead>
                <tr>
                  <th>Name</th>
                  ${COMPONENT_KEYS.map((key) => `<th>${key}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${(set.combos || []).map((combo) => `
                  <tr>
                    <td>${escapeHtml(combo.name)}</td>
                    ${COMPONENT_KEYS.map((key) => `<td><input class="yellow-input" data-combo-factor="${set.name}:${combo.id}:${key}" value="${formatInput(combo.factors[key])}" /></td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderGravityManager(state) {
    const levels = state.structure.gravityLevels || [];
    return `
      <div class="page-card compact-page">
        <div class="page-title-row">
          <h2>Gravity</h2>
          <button class="primary-btn blue-btn" data-add-level-page>+</button>
        </div>
        <div class="muted">Rename and reorder levels here. Double-clicking a tree item also renames it.</div>
        <div class="stacked-row-table manager-stack-table">
          <table class="manager-table manager-table-data-only">
            <thead>
              <tr>
                <th>No.</th>
                <th>Level Name</th>
                <th>Members</th>
              </tr>
            </thead>
            <tbody>
              ${levels.length ? levels.map((level, index) => `
                <tr data-sync-key="level:${level.id}">
                  <td>${`3.${index + 1}`}</td>
                  <td><input class="yellow-input" data-level-name="${level.id}" value="${escapeAttr(level.name)}" /></td>
                  <td>${(level.members || []).length}</td>
                </tr>
                <tr class="action-strip-row">
                  <td colspan="3">
                    <div class="row-action-strip compact-row-strip">
                      <button class="danger-btn tiny-icon-btn" data-delete-level="${level.id}" title="Delete">×</button>
                      <button class="blue-btn tiny-icon-btn" data-level-up="${level.id}" ${index === 0 ? 'disabled' : ''} title="Move up">↑</button>
                      <button class="blue-btn tiny-icon-btn" data-level-down="${level.id}" ${index === levels.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
                    </div>
                  </td>
                </tr>
              `).join('') : `<tr><td colspan="3" class="muted">No levels yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderLevelManager(state, level) {
    if (!level) return renderPlaceholderPage('Level');
    const members = level.members || [];
    return `
      <div class="page-card compact-page">
        <div class="page-title-row">
          <h2>${escapeHtml(level.name)}</h2>
          <button class="primary-btn blue-btn" data-level-add-member="${level.id}">+</button>
        </div>
        <div class="muted">Rename and reorder members in this level here.</div>
        <div class="stacked-row-table manager-stack-table">
          <table class="manager-table manager-table-data-only">
            <thead>
              <tr>
                <th>No.</th>
                <th>Beam Name</th>
              </tr>
            </thead>
            <tbody>
              ${members.length ? members.map((member, index) => `
                <tr data-sync-key="member:${member.id}">
                  <td>${getMemberNumbering(state, level.id, member.id)}</td>
                  <td><input class="yellow-input" data-member-name="${member.id}" value="${escapeAttr(member.name)}" /></td>
                </tr>
                <tr class="action-strip-row">
                  <td colspan="2">
                    <div class="row-action-strip compact-row-strip">
                      <button class="danger-btn tiny-icon-btn" data-delete-member="${member.id}" title="Delete">×</button>
                      <button class="blue-btn tiny-icon-btn" data-member-up="${member.id}" ${index === 0 ? 'disabled' : ''} title="Move up">↑</button>
                      <button class="blue-btn tiny-icon-btn" data-member-down="${member.id}" ${index === members.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
                    </div>
                  </td>
                </tr>
              `).join('') : `<tr><td colspan="2" class="muted">No members yet in this level.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderBeamSheet(state, member) {
    const analysis = member.analysis;
    const displayed = getDisplayedResult(analysis, member.displayComboId || 'governing');
    const comboSet = state.comboSets[member.comboSet];
    const memberLevel = findMemberLevel(state, member.id);
    const numbering = getMemberNumbering(state, memberLevel && memberLevel.id, member.id);
    const visibleKeys = activeComponentKeys(comboSet);

    const comboOptions = [
      `<option value="governing" ${(member.displayComboId || 'governing') === 'governing' ? 'selected' : ''}>Governing from ${escapeHtml(member.comboSet)}</option>`,
      ...((analysis && analysis.comboResults) || []).map((result) => `<option value="${result.combo.id}" ${member.displayComboId === result.combo.id ? 'selected' : ''}>${escapeHtml(result.combo.name)}</option>`)
    ].join('');

    return `
      <div class="sheet">
        <div class="sheet-frame">
          <div class="sheet-header">
            <div class="title-left">Beam Analysis</div>
            <div class="beam-id">${escapeHtml(numbering)} - ${escapeHtml(member.name)}</div>
          </div>

          <div class="top-band desktop-lock">
            <div class="box">
              <div class="box-title">Beam Geometry</div>
              <div class="box-body">
                <div class="form-grid-3">
                  <div class="label">L</div>
                  <input class="input yellow-input" data-geom="L" value="${formatInput(member.geometry.L)}" />
                  <div class="unit">ft</div>

                  <div class="label">x_R1</div>
                  <input class="input yellow-input" data-geom="xR1" value="${formatInput(member.geometry.xR1)}" />
                  <div class="unit">ft</div>

                  <div class="label">x_R2</div>
                  <input class="input yellow-input" data-geom="xR2" value="${formatInput(member.geometry.xR2)}" />
                  <div class="unit">ft</div>
                </div>

                <div class="note-row stacked-fields">
                  <div class="inline-field full-width-field">
                    <div class="label">Application</div>
                    <select class="select yellow-input" data-combo-set>
                      ${Object.keys(state.comboSets).map((key) => `<option value="${key}" ${member.comboSet === key ? 'selected' : ''}>${key}</option>`).join('')}
                    </select>
                  </div>
                  <div class="inline-field full-width-field">
                    <div class="label">Display</div>
                    <select class="select yellow-input" data-display-combo>
                      ${comboOptions}
                    </select>
                    <div class="combo-inline-note">Current analysis load combination: <strong>${escapeHtml(displayed && displayed.combo ? displayed.combo.name : `Governing from ${member.comboSet}`)}</strong></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="box diagram-shell">
              <div class="box-title">Loading Diagram</div>
              <div class="diagram-area svg-wrap">${renderLoadingDiagram(member)}</div>
              <div class="diagram-note">Downward loads are entered as positive. Upward loads are entered as negative.</div>
            </div>
          </div>

          <div class="mid-band desktop-lock">
            <div class="box">
              <div class="box-title">Loads on Beam</div>
              <div class="box-body">
                <div class="load-toolbar load-toolbar-top">
                  <div class="small-note">Reorder loads here for a cleaner table. The diagram shows the combined loading only. Trapezoidal rows use top = start intensity and bottom = end intensity.</div>
                </div>
                <div class="stacked-row-table load-stack-table">
                  <table class="load-table load-table-data-only">
                    <colgroup>
                      <col class="load-type-col" />
                      <col class="geom-col" />
                      <col class="geom-col" />
                      <col class="geom-col" />
                      ${visibleKeys.map(() => `<col class="num-col" />`).join('')}
                      <col class="comment-col" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>x</th>
                        <th>x1</th>
                        <th>x2</th>
                        ${visibleKeys.map((key) => `<th>${key}</th>`).join('')}
                        <th>Load ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${member.loads.length ? member.loads.map((load, index) => `${renderLoadRow(load, visibleKeys)}${renderLoadActionRow(load, index, member.loads.length, 5 + visibleKeys.length)}`).join('') : `<tr><td colspan="${5 + visibleKeys.length}" class="muted">No loads yet.</td></tr>`}
                    </tbody>
                  </table>
                </div>
                <div class="load-toolbar load-toolbar-bottom">
                  <button class="primary-btn blue-btn" data-add-load>Add Load</button>
                </div>
              </div>
            </div>
          </div>

          <div class="bottom-band desktop-lock result-columns">
            <div class="result-column">
              <div class="chart-card">
                <div class="chart-title">Shear V (#)</div>
                <div class="chart-area svg-wrap">${renderChart(displayed && displayed.stations, displayed && displayed.V, 'V')}</div>
              </div>
              <div class="result-table-box">
                <div class="result-table-title">Shear</div>
                ${renderShearBlock(displayed)}
              </div>
              <div class="result-table-box">
                <div class="result-table-title">Reactions</div>
                ${renderReactionsBlock(member, displayed)}
              </div>
            </div>
            <div class="result-column">
              <div class="chart-card">
                <div class="chart-title">Moment M (#·ft)</div>
                <div class="chart-area svg-wrap">${renderChart(displayed && displayed.stations, displayed && displayed.M, 'M')}</div>
              </div>
              <div class="result-table-box">
                <div class="result-table-title">Moment</div>
                ${renderMomentBlock(displayed)}
              </div>
            </div>
            <div class="result-column">
              <div class="chart-card">
                <div class="chart-title">Normalized Deflection: EIΔ + KsΔs</div>
                <div class="chart-area svg-wrap deflection-dual-chart">${renderDualAxisDeflectionChart(displayed)}</div>
                <div class="dual-axis-note">Left axis = EIΔ (#*in^3). Right axis = KsΔs (#*in).</div>
              </div>
              <div class="result-table-box">
                <div class="result-table-title">Deflection</div>
                ${renderDeflectionBlock(displayed)}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }


  function renderBeamOverview(state, member) {
    const level = findMemberLevel(state, member.id);
    const numbering = getMemberNumbering(state, level && level.id, member.id);
    return `
      <div class="page-card compact-page">
        <h2>${escapeHtml(numbering)} Beam</h2>
        <div class="muted" style="margin-bottom:12px;">Use this page as the beam container. Analysis and design live in the child sheets below.</div>
        <div class="fieldset-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));">
          <div class="box simple-nav-box">
            <div class="box-title">Beam Analysis</div>
            <div class="box-body">
              <div class="muted">Demand engine for span, loads, reactions, moments, shear, and EIΔ outputs.</div>
              <button class="primary-btn blue-btn" data-open-analysis="${member.id}" style="margin-top:10px;">Open Beam Analysis</button>
            </div>
          </div>
          <div class="box simple-nav-box">
            <div class="box-title">Beam Design</div>
            <div class="box-body">
              <div class="muted">Beam design sheet.</div>
              <button class="primary-btn blue-btn" data-open-design="${member.id}" style="margin-top:10px;">Open Beam Design</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderBeamDesignSheet(state, member) {
    const analysis = getDisplayedResult(member.analysis, member.displayComboId || 'governing');
    const design = member.design || {};
    const calc = computeWoodBeamDesign(member, analysis, design, libs());
    const level = findMemberLevel(state, member.id);
    const numbering = getMemberNumbering(state, level && level.id, member.id);
    const materials = (calc.materials && calc.materials.length ? calc.materials : materialRows());
    const cdRows = calc.cdRows || [];
    const deflectionRows = calc.deflectionRows || [];
    const fmtOr = (value, digits, fallback = 'undefined') => Number.isFinite(Number(value)) ? formatNum(Number(value), digits) : fallback;
    const ratioText = (numeratorIn, deltaValue) => {
      const dVal = Math.abs(Number(deltaValue));
      if (!Number.isFinite(dVal) || dVal <= 1e-9 || !Number.isFinite(Number(numeratorIn)) || Number(numeratorIn) <= 0) return 'undefined';
      return `L/${formatNum(Number(numeratorIn) / dVal, 0)}`;
    };
    const memberSummary = `M+ ${formatNum(calc.Mpos, 1)} #·ft | M− ${formatNum(calc.Mneg, 1)} #·ft | V ${formatNum(calc.Vmax, 1)} # | fb+ ${formatNum(calc.fbPos, 0)} psi | fb− ${formatNum(calc.fbNeg, 0)} psi | fv ${formatNum(calc.fv, 0)} psi`;
    const warning = member.comboSet !== 'ASD' ? `<div class="warning-banner">Beam Design is currently using the wood ASD-style check structure from your spreadsheet. Review carefully when the beam application is ${escapeHtml(member.comboSet)}.</div>` : '';

    return `
      <div class="sheet">
        <div class="sheet-frame wood-design-frame beam-design-exact">
          <div class="sheet-header">
            <div class="title-left">Beam Design</div>
            <div class="beam-id">${escapeHtml(numbering)} - ${escapeHtml(member.name)}</div>
          </div>

          ${warning}

          <div class="top-band desktop-lock">
            <div class="box wood-entry-box">
              <div class="box-title">Inputs</div>
              <div class="box-body">
                <table class="summary-table compact-summary-table design-entry-table"><tbody>
                  <tr><th>Species</th><td colspan="2"><select class="select yellow-input" data-design-field="materialId">${materials.length ? materials.map((item) => `<option value="${item.id}" ${design.materialId === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('') : '<option value=>No materials loaded</option>'}</select></td></tr>
                  <tr><th>b</th><td><input class="input yellow-input" data-design-field="b" value="${formatInput(calc.inputs.b)}" /></td><td>in</td></tr>
                  <tr><th>d</th><td><input class="input yellow-input" data-design-field="d" value="${formatInput(calc.inputs.d)}" /></td><td>in</td></tr>
                  <tr><th>l<sub>u</sub></th><td><input class="input yellow-input" data-design-field="lu" value="${formatInput(calc.inputs.lu)}" /></td><td>ft</td></tr>
                  <tr><th>l<sub>b</sub> at Support 1</th><td><input class="input yellow-input" data-design-field="bearing1" value="${formatInput(calc.inputs.bearing1)}" /></td><td>in</td></tr>
                  <tr><th>l<sub>b</sub> at Support 2</th><td><input class="input yellow-input" data-design-field="bearing2" value="${formatInput(calc.inputs.bearing2)}" /></td><td>in</td></tr>
                </tbody></table>
              </div>
            </div>

            <div class="box wood-factors-box">
              <div class="box-title">Adjustment Factors</div>
              <div class="box-body">
                <table class="summary-table compact-summary-table"><tbody>
                  <tr>
                    <th>CD</th><td><select class="select yellow-input" data-design-field="cdLabel">${cdRows.map((row) => `<option value="${escapeAttr(row.label)}" ${design.cdLabel === row.label ? 'selected' : ''}>${escapeHtml(row.label)}</option>`).join('')}</select></td>
                  </tr>
                  <tr>
                    <th>CF</th><td><div class="inline-ref-field"><input class="input yellow-input" data-design-field="cf" value="${formatInput(calc.cf)}" /><button class="toolbar-btn" type="button" data-open-cf-modal>Table</button></div></td>
                  </tr>
                  <tr>
                    <th>Cfu</th><td><input class="input yellow-input" data-design-field="cfu" value="${formatInput(calc.cfu)}" /></td>
                  </tr>
                  <tr>
                    <th>Ci</th><td><select class="select yellow-input" data-design-field="incised"><option ${design.incised === 'Yes' ? 'selected' : ''}>Yes</option><option ${design.incised !== 'Yes' ? 'selected' : ''}>No</option></select></td>
                  </tr>
                  <tr>
                    <th>Cr</th><td><select class="select yellow-input" data-design-field="repetitive"><option ${design.repetitive === 'Yes' ? 'selected' : ''}>Yes</option><option ${design.repetitive !== 'Yes' ? 'selected' : ''}>No</option></select></td>
                  </tr>
                </tbody></table>
              </div>
            </div>
          </div>

          <div class="mid-band">
            <div class="box demand-box">
              <div class="box-title">Demand vs Capacity</div>
              <div class="box-body">
                <table class="summary-table compact-summary-table"><thead>
                  <tr><th>Check</th><th>Demand</th><th>Units</th><th>Ratio</th></tr>
                </thead><tbody>
                  <tr><th>fb+, positive bending</th><td class="num">${formatNum(calc.fbPos, 2)}</td><td>psi</td><td class="status-cell ${calc.fbPrimePos > 0 && calc.fbPos / calc.fbPrimePos <= 1 ? 'status-pass' : 'status-fail'}">${calc.fbPrimePos > 0 ? formatNum(calc.fbPos / calc.fbPrimePos, 3) : '—'}</td></tr>
                  <tr><th>fb−, negative bending</th><td class="num">${formatNum(calc.fbNeg, 2)}</td><td>psi</td><td class="status-cell ${calc.fbPrimeNeg > 0 && calc.fbNeg / calc.fbPrimeNeg <= 1 ? 'status-pass' : 'status-fail'}">${calc.fbPrimeNeg > 0 ? formatNum(calc.fbNeg / calc.fbPrimeNeg, 3) : '—'}</td></tr>
                  <tr><th>fv</th><td class="num">${formatNum(calc.fv, 2)}</td><td>psi</td><td class="status-cell ${calc.fvPrime > 0 && calc.fv / calc.fvPrime <= 1 ? 'status-pass' : 'status-fail'}">${calc.fvPrime > 0 ? formatNum(calc.fv / calc.fvPrime, 3) : '—'}</td></tr>
                  <tr><th>fc⊥, Support 1</th><td class="num">${formatNum(calc.fc1, 2)}</td><td>psi</td><td class="status-cell ${calc.fcPerpPrime > 0 && calc.fc1 / calc.fcPerpPrime <= 1 ? 'status-pass' : 'status-fail'}">${calc.fcPerpPrime > 0 ? formatNum(calc.fc1 / calc.fcPerpPrime, 3) : '—'}</td></tr>
                  <tr><th>fc⊥, Support 2</th><td class="num">${formatNum(calc.fc2, 2)}</td><td>psi</td><td class="status-cell ${calc.fcPerpPrime > 0 && calc.fc2 / calc.fcPerpPrime <= 1 ? 'status-pass' : 'status-fail'}">${calc.fcPerpPrime > 0 ? formatNum(calc.fc2 / calc.fcPerpPrime, 3) : '—'}</td></tr>
                </tbody></table>
              </div>
            </div>

            <div class="box property-box">
              <div class="box-title">Reference / Adjusted Values</div>
              <div class="box-body">
                <table class="summary-table compact-summary-table"><tbody>
                  <tr><th>A</th><td class="num">${formatNum(calc.area, 3)}</td><td>in²</td></tr>
                  <tr><th>Sx</th><td class="num">${formatNum(calc.sx, 3)}</td><td>in³</td></tr>
                  <tr><th>Ix</th><td class="num">${formatNum(calc.ix, 3)}</td><td>in⁴</td></tr>
                  <tr><th>Fb′ +</th><td class="num">${formatNum(calc.fbPrimePos, 1)}</td><td>psi</td></tr>
                  <tr><th>Fb′ −</th><td class="num">${formatNum(calc.fbPrimeNeg, 1)}</td><td>psi</td></tr>
                  <tr><th>Fv′</th><td class="num">${formatNum(calc.fvPrime, 1)}</td><td>psi</td></tr>
                  <tr><th>Fc⊥′</th><td class="num">${formatNum(calc.fcPerpPrime, 1)}</td><td>psi</td></tr>
                  <tr><th>E′</th><td class="num">${formatNum(calc.ePrime, 0)}</td><td>psi</td></tr>
                  <tr><th>CL +</th><td class="num">${formatNum(calc.clPos, 3)}</td><td></td></tr>
                  <tr><th>CL −</th><td class="num">${formatNum(calc.clNeg, 3)}</td><td></td></tr>
                  <tr><th>CV</th><td class="num">${formatNum(calc.cv, 3)}</td><td></td></tr>
                </tbody></table>
              </div>
            </div>
          </div>

          <div class="box deflection-box">
            <div class="box-title">Deflection Check</div>
            <div class="box-body">
              <div class="deflection-toolbar compact-deflection-toolbar">
                <select class="select yellow-input deflection-limit-select" data-design-field="deflectionLabel">${deflectionRows.map((row) => `<option value="${escapeAttr(row.label)}" ${design.deflectionLabel === row.label ? 'selected' : ''}>${escapeHtml(row.label)}</option>`).join('')}</select>
                <div class="deflection-ratio-line">L/Δ <span class="num">${formatNum(calc.ratio, 0)}</span></div>
              </div>
              <table class="summary-table compact-summary-table deflection-check-table"><thead>
                <tr>
                  <th>Region</th>
                  <th>Δ (in)</th>
                  <th>Δ Ratio</th>
                  <th>Allowable Ratio</th>
                  <th>Δ all (in)</th>
                  <th>% Used</th>
                </tr>
              </thead><tbody>
                <tr>
                  <td>Left Cantilever Bending</td>
                  <td class="num">${fmtOr(calc.leftDelta, 4)}</td>
                  <td>${ratioText(2 * calc.leftCantileverLengthFt * 12, calc.leftDelta)}</td>
                  <td>2L/${formatNum(calc.ratio, 0)}</td>
                  <td class="num">${fmtOr(calc.allowableLeft, 4)}</td>
                  <td class="status-cell ${Number.isFinite(calc.leftRatio) && calc.leftRatio <= 1 ? 'status-pass' : 'status-fail'}">${Number.isFinite(calc.leftRatio) ? `${formatNum(calc.leftRatio * 100, 0)}%` : 'undefined'}</td>
                </tr>
                <tr>
                  <td>Right Cantilever Bending</td>
                  <td class="num">${fmtOr(calc.rightDelta, 4)}</td>
                  <td>${ratioText(2 * calc.rightCantileverLengthFt * 12, calc.rightDelta)}</td>
                  <td>2L/${formatNum(calc.ratio, 0)}</td>
                  <td class="num">${fmtOr(calc.allowableRight, 4)}</td>
                  <td class="status-cell ${Number.isFinite(calc.rightRatio) && calc.rightRatio <= 1 ? 'status-pass' : 'status-fail'}">${Number.isFinite(calc.rightRatio) ? `${formatNum(calc.rightRatio * 100, 0)}%` : 'undefined'}</td>
                </tr>
                <tr>
                  <td>Mid Span Max Bending</td>
                  <td class="num">${fmtOr(calc.midDeltaMax, 4)}</td>
                  <td>${ratioText(calc.midSpanLengthFt * 12, calc.midDeltaMax)}</td>
                  <td>L/${formatNum(calc.ratio, 0)}</td>
                  <td class="num">${fmtOr(calc.allowableMid, 4)}</td>
                  <td class="status-cell ${Number.isFinite(calc.midMaxRatio) && calc.midMaxRatio <= 1 ? 'status-pass' : 'status-fail'}">${Number.isFinite(calc.midMaxRatio) ? `${formatNum(calc.midMaxRatio * 100, 0)}%` : 'undefined'}</td>
                </tr>
                <tr>
                  <td>Mid Span Min Bending</td>
                  <td class="num">${fmtOr(calc.midDeltaMin, 4)}</td>
                  <td>${ratioText(calc.midSpanLengthFt * 12, calc.midDeltaMin)}</td>
                  <td>L/${formatNum(calc.ratio, 0)}</td>
                  <td class="num">${fmtOr(calc.allowableMid, 4)}</td>
                  <td class="status-cell ${Number.isFinite(calc.midMinRatio) && calc.midMinRatio <= 1 ? 'status-pass' : 'status-fail'}">${Number.isFinite(calc.midMinRatio) ? `${formatNum(calc.midMinRatio * 100, 0)}%` : 'undefined'}</td>
                </tr>
                              <tr>
                  <td>Left Cantilever Shear</td>
                  <td class="num">${fmtOr(calc.leftShearDelta, 4)}</td>
                  <td>${ratioText(2 * calc.leftCantileverLengthFt * 12, calc.leftShearDelta)}</td>
                  <td>2L/${formatNum(calc.ratio, 0)}</td>
                  <td class="num">${fmtOr(calc.allowableLeft, 4)}</td>
                  <td>${Number.isFinite(calc.leftDelta) && Number.isFinite(calc.leftShearDelta) ? `${formatNum((calc.leftShearDelta / Math.max(1e-9, calc.leftTotalDelta)) * 100, 0)}% of total` : 'undefined'}</td>
                </tr>
                <tr>
                  <td>Left Cantilever Total</td>
                  <td class="num">${fmtOr(calc.leftTotalDelta, 4)}</td>
                  <td>${ratioText(2 * calc.leftCantileverLengthFt * 12, calc.leftTotalDelta)}</td>
                  <td>2L/${formatNum(calc.ratio, 0)}</td>
                  <td class="num">${fmtOr(calc.allowableLeft, 4)}</td>
                  <td class="status-cell ${Number.isFinite(calc.leftTotalDelta) && Number.isFinite(calc.allowableLeft) && calc.allowableLeft > 0 && calc.leftTotalDelta / calc.allowableLeft <= 1 ? 'status-pass' : 'status-fail'}">${Number.isFinite(calc.leftTotalDelta) && Number.isFinite(calc.allowableLeft) && calc.allowableLeft > 0 ? `${formatNum((calc.leftTotalDelta / calc.allowableLeft) * 100, 0)}%` : 'undefined'}</td>
                </tr>
                <tr>
                  <td>Mid Span Max Shear</td>
                  <td class="num">${fmtOr(calc.midShearDeltaMax, 4)}</td>
                  <td>${ratioText(calc.midSpanLengthFt * 12, calc.midShearDeltaMax)}</td>
                  <td>L/${formatNum(calc.ratio, 0)}</td>
                  <td class="num">${fmtOr(calc.allowableMid, 4)}</td>
                  <td>${Number.isFinite(calc.midDeltaMax) && Number.isFinite(calc.midShearDeltaMax) ? `${formatNum((calc.midShearDeltaMax / Math.max(1e-9, calc.midTotalDeltaMax)) * 100, 0)}% of total` : 'undefined'}</td>
                </tr>
                <tr>
                  <td>Mid Span Max Total</td>
                  <td class="num">${fmtOr(calc.midTotalDeltaMax, 4)}</td>
                  <td>${ratioText(calc.midSpanLengthFt * 12, calc.midTotalDeltaMax)}</td>
                  <td>L/${formatNum(calc.ratio, 0)}</td>
                  <td class="num">${fmtOr(calc.allowableMid, 4)}</td>
                  <td class="status-cell ${Number.isFinite(calc.midTotalDeltaMax) && Number.isFinite(calc.allowableMid) && calc.allowableMid > 0 && calc.midTotalDeltaMax / calc.allowableMid <= 1 ? 'status-pass' : 'status-fail'}">${Number.isFinite(calc.midTotalDeltaMax) && Number.isFinite(calc.allowableMid) && calc.allowableMid > 0 ? `${formatNum((calc.midTotalDeltaMax / calc.allowableMid) * 100, 0)}%` : 'undefined'}</td>
                </tr>
              </tbody></table>
            </div>
          </div>

          <div class="member-summary-band">${escapeHtml(memberSummary)}</div>
          ${renderCfModal(state, member, calc)}
        </div>
      </div>
    `;
  }

  function computeBeamStabilityFactor(fbStar, fbE) {
    const base = Math.max(fbStar, 1e-9);
    const a = (1 + (fbE / base)) / 1.9;
    const radicand = Math.max(0, a * a - (fbE / base) / 0.95);
    const result = a - Math.sqrt(radicand);
    if (!Number.isFinite(result) || result <= 0) return 1;
    return Math.min(1, result);
  }

  function bindBeamOverviewEvents(member, handlers) {
    bindAll('[data-open-analysis]', (el) => el.addEventListener('click', () => handlers.selectPage({ type: 'beamAnalysis', id: member.id })));
    bindAll('[data-open-design]', (el) => el.addEventListener('click', () => handlers.selectPage({ type: 'beamDesign', id: member.id })));
  }

  function bindBeamDesignSheetEvents(state, member, handlers) {
    bindAll('[data-design-field]', (el) => {
      const field = el.dataset.designField;
      const isNumeric = ['b','d','bearing1','bearing2','lu','cf','cfu'].includes(field);
      el.addEventListener('change', () => handlers.updateDesignField(member.id, field, isNumeric ? parseNum(el.value) : el.value));
    });
    bindAll('[data-open-cf-modal]', (el) => el.addEventListener('click', () => handlers.openCfModal(member.id)));
    bindAll('[data-close-cf-modal]', (el) => el.addEventListener('click', () => handlers.closeCfModal()));
  }

  function renderLoadRow(load, visibleKeys) {
    const type = load.type || 'point';
    const isPoint = type === 'point';
    const isTrap = type === 'incTrap' || type === 'decTrap';
    return `
      <tr data-load-row="${load.id}" data-sync-key="load:${load.id}">
        <td class="load-type-cell">
          <select class="yellow-input load-type-select" data-load-type="${load.id}">
            <option value="point" ${type === 'point' ? 'selected' : ''}>Point</option>
            <option value="fullUniform" ${type === 'fullUniform' ? 'selected' : ''}>Full Uniform</option>
            <option value="incTrap" ${type === 'incTrap' ? 'selected' : ''}>Inc Trap</option>
            <option value="decTrap" ${type === 'decTrap' ? 'selected' : ''}>Dec Trap</option>
          </select>
        </td>
        <td><input class="${isPoint ? 'yellow-input' : 'readonly'}" data-load-field="${load.id}:x" value="${formatInput(load.x)}" ${isPoint ? '' : 'disabled'} /></td>
        <td><input class="${isTrap ? 'yellow-input' : 'readonly'}" data-load-field="${load.id}:x1" value="${formatInput(load.x1)}" ${isTrap ? '' : 'disabled'} /></td>
        <td><input class="${isTrap ? 'yellow-input' : 'readonly'}" data-load-field="${load.id}:x2" value="${formatInput(load.x2)}" ${isTrap ? '' : 'disabled'} /></td>
        ${visibleKeys.map((key) => renderLoadComponentCell(load, key, isTrap)).join('')}
        <td><input class="yellow-input" data-load-field="${load.id}:loadId" value="${escapeAttr(load.loadId || '')}" /></td>
      </tr>
    `;
  }

  function renderLoadActionRow(load, index, total, colspan) {
    return `
      <tr class="action-strip-row" data-sync-key="load:${load.id}">
        <td colspan="${colspan}">
          <div class="row-action-strip compact-row-strip load-row-strip">
            <button class="danger-btn tiny-icon-btn" data-remove-load="${load.id}" title="Delete load">×</button>
            <button class="blue-btn tiny-icon-btn" data-move-load-up="${load.id}" ${index === 0 ? 'disabled' : ''} title="Move up">↑</button>
            <button class="blue-btn tiny-icon-btn" data-move-load-down="${load.id}" ${index === total - 1 ? 'disabled' : ''} title="Move down">↓</button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderLoadComponentCell(load, key, isTrap) {
    if (!isTrap) {
      return `<td><input class="yellow-input" data-load-component="${load.id}:${key}" value="${formatInput((load.components || {})[key])}" /></td>`;
    }
    return `
      <td>
        <div class="trap-component-stack">
          <input class="yellow-input trap-component-input" data-load-edge-component="${load.id}:start:${key}" value="${formatInput(((load.componentsStart || {})[key]))}" title="Start intensity" />
          <input class="yellow-input trap-component-input" data-load-edge-component="${load.id}:end:${key}" value="${formatInput(((load.componentsEnd || {})[key]))}" title="End intensity" />
        </div>
      </td>
    `;
  }

  function renderReactionsBlock(member, displayed) {
    if (!displayed) return `<div class="muted">Analysis values appear here after beam data is entered.</div>`;
    return `
      <table class="summary-table compact-summary-table">
        <tbody>
          <tr><th>R1 (#)</th><td class="num">${formatNum(displayed.reactions.R1, 2)}</td><td class="num">x = ${formatStation(member.geometry.xR1)}</td></tr>
          <tr><th>R2 (#)</th><td class="num">${formatNum(displayed.reactions.R2, 2)}</td><td class="num">x = ${formatStation(member.geometry.xR2)}</td></tr>
        </tbody>
      </table>
    `;
  }

  function renderShearBlock(displayed) {
    if (!displayed) return `<div class="muted">Analysis values appear here after beam data is entered.</div>`;
    const s = displayed.summary;
    return `
      <table class="summary-table compact-summary-table">
        <tbody>
          <tr><th>V, max (#)</th><td class="num">${formatNum(s.Vmax.value, 2)}</td><td class="num">${formatStation(s.Vmax.x)}</td></tr>
          <tr><th>V, min (#)</th><td class="num">${formatNum(s.Vmin.value, 2)}</td><td class="num">${formatStation(s.Vmin.x)}</td></tr>
        </tbody>
      </table>
    `;
  }

  function renderMomentBlock(displayed) {
    if (!displayed) return `<div class="muted">Analysis values appear here after beam data is entered.</div>`;
    const s = displayed.summary;
    return `
      <table class="summary-table compact-summary-table">
        <tbody>
          <tr><th>M, max (#·ft)</th><td class="num">${formatNum(s.Mmax.value, 2)}</td><td class="num">${formatStation(s.Mmax.x)}</td></tr>
          <tr><th>M, min (#·ft)</th><td class="num">${formatNum(s.Mmin.value, 2)}</td><td class="num">${formatStation(s.Mmin.x)}</td></tr>
        </tbody>
      </table>
    `;
  }


  function renderDeflectionBlock(displayed) {
    if (!displayed) return `<div class="muted">Analysis values appear here after beam data is entered.</div>`;
    const s = displayed.summary;
    return `
      <table class="summary-table compact-summary-table">
        <tbody>
          <tr><th>EIΔ, max (#*in^3)</th><td class="num">${formatNum(s.EIDeltaMaxIn3.value, 2)}</td><td class="num">${formatStation(s.EIDeltaMaxIn3.x)}</td></tr>
          <tr><th>EIΔ, min (#*in^3)</th><td class="num">${formatNum(s.EIDeltaMinIn3.value, 2)}</td><td class="num">${formatStation(s.EIDeltaMinIn3.x)}</td></tr>
          <tr><th>KsΔs, max (#*in)</th><td class="num">${formatNum(s.KsDeltaMaxIn.value, 2)}</td><td class="num">${formatStation(s.KsDeltaMaxIn.x)}</td></tr>
          <tr><th>KsΔs, min (#*in)</th><td class="num">${formatNum(s.KsDeltaMinIn.value, 2)}</td><td class="num">${formatStation(s.KsDeltaMinIn.x)}</td></tr>
          <tr><th>Left overhang EIΔ</th><td class="num">${formatNum((s.leftOverhang || {}).value, 2)}</td><td class="num">x = ${formatStation((s.leftOverhang || {}).length)}</td></tr>
          <tr><th>Left overhang KsΔs</th><td class="num">${formatNum((s.shearLeftOverhang || {}).value, 2)}</td><td class="num">x = ${formatStation((s.shearLeftOverhang || {}).length)}</td></tr>
          <tr><th>Right overhang EIΔ</th><td class="num">${formatNum((s.rightOverhang || {}).value, 2)}</td><td class="num">x = ${formatStation((s.rightOverhang || {}).length)}</td></tr>
          <tr><th>Right overhang KsΔs</th><td class="num">${formatNum((s.shearRightOverhang || {}).value, 2)}</td><td class="num">x = ${formatStation((s.shearRightOverhang || {}).length)}</td></tr>
        </tbody>
      </table>
    `;
  }

  function renderDualAxisDeflectionChart(displayed) {
    if (!displayed || !displayed.stations || !displayed.stations.length) return renderChart([], [], 'EIΔ');
    return renderDualAxisChart(displayed.stations, displayed.EIin3, displayed.KsDeltaIn, 'EIΔ', 'KsΔs');
  }

  function renderLoadingDiagram(member) {
    const L = Math.max(0.001, Number(member.geometry.L) || 0.001);
    const a = clamp(member.geometry.xR1, 0, L);
    const b = clamp(member.geometry.xR2, 0, L);
    const width = 760;
    const height = 236;
    const margin = { l: 58, r: 48, t: 16, b: 16 };
    const beamY = 132;
    const beamH = 16;
    const plotTop = 26;
    const plotBottom = beamY;
    const plotHeight = plotBottom - plotTop;
    const xScale = (x) => margin.l + (x / L) * (width - margin.l - margin.r);
    const beamStart = xScale(0);
    const beamEnd = xScale(L);
    const sampleCount = 180;
    const xs = Array.from({ length: sampleCount }, (_, i) => (L * i) / (sampleCount - 1));

    const pointMap = new Map();
    let maxPoint = 0;
    for (const load of member.loads || []) {
      const mag = signedLoadMagnitude(load);
      if (load.type === 'point' && Math.abs(mag) > 1e-9) {
        const x = clamp(load.x, 0, L);
        const key = x.toFixed(4);
        const next = (pointMap.get(key) || 0) + mag;
        pointMap.set(key, next);
        maxPoint = Math.max(maxPoint, Math.abs(next));
      }
    }

    const intensities = xs.map((x) => combinedDistributedAt(member.loads || [], x, L));
    const maxDist = intensities.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    const overallMax = Math.max(1, maxDist, maxPoint);
    const yScale = (mag) => beamY - Math.min(plotHeight, (Math.abs(mag) / overallMax) * plotHeight);

    const guideLines = Array.from({ length: 4 }, (_, i) => {
      const frac = (i + 1) / 4;
      const y = beamY - frac * plotHeight;
      const value = overallMax * frac;
      return `
        <line x1="${margin.l}" y1="${y}" x2="${width - margin.r}" y2="${y}" stroke="#ededed" stroke-width="1" />
        <text x="${width - margin.r + 6}" y="${y + 3}" font-size="9" fill="#666">${formatNum(value, 0)}</text>
      `;
    }).join('');

    let areaPath = '';
    if (xs.length) {
      areaPath = `M ${xScale(xs[0]).toFixed(2)} ${beamY}`;
      xs.forEach((x, i) => {
        areaPath += ` L ${xScale(x).toFixed(2)} ${yScale(intensities[i]).toFixed(2)}`;
      });
      areaPath += ` L ${xScale(xs[xs.length - 1]).toFixed(2)} ${beamY} Z`;
    }

    const pointShapes = Array.from(pointMap.entries()).map(([key, mag]) => {
      const x = xScale(Number(key));
      const yTop = yScale(mag);
      return `
        <line x1="${x}" y1="${yTop}" x2="${x}" y2="${beamY - 10}" stroke="#222" stroke-width="1.4" />
        <polygon points="${x - 4},${beamY - 16} ${x + 4},${beamY - 16} ${x},${beamY - 8}" fill="#222" />
      `;
    }).join('');

    const dimBase = beamY + 40;
    const dimSecond = beamY + 62;
    return `
      <svg viewBox="0 0 ${width} ${height}" aria-label="Loading diagram">
        ${guideLines}
        <line x1="${width - margin.r}" y1="${plotTop}" x2="${width - margin.r}" y2="${beamY}" stroke="#b5b5b5" stroke-width="1" />
        <text x="${width - margin.r + 8}" y="${plotTop - 6}" font-size="9" fill="#666">#</text>
        ${areaPath ? `<path d="${areaPath}" fill="#ececec" stroke="#7c7c7c" stroke-width="1.2" />` : ''}
        ${pointShapes}
        <rect x="${beamStart}" y="${beamY - beamH / 2}" width="${beamEnd - beamStart}" height="${beamH}" fill="#d2d2d2" stroke="#555" />
        ${renderPinSupport(xScale(a), beamY + beamH / 2)}
        ${renderRollerSupport(xScale(b), beamY + beamH / 2)}

        <line x1="${beamStart}" y1="${dimBase}" x2="${beamEnd}" y2="${dimBase}" stroke="#555" />
        <line x1="${beamStart}" y1="${dimBase - 8}" x2="${beamStart}" y2="${dimBase + 8}" stroke="#555" />
        <line x1="${beamEnd}" y1="${dimBase - 8}" x2="${beamEnd}" y2="${dimBase + 8}" stroke="#555" />
        <text x="${(beamStart + beamEnd) / 2}" y="${dimBase - 4}" text-anchor="middle" font-size="11">L</text>

        <line x1="${beamStart}" y1="${dimSecond}" x2="${xScale(a)}" y2="${dimSecond}" stroke="#666" />
        <line x1="${beamStart}" y1="${dimSecond - 7}" x2="${beamStart}" y2="${dimSecond + 7}" stroke="#666" />
        <line x1="${xScale(a)}" y1="${dimSecond - 7}" x2="${xScale(a)}" y2="${dimSecond + 7}" stroke="#666" />
        <text x="${(beamStart + xScale(a)) / 2}" y="${dimSecond + 16}" text-anchor="middle" font-size="10">x_R1</text>

        <line x1="${beamStart}" y1="${dimSecond + 20}" x2="${xScale(b)}" y2="${dimSecond + 20}" stroke="#666" />
        <line x1="${beamStart}" y1="${dimSecond + 13}" x2="${beamStart}" y2="${dimSecond + 27}" stroke="#666" />
        <line x1="${xScale(b)}" y1="${dimSecond + 13}" x2="${xScale(b)}" y2="${dimSecond + 27}" stroke="#666" />
        <text x="${(beamStart + xScale(b)) / 2}" y="${dimSecond + 36}" text-anchor="middle" font-size="10">x_R2</text>
      </svg>
    `;
  }

  function signedLoadMagnitude(load) {
    return COMPONENT_KEYS.reduce((sum, key) => sum + (Number((load.components || {})[key]) || 0), 0);
  }

  function signedTrapEdgeMagnitude(load, edge) {
    const source = edge === 'start' ? (load.componentsStart || {}) : (load.componentsEnd || {});
    return COMPONENT_KEYS.reduce((sum, key) => sum + (Number(source[key]) || 0), 0);
  }

  function combinedDistributedAt(loads, x, L) {
    let w = 0;
    for (const load of loads || []) {
      if (load.type === 'fullUniform') {
        const mag = signedLoadMagnitude(load);
        if (Math.abs(mag) > 1e-9 && x >= 0 && x <= L) w += mag;
      } else if (load.type === 'incTrap' || load.type === 'decTrap') {
        const x1 = Math.min(load.x1, load.x2);
        const x2 = Math.max(load.x1, load.x2);
        if (x >= x1 && x <= x2 && x2 > x1) {
          const wStart = signedTrapEdgeMagnitude(load, 'start');
          const wEnd = signedTrapEdgeMagnitude(load, 'end');
          const t = (x - x1) / (x2 - x1);
          w += wStart + (wEnd - wStart) * t;
        }
      }
    }
    return w;
  }

  function renderPinSupport(x, yTop) {
    return `
      <polygon points="${x},${yTop} ${x - 12},${yTop + 16} ${x + 12},${yTop + 16}" fill="#fff" stroke="#555" />
      <line x1="${x - 16}" y1="${yTop + 16}" x2="${x + 16}" y2="${yTop + 16}" stroke="#555" />
    `;
  }

  function renderRollerSupport(x, yTop) {
    return `
      <polygon points="${x},${yTop} ${x - 12},${yTop + 14} ${x + 12},${yTop + 14}" fill="#fff" stroke="#555" />
      <circle cx="${x - 6}" cy="${yTop + 19}" r="3.5" fill="#fff" stroke="#555" />
      <circle cx="${x + 6}" cy="${yTop + 19}" r="3.5" fill="#fff" stroke="#555" />
      <line x1="${x - 16}" y1="${yTop + 24}" x2="${x + 16}" y2="${yTop + 24}" stroke="#555" />
    `;
  }

  function renderChart(x, y, label) {
    if (!x || !x.length || !y || !y.length) {
      return `<svg viewBox="0 0 360 220"><text x="180" y="110" text-anchor="middle" fill="#777" font-size="13">No result yet</text></svg>`;
    }
    const width = 360;
    const height = 220;
    const margin = { l: 78, r: 14, t: 24, b: 30 };
    const minY = Math.min.apply(null, y.concat([0]));
    const maxY = Math.max.apply(null, y.concat([0]));
    const rangeY = Math.max(1e-9, maxY - minY);
    const minX = x[0];
    const maxX = x[x.length - 1];
    const scaleX = (v) => margin.l + ((v - minX) / Math.max(1e-9, maxX - minX)) * (width - margin.l - margin.r);
    const scaleY = (v) => margin.t + (1 - (v - minY) / rangeY) * (height - margin.t - margin.b);
    const zeroY = scaleY(0);
    const path = x.map((xi, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(xi).toFixed(2)} ${scaleY(y[i]).toFixed(2)}`).join(' ');
    const guides = Array.from({ length: 4 }, (_, i) => {
      const frac = (i + 1) / 5;
      const yg = margin.t + frac * (height - margin.t - margin.b);
      return `<line x1="${margin.l}" y1="${yg}" x2="${width - margin.r}" y2="${yg}" stroke="#efefef" stroke-width="1" />`;
    }).join('');

    const scaleInfo = compactScaleInfo(maxY, minY);
    const fmt = (v, decimals = 2) => formatScaledValue(v, scaleInfo.exponent, decimals);
    const hits = x.map((xi, i) => {
      const cx = scaleX(xi).toFixed(2);
      const cy = scaleY(y[i]).toFixed(2);
      return `<circle cx="${cx}" cy="${cy}" r="6" fill="transparent" stroke="transparent"><title>x = ${formatStation(xi)}&#10;y = ${formatNum(y[i], 2)}</title></circle>`;
    }).join('');
    const scaleNote = scaleInfo.exponent !== 0
      ? `<text x="${width - margin.r}" y="14" font-size="11" text-anchor="end" fill="#666">×10^${scaleInfo.exponent}</text>`
      : '';

    return `
      <svg viewBox="0 0 ${width} ${height}" aria-label="${escapeHtml(label)} diagram">
        ${guides}
        ${scaleNote}
        <line x1="${margin.l}" y1="${zeroY}" x2="${width - margin.r}" y2="${zeroY}" stroke="#999" stroke-width="1" />
        <line x1="${margin.l}" y1="${margin.t}" x2="${margin.l}" y2="${height - margin.b}" stroke="#666" stroke-width="1" />
        <path d="${path}" fill="none" stroke="#444" stroke-width="2" />
        ${hits}
        <text x="${margin.l}" y="${height - 8}" font-size="11">0</text>
        <text x="${width - margin.r}" y="${height - 8}" font-size="11" text-anchor="end">${formatNum(maxX, 2)} ft</text>
        <text x="${margin.l - 6}" y="${scaleY(maxY) + 4}" font-size="11" text-anchor="end">${fmt(maxY, 2)}</text>
        <text x="${margin.l - 6}" y="${scaleY(minY) + 4}" font-size="11" text-anchor="end">${fmt(minY, 2)}</text>
      </svg>
    `;
  }


  function renderDualAxisChart(x, yLeft, yRight, leftLabel, rightLabel) {
    if (!x || !x.length || !yLeft || !yLeft.length || !yRight || !yRight.length) {
      return `<svg viewBox="0 0 360 220"><text x="180" y="110" text-anchor="middle" fill="#777" font-size="13">No result yet</text></svg>`;
    }
    const width = 360;
    const height = 220;
    const margin = { l: 78, r: 56, t: 24, b: 30 };
    const minX = x[0];
    const maxX = x[x.length - 1];
    const minLeft = Math.min.apply(null, yLeft.concat([0]));
    const maxLeft = Math.max.apply(null, yLeft.concat([0]));
    const minRight = Math.min.apply(null, yRight.concat([0]));
    const maxRight = Math.max.apply(null, yRight.concat([0]));
    const rangeLeft = Math.max(1e-9, maxLeft - minLeft);
    const rangeRight = Math.max(1e-9, maxRight - minRight);
    const scaleX = (v) => margin.l + ((v - minX) / Math.max(1e-9, maxX - minX)) * (width - margin.l - margin.r);
    const scaleLeft = (v) => margin.t + (1 - (v - minLeft) / rangeLeft) * (height - margin.t - margin.b);
    const scaleRight = (v) => margin.t + (1 - (v - minRight) / rangeRight) * (height - margin.t - margin.b);
    const pathLeft = x.map((xi, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(xi).toFixed(2)} ${scaleLeft(yLeft[i]).toFixed(2)}`).join(' ');
    const pathRight = x.map((xi, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(xi).toFixed(2)} ${scaleRight(yRight[i]).toFixed(2)}`).join(' ');
    const guides = Array.from({ length: 4 }, (_, i) => {
      const frac = (i + 1) / 5;
      const yg = margin.t + frac * (height - margin.t - margin.b);
      return `<line x1="${margin.l}" y1="${yg}" x2="${width - margin.r}" y2="${yg}" stroke="#efefef" stroke-width="1" />`;
    }).join('');
    return `
      <svg viewBox="0 0 ${width} ${height}" aria-label="Dual axis deflection diagram">
        ${guides}
        <line x1="${margin.l}" y1="${margin.t}" x2="${margin.l}" y2="${height - margin.b}" stroke="#666" stroke-width="1" />
        <line x1="${width - margin.r}" y1="${margin.t}" x2="${width - margin.r}" y2="${height - margin.b}" stroke="#666" stroke-width="1" />
        <line x1="${margin.l}" y1="${height - margin.b}" x2="${width - margin.r}" y2="${height - margin.b}" stroke="#666" stroke-width="1" />
        <path d="${pathLeft}" fill="none" stroke="#444" stroke-width="2" />
        <path d="${pathRight}" fill="none" stroke="#b45f06" stroke-width="2" />
        <text x="${margin.l - 6}" y="${scaleLeft(maxLeft) + 4}" font-size="11" text-anchor="end">${formatNum(maxLeft, 2)}</text>
        <text x="${margin.l - 6}" y="${scaleLeft(minLeft) + 4}" font-size="11" text-anchor="end">${formatNum(minLeft, 2)}</text>
        <text x="${width - margin.r + 6}" y="${scaleRight(maxRight) + 4}" font-size="11">${formatNum(maxRight, 2)}</text>
        <text x="${width - margin.r + 6}" y="${scaleRight(minRight) + 4}" font-size="11">${formatNum(minRight, 2)}</text>
        <text x="${margin.l}" y="14" font-size="11" fill="#444">${escapeHtml(leftLabel)}</text>
        <text x="${width - margin.r}" y="14" font-size="11" fill="#b45f06" text-anchor="end">${escapeHtml(rightLabel)}</text>
        <text x="${margin.l}" y="${height - 8}" font-size="11">0</text>
        <text x="${width - margin.r}" y="${height - 8}" font-size="11" text-anchor="end">${formatNum(maxX, 2)} ft</text>
      </svg>
    `;
  }

  function compactScaleInfo(maxY, minY) {
    const maxAbs = Math.max(Math.abs(Number(maxY) || 0), Math.abs(Number(minY) || 0));
    if (!maxAbs) return { exponent: 0 };
    if (maxAbs >= 10000 || maxAbs < 0.01) {
      return { exponent: Math.floor(Math.log10(maxAbs)) };
    }
    return { exponent: 0 };
  }

  function formatScaledValue(value, exponent, decimals) {
    if (!Number.isFinite(Number(value))) return '';
    const scaled = exponent ? Number(value) / (10 ** exponent) : Number(value);
    return formatNum(scaled, decimals);
  }

  function renderPlaceholderPage(title) {
    return `
      <div class="page-card compact-page">
        <h2>${escapeHtml(title)}</h2>
        <div class="muted">Reserved section.</div>
      </div>
    `;
  }

  function syncExternalActionRails() {
    const railRows = new Map();
    document.querySelectorAll('.action-rail-row[data-sync-key]').forEach((el) => {
      railRows.set(el.dataset.syncKey, el);
      el.style.height = '';
    });
    document.querySelectorAll('tr[data-sync-key]').forEach((row) => {
      const rail = railRows.get(row.dataset.syncKey);
      if (!rail) return;
      rail.style.height = `${Math.ceil(row.getBoundingClientRect().height)}px`;
    });
  }

  function bindProjectPageEvents(handlers) {
    const name = document.querySelector('[data-project-name]');
    if (name) name.addEventListener('change', (evt) => handlers.updateProjectField('name', evt.target.value));
    const job = document.querySelector('[data-project-job]');
    if (job) job.addEventListener('change', (evt) => handlers.updateProjectField('jobNumber', evt.target.value));
    const app = document.querySelector('[data-project-application]');
    if (app) app.addEventListener('change', (evt) => handlers.updateProjectField('application', evt.target.value));
  }

  function bindComboPageEvents(handlers) {
    document.querySelectorAll('[data-combo-factor]').forEach((el) => {
      const [setName, comboId, key] = el.dataset.comboFactor.split(':');
      el.addEventListener('change', () => handlers.updateComboFactor(setName, comboId, key, parseNum(el.value)));
    });
  }

  function bindGravityManagerEvents(handlers) {
    bindAll('[data-level-name]', (el) => el.addEventListener('change', () => handlers.renameLevel(el.dataset.levelName, el.value)));
    bindAll('[data-level-up]', (el) => el.addEventListener('click', () => handlers.moveLevel(el.dataset.levelUp, -1)));
    bindAll('[data-level-down]', (el) => el.addEventListener('click', () => handlers.moveLevel(el.dataset.levelDown, 1)));
    bindAll('[data-open-level]', (el) => el.addEventListener('click', () => handlers.selectPage({ type: 'levelPage', id: el.dataset.openLevel })));
    bindAll('[data-add-member-level]', (el) => el.addEventListener('click', () => handlers.addMember(el.dataset.addMemberLevel)));
    bindAll('[data-delete-level]', (el) => el.addEventListener('click', () => handlers.deleteLevel(el.dataset.deleteLevel)));
    bindAll('[data-add-level-page]', (el) => el.addEventListener('click', () => handlers.addLevel()));
  }

  function bindLevelManagerEvents(level, handlers) {
    if (!level) return;
    bindAll('[data-member-name]', (el) => el.addEventListener('change', () => handlers.renameMember(el.dataset.memberName, el.value)));
    bindAll('[data-member-up]', (el) => el.addEventListener('click', () => handlers.moveMember(el.dataset.memberUp, -1)));
    bindAll('[data-member-down]', (el) => el.addEventListener('click', () => handlers.moveMember(el.dataset.memberDown, 1)));
    bindAll('[data-open-member]', (el) => el.addEventListener('click', () => handlers.selectPage({ type: 'member', id: el.dataset.openMember })));
    bindAll('[data-delete-member]', (el) => el.addEventListener('click', () => handlers.deleteMember(el.dataset.deleteMember)));
    bindAll('[data-level-add-member]', (el) => el.addEventListener('click', () => handlers.addMember(el.dataset.levelAddMember)));
  }

  function bindBeamSheetEvents(state, member, handlers) {
    bindAll('[data-geom]', (el) => el.addEventListener('change', () => handlers.updateGeometry(member.id, el.dataset.geom, parseNum(el.value))));
    const comboSet = document.querySelector('[data-combo-set]');
    if (comboSet) comboSet.addEventListener('change', (evt) => handlers.updateMemberComboSet(member.id, evt.target.value));
    const displayCombo = document.querySelector('[data-display-combo]');
    if (displayCombo) displayCombo.addEventListener('change', (evt) => handlers.updateDisplayCombo(member.id, evt.target.value));
    bindAll('[data-add-load]', (el) => el.addEventListener('click', () => handlers.addLoad(member.id)));
    bindAll('[data-load-type]', (el) => el.addEventListener('change', () => handlers.updateLoadType(member.id, el.dataset.loadType, el.value)));
    bindAll('[data-load-field]', (el) => {
      const [loadId, field] = el.dataset.loadField.split(':');
      el.addEventListener('change', () => handlers.updateLoadField(member.id, loadId, field, field === 'loadId' ? el.value : parseNum(el.value)));
    });
    bindAll('[data-load-component]', (el) => {
      const [loadId, key] = el.dataset.loadComponent.split(':');
      el.addEventListener('change', () => handlers.updateLoadComponent(member.id, loadId, key, parseNum(el.value)));
    });
    bindAll('[data-load-edge-component]', (el) => {
      const [loadId, edge, key] = el.dataset.loadEdgeComponent.split(':');
      el.addEventListener('change', () => handlers.updateLoadEdgeComponent(member.id, loadId, edge, key, parseNum(el.value)));
    });
    bindAll('[data-remove-load]', (el) => el.addEventListener('click', () => handlers.removeLoad(member.id, el.dataset.removeLoad)));
    bindAll('[data-move-load-up]', (el) => el.addEventListener('click', () => handlers.moveLoad(member.id, el.dataset.moveLoadUp, -1)));
    bindAll('[data-move-load-down]', (el) => el.addEventListener('click', () => handlers.moveLoad(member.id, el.dataset.moveLoadDown, 1)));
  }

  function bindGlobalControls(handlers) {
    bindOnce('toggleSidebarBtn', () => handlers.toggleSidebar());
    bindOnce('saveProjectBtn', () => handlers.saveProject());
    bindOnce('openProjectBtn', () => document.getElementById('openProjectInput').click());
    const openInput = document.getElementById('openProjectInput');
    if (openInput) openInput.onchange = (evt) => handlers.openProject(evt.target.files && evt.target.files[0]);
  }

  function getMemberNumbering(state, levelId, memberId) {
    const levels = state.structure.gravityLevels || [];
    const levelIndex = levels.findIndex((level) => level.id === levelId);
    if (levelIndex < 0) return '';
    const memberIndex = (levels[levelIndex].members || []).findIndex((member) => member.id === memberId);
    if (memberIndex < 0) return `3.${levelIndex + 1}`;
    return `3.${levelIndex + 1}.${memberIndex + 1}`;
  }

  function pageEquals(a, b) {
    return a && b && a.type === b.type && (a.id || '') === (b.id || '');
  }

  function bindAll(selector, binder) {
    document.querySelectorAll(selector).forEach((el) => binder(el));
  }

  function bindOnce(id, handler) {
    const el = document.getElementById(id);
    if (!el) return;
    el.onclick = handler;
  }

  function parseNum(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function formatInput(value) {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : '';
  }

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, Number(value) || 0));
  }


  function renderModuleUnavailable(title) {
    return `<div class="page-card compact-page"><h2>${escapeHtml(title)}</h2><div class="muted">This module is unavailable because it did not finish loading.</div></div>`;
  }


  function getTreeNodes(state) {
    const levels = state.structure.gravityLevels || [];
    return [
      { id: 'combo-root', number: '2', type: 'page', label: 'Load Combinations', page: { type: 'comboPage' } },
      {
        id: 'gravity-root',
        number: '3',
        type: 'section',
        label: 'Gravity',
        page: { type: 'gravityPage' },
        children: levels.map((level, levelIndex) => ({
          id: level.id,
          number: `3.${levelIndex + 1}`,
          type: 'level',
          label: level.name,
          page: { type: 'levelPage', id: level.id },
          children: (level.members || []).map((member, memberIndex) => ({
            id: member.id,
            number: `3.${levelIndex + 1}.${memberIndex + 1}`,
            type: 'member',
            label: member.name,
            page: { type: 'beamAnalysis', id: member.id },
            children: [
              { id: `beam-analysis-${member.id}`, number: `3.${levelIndex + 1}.${memberIndex + 1}.1`, type: 'page', label: 'Beam Analysis', page: { type: 'beamAnalysis', id: member.id } },
              { id: `beam-design-${member.id}`, number: `3.${levelIndex + 1}.${memberIndex + 1}.2`, type: 'page', label: 'Beam Design', page: { type: 'beamDesign', id: member.id } }
            ]
          }))
        }))
      }
    ];
  }

  function getHeaderInfo(state, active) {
    if (active.type === 'comboPage') return { title: 'Load Combinations', subtitle: 'Load combination sheet' };
    if (active.type === 'gravityPage') return { title: 'Gravity', subtitle: 'Manage levels' };
    if (active.type === 'levelPage') {
      const level = findLevel(state, active.id);
      return { title: level ? escapeHtml(level.name) : 'Level', subtitle: 'Manage members in this level' };
    }
    if (['beamAnalysis','beamDesign'].includes(active.type)) {
      const member = findMember(state, active.id);
      const level = findMemberLevel(state, active.id);
      const numbering = member ? getMemberNumbering(state, level && level.id, member.id) : '';
      const map = {
        beamAnalysis: 'Beam analysis sheet',
        beamDesign: 'Beam design sheet'
      };
      return { title: member ? `${numbering} ${escapeHtml(member.name)}` : 'Beam', subtitle: map[active.type] || 'Beam sheet' };
    }
    return null;
  }

  function canRenderPage(activeType) {
    return ['comboPage', 'gravityPage', 'levelPage', 'beamAnalysis', 'beamDesign'].includes(activeType);
  }

  function renderPage(state, active, handlers) {
    if (active.type === 'comboPage') {
      return { html: renderComboPage(state), bind() { bindComboPageEvents(handlers); } };
    }
    if (active.type === 'gravityPage') {
      return { html: renderGravityManager(state), bind() { bindGravityManagerEvents(handlers); } };
    }
    if (active.type === 'levelPage') {
      const level = findLevel(state, active.id);
      return { html: renderLevelManager(state, level), bind() { bindLevelManagerEvents(level, handlers); } };
    }
    if (active.type === 'beamAnalysis') {
      const member = findMember(state, active.id);
      return {
        html: member ? renderBeamSheet(state, member) : renderPlaceholderPage('Beam'),
        bind() { if (member) bindBeamSheetEvents(state, member, handlers); }
      };
    }
    if (active.type === 'beamDesign') {
      const member = findMember(state, active.id);
      return {
        html: member ? renderBeamDesignSheet(state, member) : renderPlaceholderPage('Beam Design'),
        bind() { if (member) bindBeamDesignSheetEvents(state, member, handlers); }
      };
    }
    return null;
  }

  const api = { getTreeNodes, getHeaderInfo, canRenderPage, renderPage, syncExternalActionRails };
  window.StructuralCalcBeamUI = api;
  if (window.StructuralCalcModules) window.StructuralCalcModules.register('beam-ui', api);
})();
