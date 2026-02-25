/**
 * Display enrichers: merge related table data (e.g. post glyphNames) into
 * parsed output for human-readable Font Source display. Add new enrichers
 * here as we support more tables (loca, glyf, cmap, etc.).
 */

export type DisplayContext = {
  post?: { glyphNames?: string[] } | null;
};

function enrichHmtx(parsed: unknown, context: DisplayContext): unknown {
  const p = parsed as Record<string, unknown> | null;
  if (!p || !Array.isArray(p.advances) || !Array.isArray(p.leftSideBearings)) return parsed;
  const names = context?.post?.glyphNames ?? [];
  const n = (p.advances as number[]).length;
  const metrics: Array<{ id: number; name: string; advance: number; lsb: number }> = [];
  for (let i = 0; i < n; i++) {
    metrics.push({
      id: i,
      name: (names[i] as string | undefined) ?? ".notdef",
      advance: (p.advances as number[])[i],
      lsb: (p.leftSideBearings as number[])[i],
    });
  }
  return {
    numberOfHMetrics: p.numberOfHMetrics,
    numGlyphs: p.numGlyphs,
    metrics,
    ...(p._note != null && { _note: p._note }),
  };
}

function enrichVmtx(parsed: unknown, context: DisplayContext): unknown {
  const p = parsed as Record<string, unknown> | null;
  if (!p || !Array.isArray(p.advances) || !Array.isArray(p.topSideBearings)) return parsed;
  const names = context?.post?.glyphNames ?? [];
  const n = (p.advances as number[]).length;
  const metrics: Array<{ id: number; name: string; advance: number; tsb: number }> = [];
  for (let i = 0; i < n; i++) {
    metrics.push({
      id: i,
      name: (names[i] as string | undefined) ?? ".notdef",
      advance: (p.advances as number[])[i],
      tsb: (p.topSideBearings as number[])[i],
    });
  }
  return {
    numOfLongVerMetrics: p.numOfLongVerMetrics,
    numGlyphs: p.numGlyphs,
    metrics,
    ...(p._note != null && { _note: p._note }),
  };
}

function enrichLoca(parsed: unknown, context: DisplayContext): unknown {
  const p = parsed as Record<string, unknown> | null;
  if (!p || !Array.isArray(p.offsets) || typeof p.numEntries !== "number") return parsed;
  const names = context?.post?.glyphNames ?? [];
  const offsets = p.offsets as number[];
  const numEntries = p.numEntries as number;
  const numGlyphs = Math.max(0, numEntries - 1);
  const entries: Array<{ id: number; name: string; start: number; end: number }> = [];
  for (let i = 0; i < numGlyphs && i + 1 < offsets.length; i++) {
    entries.push({
      id: i,
      name: (names[i] as string | undefined) ?? ".notdef",
      start: offsets[i],
      end: offsets[i + 1],
    });
  }
  return {
    format: p.format,
    numEntries,
    entries,
    ...(p._note != null && { _note: p._note }),
  };
}

function enrichGlyf(parsed: unknown, context: DisplayContext): unknown {
  const p = parsed as Record<string, unknown> | null;
  if (!p || !Array.isArray(p.glyphs)) return parsed;
  const names = context?.post?.glyphNames ?? [];
  const glyphs = p.glyphs as Array<{
    index: number;
    numberOfContours: number;
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
  }>;
  const glyphsOut = glyphs.map((g) => ({
    id: g.index,
    name: (names[g.index] as string | undefined) ?? ".notdef",
    numberOfContours: g.numberOfContours,
    xMin: g.xMin,
    yMin: g.yMin,
    xMax: g.xMax,
    yMax: g.yMax,
  }));
  return {
    numGlyphs: p.numGlyphs,
    glyphs: glyphsOut,
    ...(p._note != null && { _note: p._note }),
  };
}

function enrichKern(parsed: unknown, _context: DisplayContext): unknown {
  const p = parsed as Record<string, unknown> | null;
  if (!p || typeof p !== "object" || Array.isArray(p)) return parsed;
  // kerningPairs is { count: N }; no per-pair data to enrich
  return parsed;
}

function enrichGDEF(parsed: unknown, _context: DisplayContext): unknown {
  const p = parsed as Record<string, unknown> | null;
  if (!p || typeof p !== "object" || Array.isArray(p)) return parsed;
  const out = { ...p };

  if (p.glyphClassDef && typeof p.glyphClassDef === "object") {
    const gcd = p.glyphClassDef as Record<string, unknown>;
    const base = (gcd.baseGlyphs as number) ?? 0;
    const lig = (gcd.ligatureGlyphs as number) ?? 0;
    const mark = (gcd.markGlyphs as number) ?? 0;
    const comp = (gcd.componentGlyphs as number) ?? 0;
    const classSummary = `${base} base, ${lig} ligature, ${mark} mark, ${comp} component`;
    out.glyphClassDef = { ...gcd, classSummary };
  }

  // ligCaretList: counts only (ligatureCount, caretCount); no glyph arrays

  // One-line summary: what the table represents
  const parts: string[] = [];
  if (out.glyphClassDef && typeof out.glyphClassDef === "object") {
    const cs = (out.glyphClassDef as Record<string, unknown>).classSummary as string | undefined;
    parts.push(cs ? `Glyph classes (${cs})` : "Glyph classes");
  }
  if (out.ligCaretList) parts.push("LigCaretList");
  if ((p as Record<string, unknown>).attachList) parts.push("AttachList");
  if ((p as Record<string, unknown>).markAttachClassDef) parts.push("MarkAttachClassDef");
  if ((p as Record<string, unknown>).markGlyphSetsDef) parts.push("MarkGlyphSets");
  if ((p as Record<string, unknown>).itemVarStore) parts.push("ItemVarStore");
  if (parts.length > 0) (out as Record<string, unknown>).summary = parts.join("; ");

  return out;
}

