(function () {
  const { analyzeBeam } = window.StructuralCalcModules.require('engine');
  const beamState = window.StructuralCalcModules.require('beam-state');

  function initialize(state) {
    runAllMemberAnalyses(state);
  }

  function onProjectFieldChange(state, field) {
    if (field === 'application') runAllMemberAnalyses(state);
  }

  function runAllMemberAnalyses(state) {
    for (const level of state.structure.gravityLevels) {
      for (const member of level.members) {
        const comboSet = state.comboSets[member.comboSet] || state.comboSets[state.project.application] || Object.values(state.comboSets)[0];
        member.analysis = analyzeBeam(member, comboSet);
        member.displayComboId = member.displayComboId || 'governing';
      }
    }
  }

  function rerunMember(state, member) {
    if (!member) return;
    const comboSet = state.comboSets[member.comboSet] || state.comboSets[state.project.application] || Object.values(state.comboSets)[0];
    member.analysis = analyzeBeam(member, comboSet);
    member.displayComboId = member.displayComboId || 'governing';
  }

  function ensureGeometryConsistency(member) {
    if (!member) return;
    const L = Math.max(0, Number(member.geometry.L) || 0);
    member.geometry.L = L;
    member.geometry.xR1 = clamp(member.geometry.xR1, 0, L);
    member.geometry.xR2 = clamp(member.geometry.xR2, 0, L);
    if (member.geometry.xR2 < member.geometry.xR1) {
      const temp = member.geometry.xR1;
      member.geometry.xR1 = member.geometry.xR2;
      member.geometry.xR2 = temp;
    }
    for (const load of member.loads) normalizeLoadForType(load, member.geometry.L);
  }

  function normalizeLoadForType(load, L) {
    const span = Math.max(0, Number(L) || 0);
    const normalized = beamState.normalizeLoadShapeData(load);
    Object.assign(load, normalized);

    if (load.type === 'point') {
      load.x = clamp(load.x, 0, span);
      load.componentsStart = cloneComponentMap(load.components);
      load.componentsEnd = cloneComponentMap(load.components);
    } else if (load.type === 'fullUniform') {
      load.x = 0;
      load.x1 = 0;
      load.x2 = span;
      load.componentsStart = cloneComponentMap(load.components);
      load.componentsEnd = cloneComponentMap(load.components);
    } else {
      load.x = 0;
      load.x1 = clamp(load.x1, 0, span);
      load.x2 = clamp(load.x2, 0, span);
      if (load.x2 < load.x1) {
        const temp = load.x1;
        load.x1 = load.x2;
        load.x2 = temp;
      }
      if (load.type === 'incTrap') {
        load.componentsStart = cloneComponentMap(load.componentsStart || beamState.defaultComponents());
        load.componentsEnd = cloneComponentMap(load.componentsEnd || load.components || beamState.defaultComponents());
        load.components = cloneComponentMap(load.componentsEnd);
      } else if (load.type === 'decTrap') {
        load.componentsStart = cloneComponentMap(load.componentsStart || load.components || beamState.defaultComponents());
        load.componentsEnd = cloneComponentMap(load.componentsEnd || beamState.defaultComponents());
        load.components = cloneComponentMap(load.componentsStart);
      }
    }

    if (!load.loadId) load.loadId = beamState.defaultLoadLabel(load.type);
  }

  function cloneComponentMap(source) {
    const base = beamState.defaultComponents();
    for (const key of Object.keys(base)) base[key] = Number(source && source[key]) || 0;
    return base;
  }

  function moveItem(array, fromIndex, direction) {
    const toIndex = fromIndex + direction;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= array.length) return false;
    const temp = array[fromIndex];
    array[fromIndex] = array[toIndex];
    array[toIndex] = temp;
    return true;
  }

  function createHandlers(ctx) {
    const { getState, render } = ctx;
    return {
      renameNodePrompt(nodeType, nodeId) {
        const state = getState();
        if (nodeType === 'level') {
          const level = beamState.findLevel(state, nodeId);
          if (!level) return false;
          const next = window.prompt('Rename level', level.name || '');
          if (next != null && next.trim()) level.name = next.trim();
          render();
          return true;
        }
        if (nodeType === 'member') {
          const member = beamState.findMember(state, nodeId);
          if (!member) return false;
          const next = window.prompt('Rename member', member.name || '');
          if (next != null && next.trim()) member.name = next.trim();
          render();
          return true;
        }
        return false;
      },
      updateComboFactor(setName, comboId, key, value) {
        const state = getState();
        const set = state.comboSets[setName];
        if (!set) return;
        const combo = (set.combos || []).find((item) => item.id === comboId);
        if (!combo) return;
        combo.factors[key] = Number(value) || 0;
        runAllMemberAnalyses(state);
        render();
      },
      addLevel() {
        const state = getState();
        const level = beamState.createBlankLevel(state.structure.gravityLevels.length);
        state.structure.gravityLevels.push(level);
        state.ui.treeExpanded['gravity-root'] = true;
        state.ui.activePage = { type: 'gravityPage' };
        render();
      },
      deleteLevel(levelId) {
        const state = getState();
        const idx = state.structure.gravityLevels.findIndex((lvl) => lvl.id === levelId);
        if (idx < 0) return;
        state.structure.gravityLevels.splice(idx, 1);
        if (state.ui.activePage.type === 'levelPage' && state.ui.activePage.id === levelId) state.ui.activePage = { type: 'gravityPage' };
        if (['member', 'beamOverview', 'beamAnalysis', 'beamDesign'].includes(state.ui.activePage.type)) {
          const stillExists = !!beamState.findMember(state, state.ui.activePage.id);
          if (!stillExists) state.ui.activePage = { type: 'gravityPage' };
        }
        render();
      },
      renameLevel(levelId, name) {
        const state = getState();
        const level = beamState.findLevel(state, levelId);
        if (!level) return;
        level.name = name || level.name;
        render();
      },
      moveLevel(levelId, direction) {
        const state = getState();
        const idx = state.structure.gravityLevels.findIndex((lvl) => lvl.id === levelId);
        if (moveItem(state.structure.gravityLevels, idx, direction)) render();
      },
      addMember(levelId) {
        const state = getState();
        let level = levelId ? beamState.findLevel(state, levelId) : null;
        if (!level) {
          if (!state.structure.gravityLevels.length) {
            this.addLevel();
            level = getState().structure.gravityLevels[0];
          } else {
            level = state.structure.gravityLevels[0];
          }
        }
        const levelIndex = state.structure.gravityLevels.findIndex((item) => item.id === level.id);
        const member = beamState.createBlankMember(levelIndex, level.members.length, state.project.application);
        ensureGeometryConsistency(member);
        level.members.push(member);
        state.ui.treeExpanded['gravity-root'] = true;
        state.ui.treeExpanded[level.id] = true;
        rerunMember(state, member);
        state.ui.treeExpanded[member.id] = true;
        state.ui.activePage = { type: 'beamAnalysis', id: member.id };
        render();
      },
      deleteMember(memberId) {
        const state = getState();
        const level = beamState.findMemberLevel(state, memberId);
        if (!level) return;
        const idx = level.members.findIndex((member) => member.id === memberId);
        if (idx < 0) return;
        level.members.splice(idx, 1);
        if (['member', 'beamOverview', 'beamAnalysis', 'beamDesign'].includes(state.ui.activePage.type) && state.ui.activePage.id === memberId) state.ui.activePage = { type: 'levelPage', id: level.id };
        render();
      },
      renameMember(memberId, name) {
        const state = getState();
        const member = beamState.findMember(state, memberId);
        if (!member) return;
        member.name = name || member.name;
        render();
      },
      moveMember(memberId, direction) {
        const state = getState();
        const level = beamState.findMemberLevel(state, memberId);
        if (!level) return;
        const idx = level.members.findIndex((member) => member.id === memberId);
        if (moveItem(level.members, idx, direction)) render();
      },
      updateGeometry(memberId, field, value) {
        const state = getState();
        const member = beamState.findMember(state, memberId);
        if (!member) return;
        member.geometry[field] = Number(value) || 0;
        ensureGeometryConsistency(member);
        rerunMember(state, member);
        render();
      },
      updateMemberComboSet(memberId, comboSetName) {
        const state = getState();
        const member = beamState.findMember(state, memberId);
        if (!member) return;
        member.comboSet = comboSetName;
        member.displayComboId = 'governing';
        rerunMember(state, member);
        render();
      },
      updateDisplayCombo(memberId, comboId) {
        const state = getState();
        const member = beamState.findMember(state, memberId);
        if (!member) return;
        member.displayComboId = comboId;
        render();
      },
      updateDesignField(memberId, field, value) {
        const state = getState();
        const member = beamState.findMember(state, memberId);
        if (!member) return;
        member.design = member.design || beamState.createDefaultWoodDesign();
        member.design[field] = value;
        render();
      },
      addLoad(memberId) {
        const state = getState();
        const member = beamState.findMember(state, memberId);
        if (!member) return;
        const load = beamState.createBlankLoad('point');
        load.x = (Number(member.geometry.L) || 0) / 2;
        member.loads.push(load);
        ensureGeometryConsistency(member);
        rerunMember(state, member);
        render();
      },
      updateLoadType(memberId, loadId, nextType) {
        const state = getState();
        const member = beamState.findMember(state, memberId);
        if (!member) return;
        const load = member.loads.find((item) => item.id === loadId);
        if (!load) return;
        const previousType = load.type;
        const previousLabel = beamState.defaultLoadLabel(previousType);
        const span = Number(member.geometry.L) || 0;

        load.type = nextType;
        if (nextType === 'point') {
          load.x = load.x || span / 2;
          load.components = cloneComponentMap(load.componentsEnd || load.components || beamState.defaultComponents());
        } else if (nextType === 'fullUniform') {
          load.x1 = 0;
          load.x2 = span;
          load.components = cloneComponentMap(load.componentsEnd || load.components || beamState.defaultComponents());
        } else {
          if (load.x1 === 0 && load.x2 === 0) {
            load.x1 = 0;
            load.x2 = span;
          }
          if (nextType === 'incTrap') {
            if (previousType === 'decTrap') {
              load.componentsEnd = cloneComponentMap(load.componentsStart || load.components || beamState.defaultComponents());
              load.componentsStart = beamState.defaultComponents();
            } else {
              load.componentsStart = cloneComponentMap(load.componentsStart || beamState.defaultComponents());
              load.componentsEnd = cloneComponentMap(load.componentsEnd || load.components || beamState.defaultComponents());
            }
            load.components = cloneComponentMap(load.componentsEnd);
          } else if (nextType === 'decTrap') {
            if (previousType === 'incTrap') {
              load.componentsStart = cloneComponentMap(load.componentsEnd || load.components || beamState.defaultComponents());
              load.componentsEnd = beamState.defaultComponents();
            } else {
              load.componentsStart = cloneComponentMap(load.componentsStart || load.components || beamState.defaultComponents());
              load.componentsEnd = cloneComponentMap(load.componentsEnd || beamState.defaultComponents());
            }
            load.components = cloneComponentMap(load.componentsStart);
          }
        }
        if (!load.loadId || load.loadId === previousLabel) load.loadId = beamState.defaultLoadLabel(nextType);
        normalizeLoadForType(load, member.geometry.L);
        rerunMember(state, member);
        render();
      },
      updateLoadField(memberId, loadId, field, value) {
        const state = getState();
        const member = beamState.findMember(state, memberId);
        if (!member) return;
        const load = member.loads.find((item) => item.id === loadId);
        if (!load) return;
        load[field] = field === 'loadId' ? value : Number(value) || 0;
        normalizeLoadForType(load, member.geometry.L);
        rerunMember(state, member);
        render();
      },
      updateLoadComponent(memberId, loadId, key, value) {
        const state = getState();
        const member = beamState.findMember(state, memberId);
        if (!member) return;
        const load = member.loads.find((item) => item.id === loadId);
        if (!load) return;
        load.components[key] = Number(value) || 0;
        if (load.type === 'point' || load.type === 'fullUniform') {
          load.componentsStart = cloneComponentMap(load.components);
          load.componentsEnd = cloneComponentMap(load.components);
        }
        rerunMember(state, member);
        render();
      },
      updateLoadEdgeComponent(memberId, loadId, edge, key, value) {
        const state = getState();
        const member = beamState.findMember(state, memberId);
        if (!member) return;
        const load = member.loads.find((item) => item.id === loadId);
        if (!load) return;
        const target = edge === 'start' ? 'componentsStart' : 'componentsEnd';
        load[target] = cloneComponentMap(load[target]);
        load[target][key] = Number(value) || 0;
        if (load.type === 'incTrap') load.components = cloneComponentMap(load.componentsEnd);
        if (load.type === 'decTrap') load.components = cloneComponentMap(load.componentsStart);
        rerunMember(state, member);
        render();
      },
      removeLoad(memberId, loadId) {
        const state = getState();
        const member = beamState.findMember(state, memberId);
        if (!member) return;
        member.loads = member.loads.filter((item) => item.id !== loadId);
        rerunMember(state, member);
        render();
      },
      moveLoad(memberId, loadId, direction) {
        const state = getState();
        const member = beamState.findMember(state, memberId);
        if (!member) return;
        const idx = member.loads.findIndex((item) => item.id === loadId);
        if (moveItem(member.loads, idx, direction)) {
          rerunMember(state, member);
          render();
        }
      }
    };
  }

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, Number(value) || 0));
  }

  const api = { initialize, onProjectFieldChange, createHandlers };
  if (window.StructuralCalcModules) window.StructuralCalcModules.register('beam-controller', api);
})();
