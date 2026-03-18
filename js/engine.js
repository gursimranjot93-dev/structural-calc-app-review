(function () {
  const COMPONENT_KEYS = ['D', 'L', 'Lr', 'S', 'W', 'E'];
  const FT3_TO_IN3 = 1728;

  function analyzeBeam(member, comboSet) {
    const combos = comboSet && Array.isArray(comboSet.combos) ? comboSet.combos : [];
    if (!combos.length) return emptyAnalysis(member);

    const comboResults = combos.map((combo) => analyzeForCombo(member, combo));
    const governing = {
      reactionAbs: maxByAbs(comboResults, (r) => Math.max(Math.abs(r.reactions.R1), Math.abs(r.reactions.R2))),
      shearAbs: maxByAbs(comboResults, (r) => Math.max(Math.abs(r.summary.Vmax.value), Math.abs(r.summary.Vmin.value))),
      momentAbs: maxByAbs(comboResults, (r) => Math.max(Math.abs(r.summary.Mmax.value), Math.abs(r.summary.Mmin.value))),
      deflectionAbs: maxByAbs(comboResults, (r) => Math.max(Math.abs(r.summary.EIDeltaMaxIn3.value), Math.abs(r.summary.EIDeltaMinIn3.value))),
      shearDeflectionAbs: maxByAbs(comboResults, (r) => Math.max(Math.abs(r.summary.KsDeltaMaxIn.value), Math.abs(r.summary.KsDeltaMinIn.value)))
    };

    return {
      basis: comboSet.name,
      comboResults,
      governing,
      displayed: governing.momentAbs
    };
  }

  function getDisplayedResult(analysis, comboId) {
    if (!analysis) return null;
    if (!comboId || comboId === 'governing') return analysis.displayed;
    return analysis.comboResults.find((result) => result.combo.id === comboId) || analysis.displayed;
  }

  function analyzeForCombo(member, combo) {
    const L = clampPositive(member.geometry.L || 0.001);
    const a = clamp(member.geometry.xR1, 0, L);
    const b = clamp(member.geometry.xR2, 0, L);
    const stations = buildStations(member, L);
    const distributed = stations.map((x) => distributedIntensityAt(member.loads, combo.factors, x, L));
    const pointLoads = buildPointLoads(member.loads, combo.factors, L);
    const resultants = buildLoadResultants(member.loads, combo.factors, L);
    const reactions = solveReactions(resultants, a, b);

    const V = [];
    const M = [];
    let runningMoment = 0;

    for (let i = 0; i < stations.length; i += 1) {
      const x = stations[i];
      let shear = 0;
      if (x >= a) shear += reactions.R1;
      if (x >= b) shear += reactions.R2;
      for (const p of pointLoads) {
        if (x >= p.x) shear -= p.P;
      }
      let distLoad = 0;
      for (let j = 0; j < i; j += 1) {
        const wAvg = 0.5 * (distributed[j] + distributed[j + 1]);
        distLoad += wAvg * (stations[j + 1] - stations[j]);
      }
      shear -= distLoad;
      V.push(shear);

      if (i > 0) {
        const dx = stations[i] - stations[i - 1];
        runningMoment += 0.5 * (V[i - 1] + V[i]) * dx;
      }
      M.push(runningMoment);
    }

    const EIft3 = integrateDeflection(stations, M, a, b);
    const EIin3 = EIft3.map((value) => value * FT3_TO_IN3);
    const KsDeltaFt = M.slice();
    const KsDeltaIn = M.map((value) => value * 12);
    const summary = summarize(stations, V, M, EIft3, EIin3, KsDeltaFt, KsDeltaIn, reactions, member.geometry);

    return {
      combo,
      stations,
      distributed,
      pointLoads,
      reactions,
      V,
      M,
      EIft3,
      EIin3,
      KsDeltaFt,
      KsDeltaIn,
      summary,
      loadsUsed: resultants
    };
  }

  function buildStations(member, L) {
    const base = new Set();
    const N = 401;
    for (let i = 0; i < N; i += 1) base.add(Number((L * i / (N - 1)).toFixed(6)));
    base.add(0);
    base.add(L);
    base.add(clamp(member.geometry.xR1, 0, L));
    base.add(clamp(member.geometry.xR2, 0, L));
    for (const load of member.loads || []) {
      if (load.type === 'point') {
        base.add(clamp(load.x, 0, L));
        base.add(clamp(load.x + L / 1000, 0, L));
      }
      if (load.type === 'fullUniform') {
        base.add(0);
        base.add(L);
      }
      if (load.type === 'incTrap' || load.type === 'decTrap') {
        base.add(clamp(load.x1, 0, L));
        base.add(clamp(load.x2, 0, L));
      }
    }
    return Array.from(base).sort((m, n) => m - n);
  }

  function trapEdgeMagnitudes(load, factors) {
    if (load.type === 'incTrap') {
      return {
        wStart: weighted(load.componentsStart, factors),
        wEnd: weighted(load.componentsEnd, factors)
      };
    }
    if (load.type === 'decTrap') {
      return {
        wStart: weighted(load.componentsStart, factors),
        wEnd: weighted(load.componentsEnd, factors)
      };
    }
    const uniform = weighted(load.components, factors);
    return { wStart: uniform, wEnd: uniform };
  }

  function distributedIntensityAt(loads, factors, x, L) {
    let w = 0;
    for (const load of loads || []) {
      if (load.type === 'fullUniform') {
        const mag = weighted(load.components, factors);
        if (mag && x >= 0 && x <= L) w += mag;
      }
      if (load.type === 'incTrap' || load.type === 'decTrap') {
        const x1 = Math.min(load.x1, load.x2);
        const x2 = Math.max(load.x1, load.x2);
        if (x >= x1 && x <= x2 && x2 > x1) {
          const { wStart, wEnd } = trapEdgeMagnitudes(load, factors);
          const t = (x - x1) / (x2 - x1);
          w += wStart + (wEnd - wStart) * t;
        }
      }
    }
    return w;
  }

  function buildPointLoads(loads, factors, L) {
    return (loads || [])
      .filter((load) => load.type === 'point')
      .map((load) => ({ x: clamp(load.x, 0, L), P: weighted(load.components, factors), id: load.id }))
      .filter((item) => Math.abs(item.P) > 1e-9)
      .sort((a, b) => a.x - b.x);
  }

  function buildLoadResultants(loads, factors, L) {
    const resultants = [];
    for (const load of loads || []) {
      const mag = weighted(load.components, factors);
      if (load.type === 'point') {
        if (Math.abs(mag) < 1e-9) continue;
        resultants.push({ id: load.id, type: 'point', W: mag, x: clamp(load.x, 0, L) });
      } else if (load.type === 'fullUniform') {
        if (Math.abs(mag) < 1e-9) continue;
        resultants.push({ id: load.id, type: 'fullUniform', W: mag * L, x: L / 2 });
      } else if (load.type === 'incTrap' || load.type === 'decTrap') {
        const x1 = Math.min(load.x1, load.x2);
        const x2 = Math.max(load.x1, load.x2);
        const len = Math.max(0, x2 - x1);
        const { wStart, wEnd } = trapEdgeMagnitudes(load, factors);
        const W = 0.5 * (wStart + wEnd) * len;
        if (Math.abs(W) > 1e-9 && len > 0) {
          const denom = 3 * (wStart + wEnd);
          const xBar = Math.abs(denom) > 1e-9 ? len * (wStart + 2 * wEnd) / denom : len / 2;
          resultants.push({ id: load.id, type: load.type, W, x: x1 + xBar });
        }
      }
    }
    return resultants;
  }

  function solveReactions(resultants, a, b) {
    const span = Math.max(1e-6, b - a);
    const totalW = resultants.reduce((sum, load) => sum + load.W, 0);
    const momentAboutA = resultants.reduce((sum, load) => sum + load.W * (load.x - a), 0);
    const R2 = momentAboutA / span;
    const R1 = totalW - R2;
    return { R1, R2 };
  }

  function integrateDeflection(x, M, a, b) {
    const thetaRaw = [0];
    for (let i = 1; i < x.length; i += 1) {
      const dx = x[i] - x[i - 1];
      thetaRaw.push(thetaRaw[i - 1] + 0.5 * (M[i - 1] + M[i]) * dx);
    }
    const yRaw = [0];
    for (let i = 1; i < x.length; i += 1) {
      const dx = x[i] - x[i - 1];
      yRaw.push(yRaw[i - 1] + 0.5 * (thetaRaw[i - 1] + thetaRaw[i]) * dx);
    }
    const ya = interpAt(x, yRaw, a);
    const yb = interpAt(x, yRaw, b);
    const C1 = (ya - yb) / Math.max(1e-6, b - a);
    const C2 = -ya - C1 * a;
    return x.map((xi, i) => yRaw[i] + C1 * xi + C2);
  }

  function summarize(stations, V, M, EIft3, EIin3, KsDeltaFt, KsDeltaIn, reactions, geometry) {
    const Vmax = extrema(stations, V, 'max');
    const Vmin = extrema(stations, V, 'min');
    const Mmax = extrema(stations, M, 'max');
    const Mmin = extrema(stations, M, 'min');
    const EIDeltaMaxFt3 = extrema(stations, EIft3, 'max');
    const EIDeltaMinFt3 = extrema(stations, EIft3, 'min');
    const EIDeltaMaxIn3 = extrema(stations, EIin3, 'max');
    const EIDeltaMinIn3 = extrema(stations, EIin3, 'min');
    const KsDeltaMaxFt = extrema(stations, KsDeltaFt, 'max');
    const KsDeltaMinFt = extrema(stations, KsDeltaFt, 'min');
    const KsDeltaMaxIn = extrema(stations, KsDeltaIn, 'max');
    const KsDeltaMinIn = extrema(stations, KsDeltaIn, 'min');

    const a = clamp(geometry.xR1, 0, geometry.L || 0);
    const b = clamp(geometry.xR2, 0, geometry.L || 0);
    const midBandIndices = stations
      .map((x, i) => ({ x, i }))
      .filter((item) => item.x >= Math.min(a, b) && item.x <= Math.max(a, b));

    let midMax = { value: 0, x: a };
    let midMin = { value: 0, x: a };
    if (midBandIndices.length) {
      const subsetStations = midBandIndices.map((item) => item.x);
      const subsetValues = midBandIndices.map((item) => EIin3[item.i]);
      midMax = extrema(subsetStations, subsetValues, 'max');
      midMin = extrema(subsetStations, subsetValues, 'min');
    }

    return {
      Vmax,
      Vmin,
      Mmax,
      Mmin,
      EIDeltaMaxFt3,
      EIDeltaMinFt3,
      EIDeltaMaxIn3,
      EIDeltaMinIn3,
      KsDeltaMaxFt,
      KsDeltaMinFt,
      KsDeltaMaxIn,
      KsDeltaMinIn,
      leftOverhang: {
        value: Math.abs(a) > 1e-9 ? interpAt(stations, EIin3, 0) : 0,
        length: a
      },
      rightOverhang: {
        value: Math.abs((geometry.L || 0) - b) > 1e-9 ? interpAt(stations, EIin3, geometry.L || 0) : 0,
        length: Math.max(0, (geometry.L || 0) - b)
      },
      shearLeftOverhang: {
        value: Math.abs(a) > 1e-9 ? interpAt(stations, KsDeltaIn, 0) : 0,
        length: a
      },
      shearRightOverhang: {
        value: Math.abs((geometry.L || 0) - b) > 1e-9 ? interpAt(stations, KsDeltaIn, geometry.L || 0) : 0,
        length: Math.max(0, (geometry.L || 0) - b)
      },
      midspan: {
        max: midMax,
        min: midMin,
        length: Math.max(0, b - a)
      },
      reactions
    };
  }

  function extrema(stations, values, mode) {
    let bestIndex = 0;
    for (let i = 1; i < values.length; i += 1) {
      if (mode === 'max' && values[i] > values[bestIndex]) bestIndex = i;
      if (mode === 'min' && values[i] < values[bestIndex]) bestIndex = i;
    }
    return { value: values[bestIndex], x: stations[bestIndex] };
  }

  function weighted(components, factors) {
    return COMPONENT_KEYS.reduce((sum, key) => sum + (Number((components || {})[key]) || 0) * (Number((factors || {})[key]) || 0), 0);
  }

  function maxByAbs(items, selector) {
    let best = items[0];
    let bestValue = Math.abs(selector(best));
    for (let i = 1; i < items.length; i += 1) {
      const value = Math.abs(selector(items[i]));
      if (value > bestValue) {
        best = items[i];
        bestValue = value;
      }
    }
    return best;
  }

  function interpAt(x, y, target) {
    if (target <= x[0]) return y[0];
    if (target >= x[x.length - 1]) return y[y.length - 1];
    for (let i = 1; i < x.length; i += 1) {
      if (target <= x[i]) {
        const t = (target - x[i - 1]) / (x[i] - x[i - 1]);
        return y[i - 1] + t * (y[i] - y[i - 1]);
      }
    }
    return y[y.length - 1];
  }

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, Number(value) || 0));
  }

  function clampPositive(value) {
    return Math.max(1e-6, Number(value) || 0);
  }

  function emptyAnalysis(member) {
    return {
      basis: member.comboSet,
      comboResults: [],
      governing: null,
      displayed: null
    };
  }

  function formatNum(value, digits) {
    const n = Number(value) || 0;
    const fixed = n.toFixed(digits == null ? 2 : digits);
    return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function formatStation(value) {
    return `${formatNum(value, 2)} ft`;
  }

  window.StructuralCalcEngine = {
    analyzeBeam,
    getDisplayedResult,
    formatNum,
    formatStation,
    componentKeys: COMPONENT_KEYS,
    ft3ToIn3: FT3_TO_IN3
  };

  if (window.StructuralCalcModules) window.StructuralCalcModules.register('engine', window.StructuralCalcEngine);
})();
