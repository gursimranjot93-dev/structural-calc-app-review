(function () {
  function cloneDeep(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createOverlayPanelDefaults(title, directionKey) {
    return {
      title,
      directionKey,
      imageDataUrl: '',
      calibrationDistance: 20,
      calibrationPoints: [],
      scaleFtPerPx: null,
      mode: 'idle',
      currentTracePoints: [],
      buildingTrace: [],
      roofTrace: [],
      diaphragmMarkers: [],
      generated: null
    };
  }

  function createDefaultWindInputs() {
    return {
      record: {
        designMethod: 'ASCE 7-22 Chapter 27 MWFRS',
        commentary: 'Simplified wind workflow for enclosed buildings using a Chapter 27 style MWFRS pressure sheet with internal pressure included. Chapter 26 setup lives on this main Wind page. Pressure outputs feed the tributary diaphragm sheet.',
        chapter26Scope: 'Basic wind speed, exposure, Kd, gust factor, enclosure assumption, and Kzt source selection.',
        chapter27Scope: 'Directional pressure setup, velocity pressure rows, Cp selection, and governing net pressures.',
        sheetDescriptionPressure: 'Main Chapter 27 pressure calculation sheet.',
        sheetDescriptionOverlay: 'Tributary wind loads to diaphragms.',
        sheetDescriptionKzt: 'Optional topographic factor calculation sheet.'
      },
      pressure: {
        basisNote: 'ASCE 7 Chapter 27 enclosed-building lane with internal pressure included',
        V: 110,
        exposure: 'B',
        Kd: 0.85,
        KztSource: 'one',
        KztManual: 1.0,
        G: 0.85,
        enclosure: 'Enclosed',
        longerDimension: 40,
        shorterDimension: 30,
        roofSlopeRise: 5,
        roofSlopeMode: 'slope',
        h: 21.25,
        gcpiPositive: 0.18,
        gcpiNegative: -0.18
      },
      kzt: {
        shape: '2-D Ridge',
        H: 0,
        exposure: 'B',
        LhMiles: 0,
        xMiles: 0,
        sideOfHill: 'Upwind',
        z: 0,
        siteLat: '',
        siteLon: '',
        geocodeStatus: '',
        scanStatus: '',
        scanAxes: {},
        pointCountEachSide: 10,
        totalLineMiles: 4
      },
      overlay: {
        diaphragmElevationsText: '',
        panels: {
          long: createOverlayPanelDefaults('Wind Normal to the Longer Dimension', 'long'),
          short: createOverlayPanelDefaults('Wind Normal to the Shorter Dimension', 'short')
        }
      }
    };
  }

  function createDefaultWindModule() {
    return {
      id: 'wind-module',
      hasKztSheet: false,
      stale: true,
      lastComputedAt: null,
      inputs: createDefaultWindInputs(),
      results: null
    };
  }

  function normalizeOverlay(srcOverlay, defaultsOverlay) {
    const overlay = cloneDeep(defaultsOverlay);
    const src = srcOverlay || {};
    overlay.diaphragmElevationsText = src.diaphragmElevationsText || overlay.diaphragmElevationsText;
    overlay.panels.long = Object.assign({}, overlay.panels.long, cloneDeep((src.panels && src.panels.long) || {}));
    overlay.panels.short = Object.assign({}, overlay.panels.short, cloneDeep((src.panels && src.panels.short) || {}));
    return overlay;
  }

  function normalizeWindModule(rawWind) {
    const item = createDefaultWindModule();
    const defaults = createDefaultWindInputs();
    const src = rawWind || {};
    item.id = src.id || item.id;
    item.hasKztSheet = !!src.hasKztSheet || (((src.inputs || {}).pressure || {}).KztSource === 'linked');
    item.stale = typeof src.stale === 'boolean' ? src.stale : true;
    item.lastComputedAt = src.lastComputedAt || null;
    item.inputs = cloneDeep(defaults);
    item.inputs.record = Object.assign({}, defaults.record, cloneDeep((src.inputs && src.inputs.record) || {}));
    item.inputs.pressure = Object.assign({}, defaults.pressure, cloneDeep((src.inputs && src.inputs.pressure) || {}));
    item.inputs.kzt = Object.assign({}, defaults.kzt, cloneDeep((src.inputs && src.inputs.kzt) || {}));
    item.inputs.overlay = normalizeOverlay(src.inputs && src.inputs.overlay, defaults.overlay);
    item.results = cloneDeep(src.results || null);
    return item;
  }

  function getWindModule(projectState) {
    if (!projectState.structure.wind) projectState.structure.wind = createDefaultWindModule();
    return projectState.structure.wind;
  }

  function importIntoState(base, raw) {
    const incoming = raw.structure && raw.structure.wind ? raw.structure.wind : null;
    base.structure.wind = normalizeWindModule(incoming);
    base.ui.treeExpanded['wind-root'] = true;
  }

  function buildPayload(state) {
    const wind = cloneDeep(getWindModule(state));
    return {
      structure: {
        wind
      }
    };
  }

  const api = { createDefaultWindInputs, createDefaultWindModule, normalizeWindModule, getWindModule, importIntoState, buildPayload, createOverlayPanelDefaults };
  window.StructuralCalcWindState = api;
  if (window.StructuralCalcModules) window.StructuralCalcModules.register('wind-state', api);
})();
