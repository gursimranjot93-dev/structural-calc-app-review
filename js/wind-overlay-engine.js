(function () {
  function getOverlayPanel(wind, panelKey) {
    return wind && wind.inputs && wind.inputs.overlay && wind.inputs.overlay.panels ? wind.inputs.overlay.panels[panelKey] : null;
  }

  function scaleBoardPoint(point) {
    const width = Number(point.width) || 900;
    const height = Number(point.height) || 520;
    return {
      x: (Number(point.x) || 0) * 900 / width,
      y: (Number(point.y) || 0) * 520 / height
    };
  }

  function applyScale(panel) {
    if (!panel || !Array.isArray(panel.calibrationPoints) || panel.calibrationPoints.length !== 2) return;
    const dist = Number(panel.calibrationDistance) || 0;
    if (dist <= 0) return;
    const [a, b] = panel.calibrationPoints;
    const pixelLength = Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
    if (pixelLength <= 0) return;
    panel.scaleFtPerPx = dist / pixelLength;
    panel.mode = 'idle';
    panel.generated = null;
  }

  function closeTrace(panel) {
    const pts = panel.currentTracePoints || [];
    if (!panel.scaleFtPerPx || pts.length < 3) return;
    if (panel.mode === 'trace-building') panel.buildingTrace = pts.map(copyPoint);
    if (panel.mode === 'trace-roof') panel.roofTrace = pts.map(copyPoint);
    panel.currentTracePoints = [];
    panel.mode = 'idle';
    panel.generated = null;
  }

  function addDiaphragmMarker(panel, point) {
    if (!panel.scaleFtPerPx || !panel.buildingTrace || panel.buildingTrace.length < 3) return;
    const bounds = polygonBounds(panel.buildingTrace);
    const clampedY = Math.max(bounds.minY, Math.min(bounds.maxY, Number(point.y) || 0));
    const buildingHeightFt = (bounds.maxY - bounds.minY) * panel.scaleFtPerPx;
    const elevFt = Math.max(0, Math.min(buildingHeightFt, (bounds.maxY - clampedY) * panel.scaleFtPerPx));
    if (!Array.isArray(panel.diaphragmMarkers)) panel.diaphragmMarkers = [];
    panel.diaphragmMarkers.push({ y: clampedY, elevationFt: elevFt });
    panel.diaphragmMarkers.sort((a, b) => a.elevationFt - b.elevationFt);
    panel.generated = null;
    panel.mode = 'idle';
  }

  function refreshOverlayLoads(wind) {
    if (!wind || !wind.inputs || !wind.inputs.overlay || !wind.inputs.overlay.panels) return;
    ['long', 'short'].forEach((key) => {
      const panel = wind.inputs.overlay.panels[key];
      if (panel && panel.generated) panel.generated = buildPanelLoadSummary(wind, key);
    });
  }

  function buildPanelLoadSummary(wind, panelKey) {
    const panel = getOverlayPanel(wind, panelKey);
    if (!panel || !panel.scaleFtPerPx || !panel.buildingTrace || panel.buildingTrace.length < 3) return null;
    const directionIndex = panelKey === 'long' ? 1 : 0;
    const direction = wind.results && wind.results.directions ? wind.results.directions[directionIndex] : null;
    if (!direction) return null;

    const scale = Number(panel.scaleFtPerPx) || 0;
    if (scale <= 0) return null;

    const bounds = polygonBounds(panel.buildingTrace);
    const buildingHeightFt = (bounds.maxY - bounds.minY) * scale;
    const diaphragms = buildDiaphragmBandsFromMarkers(panel.diaphragmMarkers, wind.inputs.overlay.diaphragmElevationsText, buildingHeightFt);
    const wallBands = buildWallPressureBands(direction, buildingHeightFt);
    const roofPressure = Math.abs(Number(direction.summary && direction.summary.governingRoof) || 0);
    const roofAreaFt2 = areaFt2(panel.roofTrace, scale);

    if (!diaphragms.length) {
      return {
        panelTitle: panel.title,
        directionLabel: direction.directionLabel,
        buildingHeightFt,
        bounds,
        roofPressurePsf: roofPressure,
        roofAreaFt2,
        wallBands,
        rows: [],
        totalLoadLb: 0,
        requiresMarkers: true
      };
    }

    const rows = diaphragms.map((band) => {
      const wallSlices = [];
      let wallAreaFt2 = 0;
      let wallLoadLb = 0;
      for (const pBand of wallBands) {
        const overlapLow = Math.max(band.lowerFt, pBand.lowFt);
        const overlapHigh = Math.min(band.upperFt, pBand.highFt);
        if (overlapHigh <= overlapLow) continue;
        const area = stripAreaFt2(panel.buildingTrace, scale, bounds.maxY, overlapLow, overlapHigh);
        const roofOverlap = panel.roofTrace && panel.roofTrace.length >= 3 ? stripAreaFt2(panel.roofTrace, scale, bounds.maxY, overlapLow, overlapHigh) : 0;
        const netArea = Math.max(0, area - roofOverlap);
        const pressure = Math.abs(Number(pBand.pressure06) || 0);
        wallAreaFt2 += netArea;
        wallLoadLb += netArea * pressure;
        wallSlices.push({
          label: pBand.label,
          lowFt: overlapLow,
          highFt: overlapHigh,
          areaFt2: netArea,
          pressurePsf: pressure,
          loadLb: netArea * pressure
        });
      }

      const roofLoadLb = band.isRoof ? roofAreaFt2 * roofPressure : 0;
      return {
        diaphragm: band.label,
        elevationFt: band.elevationFt,
        tributaryLowFt: band.lowerFt,
        tributaryHighFt: band.upperFt,
        wallAreaFt2,
        wallLoadLb,
        roofAreaFt2: band.isRoof ? roofAreaFt2 : 0,
        roofPressurePsf: band.isRoof ? roofPressure : 0,
        roofLoadLb,
        totalLoadLb: wallLoadLb + roofLoadLb,
        isRoof: !!band.isRoof,
        slices: wallSlices
      };
    });

    return {
      panelTitle: panel.title,
      directionLabel: direction.directionLabel,
      buildingHeightFt,
      bounds,
      roofPressurePsf: roofPressure,
      roofAreaFt2,
      wallBands,
      rows,
      totalLoadLb: rows.reduce((sum, row) => sum + row.totalLoadLb, 0)
    };
  }

  function buildDiaphragmBandsFromMarkers(markers, text, buildingHeightFt) {
    const values = [];
    if (Array.isArray(markers) && markers.length) {
      markers.forEach((m) => {
        const n = Number(m.elevationFt);
        if (Number.isFinite(n) && n > 0 && n < buildingHeightFt) values.push(n);
      });
    } else {
      String(text || '')
        .split(/[\n,]/)
        .map((item) => Number(item.trim()))
        .filter((n) => Number.isFinite(n) && n > 0 && n < buildingHeightFt)
        .forEach((n) => values.push(n));
    }
    values.sort((a, b) => a - b);
    const unique = [];
    values.forEach((n) => {
      if (!unique.some((m) => Math.abs(m - n) < 1e-6)) unique.push(n);
    });
    return unique.map((elev, i) => {
      const lower = i === 0 ? elev / 2 : (unique[i - 1] + elev) / 2;
      const upper = i === unique.length - 1 ? buildingHeightFt : (elev + unique[i + 1]) / 2;
      return {
        label: i === unique.length - 1 ? 'Roof Diaphragm' : `Diaphragm ${i + 1}`,
        elevationFt: elev,
        lowerFt: lower,
        upperFt: upper,
        isRoof: i === unique.length - 1
      };
    });
  }

  function buildWallPressureBands(direction, buildingHeightFt) {
    const rows = Array.isArray(direction.rows) ? direction.rows : [];
    const bounds = [0, 15, 20, 25, 30, 35, 40, 45, 50, Math.max(50, buildingHeightFt)];
    return rows.map((row, i) => ({
      label: row.band,
      lowFt: bounds[i],
      highFt: Math.min(bounds[i + 1], buildingHeightFt),
      pressure: row.wall ? row.wall.governing : 0,
      pressure06: row.wall ? row.wall.net06 : 0
    })).filter((item) => item.highFt > item.lowFt);
  }

  function polygonBounds(points) {
    return points.reduce((acc, pt) => ({
      minX: Math.min(acc.minX, pt.x),
      maxX: Math.max(acc.maxX, pt.x),
      minY: Math.min(acc.minY, pt.y),
      maxY: Math.max(acc.maxY, pt.y)
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  }

  function areaFt2(points, scale) {
    if (!points || points.length < 3 || !(scale > 0)) return 0;
    return polygonAreaPx2(points) * scale * scale;
  }

  function polygonAreaPx2(points) {
    let sum = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      sum += (a.x * b.y) - (b.x * a.y);
    }
    return Math.abs(sum) / 2;
  }

  function stripAreaFt2(points, scale, baseY, lowFt, highFt) {
    if (!points || points.length < 3 || !(scale > 0) || highFt <= lowFt) return 0;
    const topY = baseY - (highFt / scale);
    const bottomY = baseY - (lowFt / scale);
    let clipped = clipPolygon(points, (pt) => pt.y >= topY, (a, b) => intersectWithHorizontal(a, b, topY));
    clipped = clipPolygon(clipped, (pt) => pt.y <= bottomY, (a, b) => intersectWithHorizontal(a, b, bottomY));
    return polygonAreaPx2(clipped) * scale * scale;
  }

  function clipPolygon(points, insideFn, intersectionFn) {
    if (!points || !points.length) return [];
    const output = [];
    let prev = points[points.length - 1];
    let prevInside = insideFn(prev);
    for (const curr of points) {
      const currInside = insideFn(curr);
      if (currInside) {
        if (!prevInside) output.push(intersectionFn(prev, curr));
        output.push(copyPoint(curr));
      } else if (prevInside) {
        output.push(intersectionFn(prev, curr));
      }
      prev = curr;
      prevInside = currInside;
    }
    return output;
  }

  function intersectWithHorizontal(a, b, yConst) {
    const dy = b.y - a.y;
    if (Math.abs(dy) < 1e-9) return { x: b.x, y: yConst };
    const t = (yConst - a.y) / dy;
    return { x: a.x + (b.x - a.x) * t, y: yConst };
  }

  function copyPoint(pt) {
    return { x: Number(pt.x) || 0, y: Number(pt.y) || 0 };
  }

  const api = {
    getOverlayPanel,
    scaleBoardPoint,
    applyScale,
    closeTrace,
    addDiaphragmMarker,
    refreshOverlayLoads,
    buildPanelLoadSummary,
    buildDiaphragmBandsFromMarkers,
    buildWallPressureBands,
    polygonBounds
  };
  if (window.StructuralCalcModules) window.StructuralCalcModules.register('wind-overlay-engine', api);
})();
