(function () {
  const { createDefaultState, buildSavePayload, normalizeImportedProject } = window.StructuralCalcModules.require('state');
  const { renderLayout } = window.StructuralCalcModules.require('ui');
  const { safeFileName } = window.StructuralCalcModules.require('common');
  const controllers = [
    window.StructuralCalcModules.require('beam-controller'),
    window.StructuralCalcModules.require('wind-controller')
  ];

  let state = createDefaultState();

  function getState() {
    return state;
  }

  function render() {
    renderLayout(state, handlers);
  }

  const perControllerHandlers = controllers.map((controller) => (controller.createHandlers ? controller.createHandlers({ getState, render }) : {}));
  const controllerHandlers = mergeControllerHandlers(perControllerHandlers);

  const handlers = Object.assign({
    toggleSidebar() {
      state.ui.sidebarCollapsed = !state.ui.sidebarCollapsed;
      render();
    },
    selectPage(page) {
      state.ui.activePage = page;
      render();
    },
    toggleTreeNode(nodeId) {
      state.ui.treeExpanded[nodeId] = !state.ui.treeExpanded[nodeId];
      render();
    },
    renameNodePrompt(nodeType, nodeId) {
      if (typeof controllerHandlers.renameNodePrompt === 'function') {
        controllerHandlers.renameNodePrompt(nodeType, nodeId);
      }
    },
    updateProjectField(field, value) {
      state.project[field] = value;
      controllers.forEach((controller) => controller.onProjectFieldChange && controller.onProjectFieldChange(state, field));
      render();
    },
    saveProject() {
      const payload = JSON.stringify(buildSavePayload(state), null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeFileName(state.project.jobNumber || state.project.name || 'project')}_structural_calc_app.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    openProject(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          state = normalizeImportedProject(JSON.parse(String(reader.result || '{}')));
          controllers.forEach((controller) => controller.initialize && controller.initialize(state));
          render();
        } catch (error) {
          alert('Could not open project file.');
        }
      };
      reader.readAsText(file);
    }
  }, controllerHandlers);

  function mergeControllerHandlers(handlerSets) {
    const merged = {};
    for (const set of handlerSets) {
      for (const [key, fn] of Object.entries(set)) {
        if (key === 'renameNodePrompt') continue;
        merged[key] = fn;
      }
    }
    merged.renameNodePrompt = function (nodeType, nodeId) {
      for (const set of handlerSets) {
        if (typeof set.renameNodePrompt === 'function' && set.renameNodePrompt(nodeType, nodeId) === true) return true;
      }
      return false;
    };
    return merged;
  }

  controllers.forEach((controller) => controller.initialize && controller.initialize(state));
  render();
})();
