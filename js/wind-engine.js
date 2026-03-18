(function () {
  const HEIGHT_BANDS = [
    { label: '0-15', z: 15 },
    { label: '15-20', z: 20 },
    { label: '20-25', z: 25 },
    { label: '25-30', z: 30 },
    { label: '30-35', z: 35 },
    { label: '35-40', z: 40 },
    { label: '40-45', z: 45 },
    { label: '45-50', z: 50 }
  ];

  const EXPOSURE_PROPS = {
    B: { zg: 1200, alpha: 7 },
    C: { zg: 900, alpha: 9.5 },
    D: { zg: 700, alpha: 11.5 }
  };

  const TOPO_TABLE = {
    '2-D Ridge': { B: 1.3, C: 1.45, D: 1.55, gamma: 3, muUpwind: 1.5, muDownwind: 1.5 },
    '2-D Escarp': { B: 0.75, C: 0.85, D: 0.95, gamma: 2.5, muUpwind: 1.5, muDownwind: 4 },
    '3-D Hill': { B: 0.95, C: 1.05, D: 1.15, gamma: 4, muUpwind: 1.5, muDownwind: 1.5 }
  };

  function analyzeWindRecord(record) {
    const pressure = record && record.inputs && record.inputs.pressure ? record.inputs.pressure : {};
    const kztInput = record && record.inputs && record.inputs.kzt ? record.inputs.kzt : {};
    const topo = analyzeKzt(kztInput);
    const Kzt = resolveKzt(pressure, topo.Kzt);
    const dims = {
      Llong: positive(pressure.longerDimension, 40),
      Bshort: positive(pressure.shorterDimension, 30),
      h: positive(pressure.h, 21.25),
      V: positive(pressure.V, 110),
      Kd: positive(pressure.Kd, 0.85),
      G: positive(pressure.G, 0.85),
      gcpiPositive: Math.abs(Number(pressure.gcpiPositive) || 0.18),
      gcpiNegative: -Math.abs(Number(pressure.gcpiNegative) || 0.18)
    };
    const exposure = String(pressure.exposure || 'B').toUpperCase();
    const exposureProps = EXPOSURE_PROPS[exposure] || EXPOSURE_PROPS.B;
    const roof = roofCpForSlope(pressure.roofSlopeMode, Number(pressure.roofSlopeRise) || 0);
    const qh = velocityPressureAt(dims.h, exposureProps, dims.V, Kzt, dims.Kd);

    const dirShort = analyzeDirection({
      directionLabel: 'Wind normal to shorter dimension',
      L: dims.Llong,
      B: dims.Bshort,
      h: dims.h,
      G: dims.G,
      gcpiPositive: dims.gcpiPositive,
      gcpiNegative: dims.gcpiNegative,
      roof,
      qh,
      exposureProps,
      V: dims.V,
      Kzt,
      Kd: dims.Kd
    });

    const dirLong = analyzeDirection({
      directionLabel: 'Wind normal to longer dimension',
      L: dims.Bshort,
      B: dims.Llong,
      h: dims.h,
      G: dims.G,
      gcpiPositive: dims.gcpiPositive,
      gcpiNegative: dims.gcpiNegative,
      roof,
      qh,
      exposureProps,
      V: dims.V,
      Kzt,
      Kd: dims.Kd
    });

    return {
      pressure: {
        Kzt,
        qh,
        roofAngleDeg: roof.angleDeg,
        roundedRoofAngleDeg: roof.roundedDeg,
        roofCp: roof,
        exposureProps
      },
      topo,
      directions: [dirShort, dirLong],
      summary: summarizeDirections([dirShort, dirLong])
    };
  }

  function analyzeDirection(args) {
    const ratioLB = args.L / Math.max(0.001, args.B);
    const ratiohL = args.h / Math.max(0.001, args.L);
    const cpWindwardWall = 0.8;
    const cpLeewardWall = leewardWallCp(ratioLB);
    const rows = HEIGHT_BANDS.map((band) => {
      const Kz = kzAt(band.z, args.exposureProps);
      const qz = 0.00256 * Kz * args.Kzt * args.Kd * args.V * args.V;
      const pzWall = qz * cpWindwardWall * args.G;
      const leewardExt = args.qh * cpLeewardWall * args.G;
      const wall = finalWallPressureCases(pzWall, leewardExt, args.qh, args.gcpiPositive, args.gcpiNegative, 16);
      const windward = {
        external: pzWall,
        governing: pzWall,
        net06: pzWall * 0.6
      };
      const leeward = {
        external: leewardExt,
        governing: leewardExt,
        net06: leewardExt * 0.6
      };
      const roofWw1Ext = args.qh * args.roof.ww1 * args.G;
      const roofWw2Ext = args.qh * args.roof.ww2 * args.G;
      const roofLwExt = args.qh * args.roof.lw * args.G;
      const roofWw1 = netPressureCases(roofWw1Ext, args.qh, args.gcpiPositive, args.gcpiNegative, 8);
      const roofWw2 = netPressureCases(roofWw2Ext, args.qh, args.gcpiPositive, args.gcpiNegative, 8);
      const roofLw = netPressureCases(roofLwExt, args.qh, args.gcpiPositive, args.gcpiNegative, 8);
      const roofGovern = governAbs([roofWw1.net, roofWw2.net, roofLw.net]);
      const roofGovern06 = roofGovern * 0.6;
      return {
        band: band.label,
        z: band.z,
        Kz,
        qz,
        qh: args.qh,
        pzWall,
        windward,
        leeward,
        wall,
        roofWw1,
        roofWw2,
        roofLw,
        roofGovern,
        roofGovern06
      };
    });

    return {
      directionLabel: args.directionLabel,
      L: args.L,
      B: args.B,
      ratioLB,
      ratiohL,
      cp: {
        windwardWall: cpWindwardWall,
        leewardWall: cpLeewardWall,
        windwardRoof1: args.roof.ww1,
        windwardRoof2: args.roof.ww2,
        leewardRoof: args.roof.lw
      },
      rows,
      summary: {
        governingWall: governAbs(rows.map((row) => row.wall.governing)),
        governingLeewardWall: governAbs(rows.map((row) => row.leeward.governing)),
        governingRoof: governAbs(rows.map((row) => row.roofGovern))
      }
    };
  }

  function analyzeKzt(input) {
    const shape = TOPO_TABLE[input.shape] || TOPO_TABLE['2-D Ridge'];
    const exposure = String(input.exposure || 'B').toUpperCase();
    const H = Math.max(0, Number(input.H) || 0);
    const LhFeet = Math.max(0, (Number(input.LhMiles) || 0) * 5280);
    const xFeet = (Number(input.xMiles) || 0) * 5280;
    const z = Math.max(0, Number(input.z) || 0);
    const mu = String(input.sideOfHill || 'Upwind') === 'Downwind' ? shape.muDownwind : shape.muUpwind;
    const HLh = LhFeet > 0 ? H / LhFeet : 0;
    const K1 = (shape[exposure] || shape.B) * HLh;
    const K2 = LhFeet > 0 && mu ? 1 - Math.abs(xFeet / (mu * LhFeet)) : 1;
    const K3 = LhFeet > 0 ? Math.exp(-shape.gamma * z / LhFeet) : 1;
    const conditionMet = HLh >= 0.2;
    const Kzt = conditionMet ? Math.pow(1 + K1 * Math.max(0, K2) * K3, 2) : 1;
    return {
      shape: input.shape,
      exposure,
      H,
      LhFeet,
      xFeet,
      z,
      HLh,
      mu,
      gamma: shape.gamma,
      K1,
      K2,
      K3,
      Kzt,
      conditionMet,
      warning: conditionMet ? '' : 'Condition 4 of Section 26.8.1 not met. Kzt = 1.0 used.'
    };
  }

  function resolveKzt(pressure, linkedKzt) {
    const src = pressure.KztSource || 'one';
    if (src === 'linked') return positive(linkedKzt, 1);
    if (src === 'manual') return positive(pressure.KztManual, 1);
    return 1;
  }

  function roofCpForSlope(mode, rise) {
    const angleDeg = String(mode || 'slope') === 'flat' ? 0 : Math.atan((Number(rise) || 0) / 12) * 180 / Math.PI;
    const roundedDeg = Math.max(0, Math.round(angleDeg / 5) * 5);
    let ww1 = -0.9;
    let ww2 = -0.18;
    let lw = -0.5;
    if (roundedDeg > 10 && roundedDeg <= 20) {
      ww1 = -0.5;
      ww2 = -0.18;
      lw = -0.5;
    } else if (roundedDeg > 20) {
      ww1 = -0.4;
      ww2 = 0;
      lw = -0.6;
    }
    return { angleDeg, roundedDeg, ww1, ww2, lw };
  }

  function kzAt(z, exposureProps) {
    const zg = exposureProps.zg;
    const alpha = exposureProps.alpha;
    return 2.01 * Math.pow(Math.max(15, z) / zg, 2 / alpha);
  }

  function velocityPressureAt(z, exposureProps, V, Kzt, Kd) {
    return 0.00256 * kzAt(Math.max(15, z), exposureProps) * Kzt * Kd * V * V;
  }

  function leewardWallCp(ratioLB) {
    if (ratioLB <= 1) return -0.5;
    if (ratioLB <= 2) return -0.5 + 0.2 * (ratioLB - 1);
    if (ratioLB <= 4) return -0.3 + 0.05 * (ratioLB - 2);
    return -0.2;
  }

  function netPressureCases(external, qh, gcpiPositive, gcpiNegative, minAbs) {
    const casePos = external - qh * gcpiPositive;
    const caseNeg = external - qh * gcpiNegative;
    const net = Math.abs(casePos) >= Math.abs(caseNeg) ? casePos : caseNeg;
    const governing = typeof minAbs === 'number' ? applyMinimum(net, minAbs) : net;
    return {
      external,
      casePositive: casePos,
      caseNegative: caseNeg,
      net,
      net06: governing * 0.6,
      governing,
      gcpiUsed: Math.abs(casePos) >= Math.abs(caseNeg) ? gcpiPositive : gcpiNegative
    };
  }

  function finalWallPressureCases(windwardExt, leewardExt, qh, gcpiPositive, gcpiNegative, minAbs) {
    const casePos = windwardExt - leewardExt - qh * gcpiPositive;
    const caseNeg = windwardExt - leewardExt - qh * gcpiNegative;
    const net = Math.abs(casePos) >= Math.abs(caseNeg) ? casePos : caseNeg;
    const governing = typeof minAbs === 'number' ? applyMinimum(net, minAbs) : net;
    return {
      windwardExternal: windwardExt,
      leewardExternal: leewardExt,
      casePositive: casePos,
      caseNegative: caseNeg,
      net,
      net06: governing * 0.6,
      governing,
      gcpiUsed: Math.abs(casePos) >= Math.abs(caseNeg) ? gcpiPositive : gcpiNegative
    };
  }

  function applyMinimum(value, minAbs) {
    if (Math.abs(value) < minAbs) return Math.sign(value || 1) * minAbs;
    return value;
  }

  function governAbs(values) {
    return values.reduce((best, value) => Math.abs(value) > Math.abs(best) ? value : best, 0);
  }

  function summarizeDirections(directions) {
    return {
      wall: governAbs(directions.map((dir) => dir.summary.governingWall)),
      leewardWall: governAbs(directions.map((dir) => dir.summary.governingLeewardWall)),
      roof: governAbs(directions.map((dir) => dir.summary.governingRoof))
    };
  }

  function positive(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  window.StructuralCalcWindEngine = {
    analyzeWindRecord,
    analyzeKzt,
    HEIGHT_BANDS
  };

  if (window.StructuralCalcModules) window.StructuralCalcModules.register('wind-engine', window.StructuralCalcWindEngine);
})();
