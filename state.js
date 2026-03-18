(function () {
  const beamState = window.StructuralCalcModules.require('beam-state');
  const windState = window.StructuralCalcModules.require('wind-state');

  function cloneDeep(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createDefaultState() {
    return {
      project: {
        name: '',
        jobNumber: '',
        application: 'ASD',
        jobSiteAddress: ''
      },
      comboSets: beamState.createDefaultComboSets(),
      structure: {
        gravityLevels: [],
        wind: windState.createDefaultWindModule()
      },
      ui: {
        activePage: { type: 'project' },
        sidebarCollapsed: false,
        treeExpanded: {
          'gravity-root': false,
          'wind-root': true,
          'lateral-root': false,
          'foundation-root': false
        }
      }
    };
  }

  function buildSavePayload(state) {
    const beamPayload = beamState.buildPayload(state);
    const windPayload = windState.buildPayload(state);
    return {
      fileType: 'structural-calc-project',
      project: {
        name: state.project.name || '',
        jobNumber: state.project.jobNumber || '',
        application: state.project.application || 'ASD',
        jobSiteAddress: state.project.jobSiteAddress || ''
      },
      comboSets: cloneDeep(beamPayload.comboSets || state.comboSets || {}),
      structure: {
        gravityLevels: cloneDeep((beamPayload.structure && beamPayload.structure.gravityLevels) || []),
        wind: cloneDeep((windPayload.structure && windPayload.structure.wind) || state.structure.wind || null)
      }
    };
  }

  function normalizeImportedProject(raw) {
    const base = createDefaultState();
    if (!raw || typeof raw !== 'object') return base;

    const project = raw.project || {};
    base.project.name = project.name || '';
    base.project.jobNumber = project.jobNumber || '';
    base.project.application = project.application || 'ASD';
    base.project.jobSiteAddress = project.jobSiteAddress || '';

    beamState.importIntoState(base, raw);
    windState.importIntoState(base, raw);
    return base;
  }

  const api = { createDefaultState, buildSavePayload, normalizeImportedProject };
  window.StructuralCalcState = api;
  if (window.StructuralCalcModules) window.StructuralCalcModules.register('state', api);
})();
