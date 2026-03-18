(function () {
  function toFinite(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function computeBeamStabilityFactor(fbStar, fbE) {
    const base = Math.max(Number(fbStar) || 0, 1e-9);
    const eValue = Math.max(Number(fbE) || 0, 0);
    const a = (1 + (eValue / base)) / 1.9;
    const radicand = Math.max(0, a * a - (eValue / base) / 0.95);
    const result = a - Math.sqrt(radicand);
    if (!Number.isFinite(result) || result <= 0) return 1;
    return Math.min(1, result);
  }

  function computeWoodBeamDesign(member, analysis, design, libraries) {
    const libs = libraries || {};
    const materials = libs.woodMaterials || [];
    const cdRows = libs.woodCD || [];
    const deflectionRows = libs.woodDeflectionLimits || [];
    const material = materials.find((item) => item.id === design.materialId) || materials[0] || null;
    const family = (material && material.family) || 'unknown';
    const cdRow = cdRows.find((row) => row.label === design.cdLabel) || cdRows[0] || { label: '', value: 1 };
    const deflectionRow = deflectionRows.find((row) => row.label === design.deflectionLabel) || deflectionRows[2] || deflectionRows[0] || { ratio: 240, label: '' };

    const b = toFinite(design.b, 0);
    const d = toFinite(design.d, 0);
    const bearing1 = toFinite(design.bearing1, 0);
    const bearing2 = toFinite(design.bearing2, 0);
    const L = toFinite(member && member.geometry && member.geometry.L, 0);
    const lu = toFinite(design.lu, 0);

    const Mpos = analysis ? Math.max(0, Number(analysis.summary.Mmax.value) || 0) : 0;
    const Mneg = analysis ? Math.abs(Math.min(0, Number(analysis.summary.Mmin.value) || 0)) : 0;
    const Vmax = analysis ? Math.max(Math.abs(Number(analysis.summary.Vmax.value) || 0), Math.abs(Number(analysis.summary.Vmin.value) || 0)) : 0;
    const R1 = analysis ? Math.abs(Number(analysis.reactions.R1) || 0) : 0;
    const R2 = analysis ? Math.abs(Number(analysis.reactions.R2) || 0) : 0;

    const area = b * d;
    const sx = b * d * d / 6;
    const ix = b * d * d * d / 12;
    const lud = d ? (lu * 12 / d) : 0;
    const le = lud > 14.3 ? 1.84 * lu * 12 : (lud < 7 ? 2.06 * lu * 12 : (1.63 * lu * 12 + 3 * d));
    const rb = b ? Math.sqrt((le * d) / (b * b)) : 0;

    const cdValue = toFinite(cdRow.value, 1);
    const cf = toFinite(design.cf, 1);
    const cfu = toFinite(design.cfu, 1);
    const ciIsYes = String(design.incised || 'No').toLowerCase() === 'yes';
    const ciFlex = ciIsYes ? 0.8 : 1;
    const ciE = ciIsYes ? 0.95 : 1;
    const cr = String(design.repetitive || 'No').toLowerCase() === 'yes' ? 1.15 : 1;

    const rawFbPos = material ? Number(material.FbPos) || 0 : 0;
    const rawFbNeg = material ? Number(material.FbNeg) || 0 : 0;
    const rawFv = material ? Number(material.Fv) || 0 : 0;
    const rawFcPerp = material ? Number(material.FcPerp) || 0 : 0;
    const rawE = material ? Number(material.E) || 0 : 0;
    const rawEmin = material ? Number(material.Emin) || 0 : 0;
    // Project rule: use G = E/16 for applicable wood beam families unless a direct G value is supplied.
    const rawG = material ? Number(material.G) || 0 : 0;
    const gProject = rawG > 0 ? rawG : (rawE > 0 ? rawE / 16 : 0);
    const shearK = material && Number(material.shearK) > 0 ? Number(material.shearK) : (5 / 6);
    const kAG = shearK * area * gProject;

    const eMinPrime = rawEmin * ciE;
    const fbE = rb ? (1.2 * eMinPrime) / (rb * rb) : 0;
    const clPos = computeBeamStabilityFactor(rawFbPos, fbE);
    const clNeg = computeBeamStabilityFactor(rawFbNeg, fbE);
    const cv = family === 'glulam' && b > 0 && d > 0 && L > 0 ? Math.pow(21 / L, 0.1) * Math.pow(12 / d, 0.1) * Math.pow(5.125 / b, 0.1) : 1;

    const fbStarPos = rawFbPos * cdValue * cf * cfu * ciFlex * cr;
    const fbStarNeg = rawFbNeg * cdValue * cf * cfu * ciFlex * cr;
    const fbPrimePos = fbStarPos * clPos * cv;
    const fbPrimeNeg = fbStarNeg * clNeg * cv;
    const fvPrime = rawFv * cdValue * ciFlex;
    const fcPerpPrime = rawFcPerp * cdValue * ciFlex;
    const ePrime = rawE * ciE;

    const fbPos = sx > 0 ? (Mpos * 12) / sx : 0;
    const fbNeg = sx > 0 ? (Mneg * 12) / sx : 0;
    const fv = area > 0 ? (1.5 * Vmax) / area : 0;
    const fc1 = (b > 0 && bearing1 > 0) ? R1 / (b * bearing1) : 0;
    const fc2 = (b > 0 && bearing2 > 0) ? R2 / (b * bearing2) : 0;

    const ratio = toFinite(deflectionRow.ratio, 240);
    const leftCantileverLengthFt = analysis ? Math.max(0, Number(analysis.summary.leftOverhang.length) || 0) : 0;
    const rightCantileverLengthFt = analysis ? Math.max(0, Number(analysis.summary.rightOverhang.length) || 0) : 0;
    const midSpanLengthFt = Math.max(0, (Number(member.geometry.xR2) || 0) - (Number(member.geometry.xR1) || 0));
    const leftDelta = analysis && ePrime > 0 && ix > 0 ? Math.abs((Number(analysis.summary.leftOverhang.value) || 0) / (ePrime * ix)) : NaN;
    const rightDelta = analysis && ePrime > 0 && ix > 0 ? Math.abs((Number(analysis.summary.rightOverhang.value) || 0) / (ePrime * ix)) : NaN;
    const midDeltaMax = analysis && ePrime > 0 && ix > 0 ? Math.abs((Number(analysis.summary.EIDeltaMaxIn3.value) || 0) / (ePrime * ix)) : NaN;
    const midDeltaMin = analysis && ePrime > 0 && ix > 0 ? Math.abs((Number(analysis.summary.EIDeltaMinIn3.value) || 0) / (ePrime * ix)) : NaN;
    const leftShearDelta = analysis && kAG > 0 ? Math.abs((Number((analysis.summary.shearLeftOverhang || {}).value) || 0) / kAG) : NaN;
    const rightShearDelta = analysis && kAG > 0 ? Math.abs((Number((analysis.summary.shearRightOverhang || {}).value) || 0) / kAG) : NaN;
    const midShearDeltaMax = analysis && kAG > 0 ? Math.abs((Number(analysis.summary.KsDeltaMaxIn.value) || 0) / kAG) : NaN;
    const midShearDeltaMin = analysis && kAG > 0 ? Math.abs((Number(analysis.summary.KsDeltaMinIn.value) || 0) / kAG) : NaN;
    const leftTotalDelta = (Number.isFinite(leftDelta) || Number.isFinite(leftShearDelta)) ? (Number(leftDelta || 0) + Number(leftShearDelta || 0)) : NaN;
    const rightTotalDelta = (Number.isFinite(rightDelta) || Number.isFinite(rightShearDelta)) ? (Number(rightDelta || 0) + Number(rightShearDelta || 0)) : NaN;
    const midTotalDeltaMax = (Number.isFinite(midDeltaMax) || Number.isFinite(midShearDeltaMax)) ? (Number(midDeltaMax || 0) + Number(midShearDeltaMax || 0)) : NaN;
    const midTotalDeltaMin = (Number.isFinite(midDeltaMin) || Number.isFinite(midShearDeltaMin)) ? (Number(midDeltaMin || 0) + Number(midShearDeltaMin || 0)) : NaN;
    const allowableLeft = leftCantileverLengthFt > 0 ? (2 * leftCantileverLengthFt * 12) / ratio : NaN;
    const allowableRight = rightCantileverLengthFt > 0 ? (2 * rightCantileverLengthFt * 12) / ratio : NaN;
    const allowableMid = midSpanLengthFt > 0 ? (midSpanLengthFt * 12) / ratio : NaN;
    const leftRatio = Number.isFinite(leftDelta) && Number.isFinite(allowableLeft) && allowableLeft > 0 ? leftDelta / allowableLeft : NaN;
    const rightRatio = Number.isFinite(rightDelta) && Number.isFinite(allowableRight) && allowableRight > 0 ? rightDelta / allowableRight : NaN;
    const midMaxRatio = Number.isFinite(midDeltaMax) && Number.isFinite(allowableMid) && allowableMid > 0 ? midDeltaMax / allowableMid : NaN;
    const midMinRatio = Number.isFinite(midDeltaMin) && Number.isFinite(allowableMid) && allowableMid > 0 ? midDeltaMin / allowableMid : NaN;

    return {
      material,
      materials,
      cdRows,
      deflectionRows,
      family,
      area,
      sx,
      ix,
      lud,
      le,
      rb,
      cdRow,
      cdValue,
      cf,
      cfu,
      ciIsYes,
      ciFlex,
      ciE,
      cr,
      rawFbPos,
      rawFbNeg,
      rawFv,
      rawFcPerp,
      rawE,
      rawEmin,
      gProject,
      shearK,
      kAG,
      eMinPrime,
      fbE,
      clPos,
      clNeg,
      cv,
      fbStarPos,
      fbStarNeg,
      fbPrimePos,
      fbPrimeNeg,
      fvPrime,
      fcPerpPrime,
      ePrime,
      fbPos,
      fbNeg,
      fv,
      fc1,
      fc2,
      ratio,
      deflectionRow,
      leftCantileverLengthFt,
      rightCantileverLengthFt,
      midSpanLengthFt,
      leftDelta,
      rightDelta,
      midDeltaMax,
      midDeltaMin,
      leftShearDelta,
      rightShearDelta,
      midShearDeltaMax,
      midShearDeltaMin,
      leftTotalDelta,
      rightTotalDelta,
      midTotalDeltaMax,
      midTotalDeltaMin,
      allowableLeft,
      allowableRight,
      allowableMid,
      leftRatio,
      rightRatio,
      midMaxRatio,
      midMinRatio,
      Mpos,
      Mneg,
      Vmax,
      R1,
      R2,
      inputs: { b, d, bearing1, bearing2, L, lu }
    };
  }

  const api = { computeWoodBeamDesign, computeBeamStabilityFactor, toFinite };
  window.StructuralCalcBeamDesignEngine = api;
  if (window.StructuralCalcModules) window.StructuralCalcModules.register('beam-design-engine', api);
})();
