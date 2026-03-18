(function () {
  function uniqueId(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
  }

  function cloneDeep(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createDefaultComboSets() {
    return {
      ASD: {
        name: 'ASD',
        combos: [
          { id: 'asd-1', name: 'D + L', factors: { D: 1.0, L: 1.0, Lr: 0, S: 0, W: 0, E: 0 } },
          { id: 'asd-2', name: 'D + S', factors: { D: 1.0, L: 0, Lr: 0, S: 1.0, W: 0, E: 0 } },
          { id: 'asd-3', name: 'D + Lr', factors: { D: 1.0, L: 0, Lr: 1.0, S: 0, W: 0, E: 0 } },
          { id: 'asd-4', name: 'D + 0.75L + 0.75S', factors: { D: 1.0, L: 0.75, Lr: 0, S: 0.75, W: 0, E: 0 } },
          { id: 'asd-5', name: '0.6D + 0.6W', factors: { D: 0.6, L: 0, Lr: 0, S: 0, W: 0.6, E: 0 } },
          { id: 'asd-6', name: '(0.6-0.14Sds)D + 0.7E', factors: { D: 0.6, L: 0, Lr: 0, S: 0, W: 0, E: 0.7 } }
        ]
      },
      LRFD: {
        name: 'LRFD',
        combos: [
          { id: 'lrfd-1', name: '1.4D', factors: { D: 1.4, L: 0, Lr: 0, S: 0, W: 0, E: 0 } },
          { id: 'lrfd-2', name: '1.2D + 1.6L + 0.5S', factors: { D: 1.2, L: 1.6, Lr: 0, S: 0.5, W: 0, E: 0 } },
          { id: 'lrfd-3', name: '1.2D + 1.6S + 0.5L', factors: { D: 1.2, L: 0.5, Lr: 0, S: 1.6, W: 0, E: 0 } },
          { id: 'lrfd-4', name: '1.2D + 1.6Lr + 0.5L', factors: { D: 1.2, L: 0.5, Lr: 1.6, S: 0, W: 0, E: 0 } },
          { id: 'lrfd-5', name: '0.9D + 1.0W', factors: { D: 0.9, L: 0, Lr: 0, S: 0, W: 1.0, E: 0 } },
          { id: 'lrfd-6', name: '0.9D + 1.0E', factors: { D: 0.9, L: 0, Lr: 0, S: 0, W: 0, E: 1.0 } }
        ]
      }
    };
  }

  function defaultComponents() {
    return { D: 0, L: 0, Lr: 0, S: 0, W: 0, E: 0 };
  }

  function defaultLoadLabel(type) {
    if (type === 'fullUniform') return 'w0';
    if (type === 'incTrap') return 'w1-w2';
    if (type === 'decTrap') return 'w3-w4';
    return 'P1';
  }

  function normalizeLoadShapeData(load) {
    const normalized = {
      id: load.id || uniqueId('load'),
      type: load.type || 'point',
      x: Number(load.x) || 0,
      x1: Number(load.x1) || 0,
      x2: Number(load.x2) || 0,
      loadId: load.loadId || load.comment || defaultLoadLabel(load.type || 'point')
    };

    const baseComponents = cloneDeep(load.components || defaultComponents());

    if (normalized.type === 'incTrap') {
      normalized.componentsStart = cloneDeep(load.componentsStart || defaultComponents());
      normalized.componentsEnd = cloneDeep(load.componentsEnd || baseComponents);
      normalized.components = cloneDeep(normalized.componentsEnd);
    } else if (normalized.type === 'decTrap') {
      normalized.componentsStart = cloneDeep(load.componentsStart || baseComponents);
      normalized.componentsEnd = cloneDeep(load.componentsEnd || defaultComponents());
      normalized.components = cloneDeep(normalized.componentsStart);
    } else {
      normalized.components = baseComponents;
      normalized.componentsStart = cloneDeep(baseComponents);
      normalized.componentsEnd = cloneDeep(baseComponents);
    }

    return normalized;
  }

  function createBlankLoad(type) {
    const loadType = type || 'point';
    return normalizeLoadShapeData({
      id: uniqueId('load'),
      type: loadType,
      x: 0,
      x1: 0,
      x2: 0,
      components: defaultComponents(),
      componentsStart: defaultComponents(),
      componentsEnd: defaultComponents(),
      loadId: defaultLoadLabel(loadType)
    });
  }

  function createDefaultWoodDesign() {
    return {
      materialId: 'hf-2-dim',
      b: 0,
      d: 0,
      bearing1: 0,
      bearing2: 0,
      lu: 0,
      cdLabel: 'Snow Load, 2 months',
      cf: 1,
      cfu: 1,
      incised: 'No',
      repetitive: 'No',
      deflectionLabel: 'Ceilings with flexible finishes (including gypsum board)'
    };
  }

  function createBlankMember(levelIndex, memberIndex, application) {
    return {
      id: uniqueId('beam'),
      type: 'beam',
      name: `Beam ${memberIndex + 1}`,
      comboSet: application || 'ASD',
      geometry: { L: 20, xR1: 0, xR2: 20 },
      loads: [],
      displayComboId: 'governing',
      analysis: null,
      design: createDefaultWoodDesign()
    };
  }

  function createBlankLevel(index) {
    return {
      id: uniqueId('lvl'),
      name: `Level ${index + 1}`,
      members: []
    };
  }

  function findLevel(projectState, levelId) {
    return projectState.structure.gravityLevels.find((lvl) => lvl.id === levelId) || null;
  }

  function findMember(projectState, memberId) {
    for (const level of projectState.structure.gravityLevels) {
      for (const member of level.members) {
        if (member.id === memberId) return member;
      }
    }
    return null;
  }

  function findMemberLevel(projectState, memberId) {
    return projectState.structure.gravityLevels.find((lvl) => lvl.members.some((m) => m.id === memberId)) || null;
  }

  function activeComponentKeys(comboSet) {
    const keys = ['D', 'L', 'Lr', 'S', 'W', 'E'];
    if (!comboSet || !Array.isArray(comboSet.combos) || !comboSet.combos.length) return keys;
    const active = keys.filter((key) => comboSet.combos.some((combo) => Math.abs(Number(combo.factors[key]) || 0) > 1e-9));
    return active.length ? active : keys;
  }

  function importIntoState(base, raw) {
    if (raw.comboSets && typeof raw.comboSets === 'object') {
      base.comboSets = cloneDeep(raw.comboSets);
    }

    const sourceLevels = raw.structure && Array.isArray(raw.structure.gravityLevels)
      ? raw.structure.gravityLevels
      : [];

    base.structure.gravityLevels = sourceLevels.map((level, levelIndex) => ({
      id: level.id || uniqueId('lvl'),
      name: level.name || `Level ${levelIndex + 1}`,
      members: Array.isArray(level.members) ? level.members.map((member, memberIndex) => ({
        id: member.id || uniqueId('beam'),
        type: 'beam',
        name: member.name || `Beam ${memberIndex + 1}`,
        comboSet: member.comboSet || base.project.application || 'ASD',
        geometry: {
          L: Number(member.geometry && member.geometry.L) || 0,
          xR1: Number(member.geometry && member.geometry.xR1) || 0,
          xR2: Number(member.geometry && member.geometry.xR2) || 0
        },
        loads: Array.isArray(member.loads) ? member.loads.map((load) => normalizeLoadShapeData(load)) : [],
        displayComboId: 'governing',
        analysis: null,
        design: cloneDeep(Object.assign(createDefaultWoodDesign(), member.design || {}))
      })) : []
    }));

    if (base.structure.gravityLevels.length) {
      base.ui.treeExpanded['gravity-root'] = true;
      const firstLevel = base.structure.gravityLevels[0];
      if (firstLevel && firstLevel.members.length) {
        base.ui.treeExpanded[firstLevel.id] = true;
        base.ui.treeExpanded[firstLevel.members[0].id] = true;
        base.ui.activePage = { type: 'beamAnalysis', id: firstLevel.members[0].id };
      }
    }
  }


  function buildPayload(state) {
    return {
      comboSets: cloneDeep(state.comboSets),
      structure: {
        gravityLevels: (state.structure.gravityLevels || []).map((level) => ({
          id: level.id,
          name: level.name,
          members: (level.members || []).map((member) => ({
            id: member.id,
            type: member.type,
            name: member.name,
            comboSet: member.comboSet,
            geometry: cloneDeep(member.geometry || {}),
            design: cloneDeep(member.design || createDefaultWoodDesign()),
            loads: cloneDeep(member.loads || [])
          }))
        }))
      }
    };
  }

  const api = {
    createDefaultComboSets,
    createBlankLoad,
    createBlankMember,
    createBlankLevel,
    findLevel,
    findMember,
    findMemberLevel,
    defaultComponents,
    normalizeLoadShapeData,
    activeComponentKeys,
    importIntoState,
    buildPayload,
    uniqueId,
    cloneDeep,
    defaultLoadLabel,
    createDefaultWoodDesign
  };

  window.StructuralCalcBeamState = api;
  if (window.StructuralCalcModules) window.StructuralCalcModules.register('beam-state', api);
})();
