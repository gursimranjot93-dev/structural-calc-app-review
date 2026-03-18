(function () {
  const { analyzeWindRecord } = window.StructuralCalcModules.require('wind-engine');
  const windState = window.StructuralCalcModules.require('wind-state');
  const overlayEngine = window.StructuralCalcModules.require('wind-overlay-engine');

  function initialize(state) {
    const wind = windState.getWindModule(state);
    rerunWindRecord(wind);
  }

  function rerunWindRecord(wind) {
    if (!wind) return;
    wind.hasKztSheet = ((wind.inputs || {}).pressure || {}).KztSource === 'linked';
    wind.results = analyzeWindRecord(wind);
    wind.stale = false;
    wind.lastComputedAt = new Date().toISOString();
    overlayEngine.refreshOverlayLoads(wind);
  }

  function createHandlers(ctx) {
    const { getState, render } = ctx;
    return {
      updateWindRecordField(field, value) {
        const state = getState();
        const wind = windState.getWindModule(state);
        if (!wind) return;
        wind.inputs.record[field] = value;
        render();
      },
      updateWindPressureField(field, value) {
        const state = getState();
        const wind = windState.getWindModule(state);
        if (!wind) return;
        const numericFields = new Set(['V','Kd','KztManual','G','longerDimension','shorterDimension','roofSlopeRise','h','gcpiPositive','gcpiNegative']);
        wind.inputs.pressure[field] = numericFields.has(field) ? (Number(value) || 0) : value;
        wind.hasKztSheet = wind.inputs.pressure.KztSource === 'linked';
        if (!wind.hasKztSheet && state.ui.activePage.type === 'windKzt') state.ui.activePage = { type: 'windPage' };
        rerunWindRecord(wind);
        render();
      },
      updateWindKztField(field, value) {
        const state = getState();
        const wind = windState.getWindModule(state);
        if (!wind) return;
        const numericFields = new Set(['H','LhMiles','xMiles','z','siteLat','siteLon','pointCountEachSide','totalLineMiles']);
        wind.inputs.kzt[field] = numericFields.has(field) ? (value === '' ? '' : (Number(value) || 0)) : value;
        rerunWindRecord(wind);
        render();
      },
      async geocodeWindKztProjectAddress() {
        const state = getState();
        const wind = windState.getWindModule(state);
        const address = String((state.project && state.project.jobSiteAddress) || '').trim();
        if (!wind) return;
        if (!address) {
          wind.inputs.kzt.geocodeStatus = 'Enter the job site address on Sheet 1 first.';
          render();
          return;
        }
        wind.inputs.kzt.geocodeStatus = 'Geocoding address…';
        render();
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`;
          const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
          if (!res.ok) throw new Error('Geocode request failed.');
          const data = await res.json();
          if (!Array.isArray(data) || !data.length) throw new Error('Address not found.');
          wind.inputs.kzt.siteLat = Number(data[0].lat) || '';
          wind.inputs.kzt.siteLon = Number(data[0].lon) || '';
          wind.inputs.kzt.geocodeStatus = 'Coordinates loaded from Sheet 1 address.';
        } catch (err) {
          wind.inputs.kzt.geocodeStatus = err && err.message ? err.message : 'Unable to geocode address.';
        }
        render();
      },
      async runWindKztTerrainScan() {
        const state = getState();
        const wind = windState.getWindModule(state);
        if (!wind) return;
        const kzt = wind.inputs.kzt;
        const lat = Number(kzt.siteLat);
        const lon = Number(kzt.siteLon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          kzt.scanStatus = 'Set the site latitude and longitude first.';
          render();
          return;
        }
        kzt.scanStatus = 'Generating sample points and requesting elevations…';
        render();
        try {
          const axes = buildTerrainAxes(lat, lon, Number(kzt.totalLineMiles) || 4, Number(kzt.pointCountEachSide) || 10);
          const allPts = [];
          Object.values(axes).forEach((axis) => axis.points.forEach((pt) => allPts.push(pt)));
          const latCsv = allPts.map((pt) => pt.lat.toFixed(6)).join(',');
          const lonCsv = allPts.map((pt) => pt.lon.toFixed(6)).join(',');
          const url = `https://api.open-meteo.com/v1/elevation?latitude=${latCsv}&longitude=${lonCsv}`;
          const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
          if (!res.ok) throw new Error('Elevation request failed.');
          const data = await res.json();
          const elevations = Array.isArray(data.elevation) ? data.elevation : [];
          allPts.forEach((pt, idx) => { pt.elevation = Number(elevations[idx]); });
          Object.values(axes).forEach((axis) => {
            axis.points = axis.points.map((pt) => Object.assign({}, pt, {
              elevation: Number.isFinite(pt.elevation) ? pt.elevation : null
            }));
            axis.minElevation = Math.min(...axis.points.filter((pt) => Number.isFinite(pt.elevation)).map((pt) => pt.elevation));
            axis.maxElevation = Math.max(...axis.points.filter((pt) => Number.isFinite(pt.elevation)).map((pt) => pt.elevation));
          });
          kzt.scanAxes = axes;
          kzt.scanStatus = 'Terrain profiles generated.';
        } catch (err) {
          kzt.scanStatus = err && err.message ? err.message : 'Unable to generate terrain profiles.';
        }
        render();
      },
      clearWindKztTerrainScan() {
        const state = getState();
        const wind = windState.getWindModule(state);
        if (!wind) return;
        wind.inputs.kzt.scanAxes = {};
        wind.inputs.kzt.scanStatus = '';
        render();
      },
      uploadWindOverlayImage(panelKey, file) {
        const state = getState();
        const panel = overlayEngine.getOverlayPanel(windState.getWindModule(state), panelKey);
        if (!panel || !file) return;
        const reader = new FileReader();
        reader.onload = function () {
          panel.imageDataUrl = String(reader.result || '');
          panel.calibrationPoints = [];
          panel.currentTracePoints = [];
          panel.buildingTrace = [];
          panel.roofTrace = [];
          panel.diaphragmMarkers = [];
          panel.generated = null;
          panel.scaleFtPerPx = null;
          panel.mode = 'idle';
          render();
        };
        reader.readAsDataURL(file);
      },
      updateWindOverlayPanelField(panelKey, field, value) {
        const state = getState();
        const panel = overlayEngine.getOverlayPanel(windState.getWindModule(state), panelKey);
        if (!panel) return;
        const numericFields = new Set(['calibrationDistance']);
        panel[field] = numericFields.has(field) ? (Number(value) || 0) : value;
        render();
      },
      updateWindOverlayGlobalField(field, value) {
        const state = getState();
        const wind = windState.getWindModule(state);
        wind.inputs.overlay[field] = value;
        overlayEngine.refreshOverlayLoads(wind);
        render();
      },
      setWindOverlayMode(panelKey, mode) {
        const state = getState();
        const panel = overlayEngine.getOverlayPanel(windState.getWindModule(state), panelKey);
        if (!panel) return;
        if (panel.generated && mode !== 'idle') return;
        panel.mode = mode || 'idle';
        if (mode === 'calibrate') panel.calibrationPoints = [];
        if (mode === 'trace-building' || mode === 'trace-roof') panel.currentTracePoints = [];
        render();
      },
      addWindOverlayPoint(panelKey, point) {
        const state = getState();
        const wind = windState.getWindModule(state);
        const panel = overlayEngine.getOverlayPanel(wind, panelKey);
        if (!panel || !panel.imageDataUrl) return;
        if (panel.generated) return;
        const scaledPoint = overlayEngine.scaleBoardPoint(point);
        if (panel.mode === 'calibrate') {
          if ((panel.calibrationPoints || []).length >= 2) panel.calibrationPoints = [];
          panel.calibrationPoints.push(scaledPoint);
          render();
          return;
        }
        if (panel.mode === 'trace-building' || panel.mode === 'trace-roof') {
          panel.currentTracePoints.push(scaledPoint);
          render();
          return;
        }
        if (panel.mode === 'mark-diaphragm') {
          overlayEngine.addDiaphragmMarker(panel, scaledPoint);
          render();
        }
      },
      performWindOverlayAction(panelKey, action) {
        const state = getState();
        const wind = windState.getWindModule(state);
        const panel = overlayEngine.getOverlayPanel(wind, panelKey);
        if (!panel) return;
        if (action === 'edit-trace') {
          panel.generated = null;
          panel.mode = 'idle';
          render();
          return;
        }
        const blockedWhenGenerated = new Set(['undo-point','close-trace','clear-current-trace','clear-building','clear-roof','clear-diaphragms','generate']);
        if (panel.generated && blockedWhenGenerated.has(action)) return;
        switch (action) {
          case 'apply-scale':
            overlayEngine.applyScale(panel);
            break;
          case 'clear-scale':
            panel.calibrationPoints = [];
            panel.scaleFtPerPx = null;
            panel.mode = 'idle';
            panel.generated = null;
            break;
          case 'undo-point':
            panel.currentTracePoints.pop();
            break;
          case 'close-trace':
            overlayEngine.closeTrace(panel);
            break;
          case 'clear-current-trace':
            panel.currentTracePoints = [];
            panel.mode = 'idle';
            break;
          case 'clear-building':
            panel.currentTracePoints = [];
            panel.buildingTrace = [];
            panel.diaphragmMarkers = [];
            panel.generated = null;
            panel.mode = 'idle';
            break;
          case 'clear-roof':
            panel.currentTracePoints = [];
            panel.roofTrace = [];
            panel.generated = null;
            panel.mode = 'idle';
            break;
          case 'clear-diaphragms':
            panel.diaphragmMarkers = [];
            panel.generated = null;
            panel.mode = 'idle';
            break;
          case 'generate':
            panel.generated = overlayEngine.buildPanelLoadSummary(wind, panelKey);
            break;
        }
        render();
      }
    };
  }

  function buildTerrainAxes(siteLat, siteLon, totalMiles, pointsEachSide) {
    const axes = [
      { key: 'ns', label: 'N-S', dx: 0, dy: 1 },
      { key: 'ew', label: 'E-W', dx: 1, dy: 0 },
      { key: 'nwse', label: 'NW-SE', dx: 1 / Math.sqrt(2), dy: -1 / Math.sqrt(2) },
      { key: 'nesw', label: 'NE-SW', dx: 1 / Math.sqrt(2), dy: 1 / Math.sqrt(2) }
    ];
    const halfMiles = totalMiles / 2;
    const stepMiles = halfMiles / Math.max(1, pointsEachSide);
    const result = {};
    axes.forEach((axis) => {
      const points = [];
      for (let i = -pointsEachSide; i <= pointsEachSide; i += 1) {
        const distanceMiles = i * stepMiles;
        const distanceKm = distanceMiles * 1.609344;
        const northKm = axis.dy * distanceKm;
        const eastKm = axis.dx * distanceKm;
        const lat = siteLat + northKm / 110.574;
        const lon = siteLon + eastKm / (111.320 * Math.cos(siteLat * Math.PI / 180));
        points.push({
          index: i + pointsEachSide + 1,
          offsetMiles: distanceMiles,
          lat,
          lon,
          elevation: null,
          isSite: i === 0
        });
      }
      result[axis.key] = { key: axis.key, label: axis.label, points };
    });
    return result;
  }


  const api = { initialize, createHandlers };
  if (window.StructuralCalcModules) window.StructuralCalcModules.register('wind-controller', api);
})();
