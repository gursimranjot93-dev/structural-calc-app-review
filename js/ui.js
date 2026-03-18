(function () {
  const beamUI = window.StructuralCalcModules.require('beam-ui');
  const windUI = window.StructuralCalcModules.require('wind-ui');
  const { escapeHtml, escapeAttr, pageEquals, renderSheetPage } = window.StructuralCalcModules.require('common');
  const modules = [beamUI, windUI];

  function renderLayout(state, handlers) {
    document.body.classList.toggle('sidebar-is-collapsed', !!state.ui.sidebarCollapsed);
    renderHeader(state);
    renderTree(state, handlers);
    renderBody(state, handlers);
    bindGlobalControls(handlers);
    if (beamUI && typeof beamUI.syncExternalActionRails === 'function') {
      if (!window.__structCalcRailResizeBound) {
        window.addEventListener('resize', beamUI.syncExternalActionRails);
        window.__structCalcRailResizeBound = true;
      }
      window.requestAnimationFrame(beamUI.syncExternalActionRails);
    }
  }

  function renderHeader(state) {
    const header = document.getElementById('workspaceHeader');
    const active = state.ui.activePage;
    let info = null;
    for (const mod of modules) {
      if (mod && typeof mod.getHeaderInfo === 'function') {
        info = mod.getHeaderInfo(state, active);
        if (info) break;
      }
    }
    if (!info) {
      if (active.type === 'project') {
        info = {
          title: state.project.name || 'Project',
          subtitle: state.project.jobNumber ? `Job ${escapeHtml(state.project.jobNumber)}` : 'Project information'
        };
      } else {
        info = { title: active.title || 'Section', subtitle: 'Reserved future module slot' };
      }
    }
    header.innerHTML = `<div class="header-title">${info.title}</div><div class="header-subtitle">${info.subtitle}</div>`;
  }

  function renderTree(state, handlers) {
    const toc = document.getElementById('toc');
    const active = state.ui.activePage;
    const nodes = [
      { id: 'project-root', number: '1', type: 'page', label: 'Project', page: { type: 'project' } },
      ...modules.flatMap((mod) => (mod && typeof mod.getTreeNodes === 'function' ? mod.getTreeNodes(state) : [])),
      { id: 'lateral-root', number: '5', type: 'page', label: 'Reserved - Lateral', page: { type: 'placeholder', title: 'Reserved - Lateral' } },
      { id: 'foundation-root', number: '6', type: 'page', label: 'Reserved - Foundation', page: { type: 'placeholder', title: 'Reserved - Foundation' } }
    ];

    toc.innerHTML = nodes.map((node) => renderTreeNode(node, state, active)).join('');

    toc.querySelectorAll('[data-node-page]').forEach((el) => {
      el.addEventListener('click', () => handlers.selectPage(JSON.parse(el.dataset.nodePage)));
      el.addEventListener('dblclick', (evt) => {
        const nodeType = el.dataset.renameType;
        const nodeId = el.dataset.renameId;
        if (!nodeType || !nodeId) return;
        evt.stopPropagation();
        handlers.renameNodePrompt(nodeType, nodeId);
      });
    });

    toc.querySelectorAll('[data-node-toggle]').forEach((el) => {
      el.addEventListener('click', (evt) => {
        evt.stopPropagation();
        handlers.toggleTreeNode(el.dataset.nodeToggle);
      });
    });
  }

  function renderTreeNode(node, state, active) {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const expanded = hasChildren ? !!state.ui.treeExpanded[node.id] : false;
    const isActive = node.page && pageEquals(node.page, active);
    const renameMeta = renameMetaForNode(node);

    return `
      <div class="tree-item ${hasChildren ? 'has-children' : ''}">
        <div class="tree-row ${isActive ? 'active' : ''}" ${node.page ? `data-node-page='${escapeAttr(JSON.stringify(node.page))}'` : ''} ${renameMeta}>
          <span class="tree-caret" ${hasChildren ? `data-node-toggle="${node.id}"` : ''}>${hasChildren ? (expanded ? '▾' : '▸') : ''}</span>
          <span class="node-number">${escapeHtml(node.number)}</span>
          <span class="node-name">${escapeHtml(node.label)}</span>
        </div>
        ${hasChildren ? `<div class="tree-children ${expanded ? '' : 'hidden'}">${node.children.map((child) => renderTreeNode(child, state, active)).join('')}</div>` : ''}
      </div>
    `;
  }

  function renameMetaForNode(node) {
    if (node.type === 'level') return `data-rename-type="level" data-rename-id="${escapeAttr(node.id)}"`;
    if (node.type === 'member') return `data-rename-type="member" data-rename-id="${escapeAttr(node.id)}"`;
    if (node.type === 'wind') return `data-rename-type="wind" data-rename-id="${escapeAttr(node.id)}"`;
    return '';
  }

  function renderBody(state, handlers) {
    const body = document.getElementById('workspaceBody');
    const active = state.ui.activePage;

    if (active.type === 'project') {
      body.innerHTML = renderProjectPage(state);
      bindProjectPageEvents(handlers);
      return;
    }

    for (const mod of modules) {
      if (mod && typeof mod.canRenderPage === 'function' && mod.canRenderPage(active.type)) {
        const page = mod.renderPage(state, active, handlers);
        body.innerHTML = page && page.html ? page.html : renderPlaceholderPage(active.title || 'Section');
        if (page && typeof page.bind === 'function') page.bind();
        return;
      }
    }

    body.innerHTML = renderPlaceholderPage(active.title || 'Section');
  }

  function bindGlobalControls(handlers) {
    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    const saveBtn = document.getElementById('saveProjectBtn');
    const openBtn = document.getElementById('openProjectBtn');
    const openInput = document.getElementById('openProjectInput');
    if (toggleSidebarBtn) toggleSidebarBtn.onclick = () => handlers.toggleSidebar();
    if (saveBtn) saveBtn.onclick = () => handlers.saveProject();
    if (openBtn) openBtn.onclick = () => openInput && openInput.click();
    if (openInput) openInput.onchange = (evt) => handlers.openProject(evt.target.files && evt.target.files[0]);
  }

  function renderProjectPage(state) {
    return renderSheetPage({
      title: 'Project',
      note: 'Project-wide identity and job site information used by the module sheets.',
      body: `
        <div class="form-grid-3 compact-form-grid">
          <div class="label">Project Name</div>
          <input class="input yellow-input" data-project-field="name" value="${escapeAttr(state.project.name)}" />
          <div class="unit"></div>

          <div class="label">Job Number</div>
          <input class="input yellow-input" data-project-field="jobNumber" value="${escapeAttr(state.project.jobNumber)}" />
          <div class="unit"></div>

          <div class="label">Default Design Basis</div>
          <select class="select yellow-input" data-project-field="application">
            ${['ASD', 'LRFD'].map((key) => `<option value="${key}" ${state.project.application === key ? 'selected' : ''}>${key}</option>`).join('')}
          </select>
          <div class="unit"></div>

          <div class="label">Job Site Address</div>
          <input class="input yellow-input" data-project-field="jobSiteAddress" value="${escapeAttr(state.project.jobSiteAddress || '')}" />
          <div class="unit"></div>
        </div>
      `
    });
  }

  function bindProjectPageEvents(handlers) {
    document.querySelectorAll('[data-project-field]').forEach((el) => {
      const eventName = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(eventName, () => handlers.updateProjectField(el.dataset.projectField, el.value));
    });
  }

  function renderPlaceholderPage(title) {
    return renderSheetPage({ title, note: 'Reserved section.' });
  }


  const api = { renderLayout };
  window.StructuralCalcUI = api;
  if (window.StructuralCalcModules) window.StructuralCalcModules.register('ui', api);
})();
