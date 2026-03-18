
(function () {
  const LIB_PATH = 'libraries/beam-library.xlsx';

  function asNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeRuntimeFamily(value) {
    const raw = String(value || '').trim().toLowerCase();
    const map = {
      'sawn_lumber': 'sawn-dimension',
      'heavy_timber': 'heavy-timber',
      'glulam': 'glulam',
      'lsl': 'lsl',
      'lvl': 'lvl',
      'psl': 'psl'
    };
    return map[raw] || raw || 'unknown';
  }

  function familyAliases(family) {
    const normalized = normalizeRuntimeFamily(family);
    const aliases = [normalized];
    if (normalized === 'sawn-dimension') aliases.push('sawn_lumber');
    if (normalized === 'heavy-timber') aliases.push('heavy_timber');
    return aliases;
  }

  function headerIndexMap(headerRow) {
    const map = {};
    (headerRow || []).forEach((value, index) => {
      map[String(value || '').trim()] = index;
    });
    return map;
  }

  function nonEmptyRows(matrix, startIndex) {
    return (matrix || []).slice(startIndex || 0).filter((row) => Array.isArray(row) && row.some((value) => value !== '' && value != null));
  }

  function parseDurationFactorSheet(matrix) {
    return nonEmptyRows(matrix, 2)
      .filter((row) => typeof row[0] === 'string' && row[0] !== 'Note' && row[1] !== '' && row[1] != null)
      .map((row) => ({ label: String(row[0]), value: asNumber(row[1], 1) }));
  }

  function parseDeflectionLimitsSheet(matrix) {
    return nonEmptyRows(matrix, 2)
      .filter((row) => row[0] !== 'Note' && row[0] !== '' && row[0] != null)
      .map((row) => ({ ratio: asNumber(row[0], 240), label: String(row[1] || row[0] || '') }));
  }

  function parseRuntimeMetadata(matrix) {
    const rows = nonEmptyRows(matrix, 2);
    const map = {};
    for (const row of rows) {
      const sourceKey = String(row[1] || '').trim();
      if (!sourceKey) continue;
      map[sourceKey] = {
        category: String(row[0] || '').trim(),
        sourceKey,
        runtimeId: String(row[2] || '').trim(),
        brand: String(row[3] || '').trim(),
        subcode: String(row[4] || '').trim(),
        runtimeFamily: normalizeRuntimeFamily(row[5]),
        gRule: String(row[6] || '').trim(),
        ruleGroup: String(row[7] || '').trim(),
        notes: String(row[8] || '').trim()
      };
    }
    return map;
  }

  function parseStaticMaterials(matrix, metadataMap) {
    const rows = nonEmptyRows(matrix, 2);
    return rows
      .filter((row) => String(row[0] || '').trim().startsWith('MAT_'))
      .map((row) => {
        const sourceKey = String(row[0] || '').trim();
        const meta = metadataMap[sourceKey] || {};
        return {
          id: meta.runtimeId || sourceKey.toLowerCase(),
          sourceKey,
          name: String(row[1] || ''),
          family: meta.runtimeFamily || normalizeRuntimeFamily(row[2]),
          type: 'static',
          brand: meta.brand || '',
          subcode: meta.subcode || '',
          gRule: meta.gRule || 'E/16 project rule',
          FbPos: asNumber(row[4]),
          FbNeg: asNumber(row[5] != null && row[5] !== '' ? row[5] : row[4]),
          Ft: asNumber(row[6]),
          Fv: asNumber(row[7]),
          FcPerp: asNumber(row[8]),
          FcPar: asNumber(row[9]),
          E: asNumber(row[10]),
          Emin: asNumber(row[11]),
          notes: String(row[12] || meta.notes || '')
        };
      });
  }

  function parseEngineeredBaseValues(matrix, metadataMap) {
    const rows = nonEmptyRows(matrix, 2);
    return rows
      .filter((row) => String(row[0] || '').trim().startsWith('ENG_'))
      .map((row) => {
        const sourceKey = String(row[0] || '').trim();
        const meta = metadataMap[sourceKey] || {};
        return {
          id: meta.runtimeId || sourceKey.toLowerCase(),
          sourceKey,
          engineeredKey: sourceKey,
          name: String(row[1] || ''),
          family: meta.runtimeFamily || normalizeRuntimeFamily(row[2]),
          type: 'engineered',
          brand: meta.brand || '',
          subcode: meta.subcode || '',
          gRule: meta.gRule || 'E/16 project rule',
          ruleGroup: meta.ruleGroup || sourceKey,
          FbPos: asNumber(row[3]),
          FbNeg: asNumber(row[4] != null && row[4] !== '' ? row[4] : row[3]),
          Ft: asNumber(row[5]),
          Fv: asNumber(row[6]),
          FcPerp: asNumber(row[7]),
          FcPar: asNumber(row[8]),
          E: asNumber(row[9]),
          Emin: asNumber(row[10]),
          referenceDepthIn: asNumber(row[11], 0),
          referenceLengthFt: asNumber(row[12], 0),
          notes: String(row[13] || meta.notes || '')
        };
      });
  }

  function parseEngineeredRules(matrix) {
    const rows = nonEmptyRows(matrix, 2);
    return rows
      .filter((row) => String(row[0] || '').trim().startsWith('ENG_'))
      .map((row) => ({
        engineeredKey: String(row[0] || '').trim(),
        property: String(row[1] || ''),
        ruleType: String(row[2] || ''),
        driver: String(row[3] || ''),
        baseValue: row[4] === '' ? null : asNumber(row[4]),
        referenceDepthIn: row[5] === '' ? null : asNumber(row[5]),
        referenceLengthFt: row[6] === '' ? null : asNumber(row[6]),
        exponent: row[7] === '' ? null : asNumber(row[7]),
        logic: String(row[8] || '')
      }));
  }

  function buildCfSheetPayload(workbook, worksheet) {
    const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
    const merges = (worksheet['!merges'] || []).map((merge) => ({
      s: { r: merge.s.r, c: merge.s.c },
      e: { r: merge.e.r, c: merge.e.c }
    }));
    return { sheetName: 'Size Factors CF', matrix, merges };
  }

  async function loadBeamLibraryWorkbook() {
    const response = await fetch(`${LIB_PATH}?v=passc1`, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`Could not load ${LIB_PATH} (${response.status})`);
    }
    const bytes = await response.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: 'array' });
    const sheet = (name) => workbook.Sheets[name];
    const matrix = (name) => XLSX.utils.sheet_to_json(sheet(name), { header: 1, raw: false, defval: '' });

    const metadataMap = parseRuntimeMetadata(matrix('Runtime Export Metadata'));
    const libraries = {
      woodCD: parseDurationFactorSheet(matrix('Duration Factor CD')),
      woodDeflectionLimits: parseDeflectionLimitsSheet(matrix('Deflection Limits')),
      woodMaterials: [
        ...parseStaticMaterials(matrix('Static Material Properties'), metadataMap),
        ...parseEngineeredBaseValues(matrix('Engineered Base Values'), metadataMap)
      ],
      woodEngineeredRules: parseEngineeredRules(matrix('Engineered Rules')),
      woodCFReferenceSheet: buildCfSheetPayload(workbook, sheet('Size Factors CF')),
      beamLibraryWorkbookInfo: {
        path: LIB_PATH,
        loadedAt: new Date().toISOString()
      }
    };

    window.StructuralCalcLibraries = libraries;
    return libraries;
  }

  function emptyLibraries() {
    return {
      woodCD: [],
      woodDeflectionLimits: [],
      woodMaterials: [],
      woodEngineeredRules: [],
      woodCFReferenceSheet: { sheetName: 'Size Factors CF', matrix: [], merges: [] },
      beamLibraryWorkbookInfo: { path: LIB_PATH, loadedAt: new Date().toISOString(), error: true }
    };
  }

  window.StructuralCalcLibraries = window.StructuralCalcLibraries || emptyLibraries();
  window.StructuralCalcLibrariesReady = loadBeamLibraryWorkbook().catch((error) => {
    console.error('Beam library workbook failed to load.', error);
    window.StructuralCalcLibraries = emptyLibraries();
    window.StructuralCalcLibraries.beamLibraryWorkbookInfo.message = String(error && error.message || error);
    return window.StructuralCalcLibraries;
  });
})();