function enrichGSUB(parsed: unknown, context: DisplayContext): unknown {
  const p = parsed as Record<string, unknown> | null;
  if (!p || typeof p !== "object" || Array.isArray(p)) return parsed;
  const names = context?.post?.glyphNames ?? [];

  if (p.ligatures && typeof p.ligatures === "object") {
    const lig = p.ligatures as {
      data?: Array<{ components?: number[]; ligatureGlyph?: number }>;
      total?: number;
      _note?: string;
    };
    if (Array.isArray(lig.data)) {
      const data = lig.data.map((d) => ({
        ...d,
        componentNames: (d.components ?? []).map(
          (c) => (names[c] as string | undefined) ?? ".notdef"
        ),
        ligatureName: (names[d.ligatureGlyph as number] as string | undefined) ?? ".notdef",
      }));
      const summary = data.map(
        (d) => `${(d.componentNames ?? []).join("+") || "?"}→${d.ligatureName ?? ".notdef"}`
      );
      return { ...p, ligatures: { ...lig, data, summary } };
    }
  }
  return p;
}

function enrichGPOS(parsed: unknown, _context: DisplayContext): unknown {
  const p = parsed as Record<string, unknown> | null;
  if (!p || typeof p !== "object" || Array.isArray(p)) return parsed;
  // kerningPairs is { count: N }; no per-pair data to enrich
  return p;
}

function enrichVariable(tag: string, parsed: unknown, _context: DisplayContext): unknown {
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return parsed;
  const p = parsed as Record<string, unknown>;

  let summary: string;
  const store = p.itemVariationStore as Record<string, unknown> | null | undefined;
  const regionCount =
    store && typeof store.regionCount === "number" ? store.regionCount : undefined;

  switch (tag) {
    case "fvar": {
      const axisCount = (p.axisCount as number | undefined) ?? 0;
      const instanceCount = (p.instanceCount as number | undefined) ?? 0;
      summary = `${axisCount} axes, ${instanceCount} instances`;
      break;
    }
    case "avar": {
      const axisCount = (p.axisCount as number | undefined) ?? 0;
      summary = `${axisCount} axes with segment maps`;
      break;
    }
    case "HVAR": {
      summary = "Metrics variation (advance, LSB, RSB)";
      if (store) {
        summary +=
          regionCount != null ? `; ${regionCount} regions` : "; ItemVariationStore present";
      }
      break;
    }
    case "VVAR": {
      summary = "Vertical metrics variation (advance, TSB, BSB, VOrg)";
      if (store) {
        summary +=
          regionCount != null ? `; ${regionCount} regions` : "; ItemVariationStore present";
      }
      break;
    }
    case "MVAR": {
      const valueRecordCount = (p.valueRecordCount as number | undefined) ?? 0;
      summary = `${valueRecordCount} value records`;
      if (store) summary += "; ItemVariationStore present";
      break;
    }
    case "STAT": {
      const designAxisCount = (p.designAxisCount as number | undefined) ?? 0;
      const axisValueCount = (p.axisValueCount as number | undefined) ?? 0;
      summary = `${designAxisCount} design axes`;
      if (axisValueCount > 0) summary += `; ${axisValueCount} axis values`;
      const elided = p.elidedFallbackName as string | undefined;
      if (elided != null && elided !== "") {
        const truncated = elided.length > 40 ? `${elided.slice(0, 37)}…` : elided;
        summary += `; elided fallback: ${truncated}`;
      }
      break;
    }
    case "cvar": {
      const tupleVariationCount = p.tupleVariationCount as number | undefined;
      summary =
        tupleVariationCount != null
          ? `CVT variations (${tupleVariationCount} tuple variation records)`
          : "CVT variations";
      break;
    }
    case "gvar": {
      const glyphCount = (p.glyphCount as number | undefined) ?? 0;
      const sharedTupleCount = (p.sharedTupleCount as number | undefined) ?? 0;
      summary = `${glyphCount} glyphs with variation data; ${sharedTupleCount} shared tuples`;
      break;
    }
    default:
      return parsed;
  }

  return { ...p, summary };
}

/**
 * Returns a display-ready version of parsed table data by merging in
 * related tables (e.g. post glyphNames for hmtx/vmtx). If no enricher
 * exists or the shape does not match, returns parsed unchanged.
 */
export function getDisplayData(tag: string, parsed: unknown, context: DisplayContext): unknown {
  if (parsed == null) return parsed;
  switch (tag) {
    case "hmtx":
      return enrichHmtx(parsed, context);
    case "vmtx":
      return enrichVmtx(parsed, context);
    case "loca":
      return enrichLoca(parsed, context);
    case "glyf":
      return enrichGlyf(parsed, context);
    case "kern":
      return enrichKern(parsed, context);
    case "GDEF":
      return enrichGDEF(parsed, context);
    case "GSUB":
      return enrichGSUB(parsed, context);
    case "GPOS":
      return enrichGPOS(parsed, context);
    case "fvar":
    case "avar":
    case "MVAR":
    case "STAT":
    case "HVAR":
    case "VVAR":
    case "cvar":
    case "gvar":
      return enrichVariable(tag, parsed, context);
    default:
      return parsed;
  }
}
