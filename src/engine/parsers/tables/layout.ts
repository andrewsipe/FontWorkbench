/**
 * Layout table parsers: GSUB, GPOS, GDEF, kern.
 * Designer-focused: scripts, features, lookup inventory, ligatures, kerning counts.
 */

import { GPOS_LOOKUP_TYPES, GSUB_LOOKUP_TYPES, resolveNameID } from "./decoders";
import { fixed16ToDecimal, tag4 } from "./formatters";
import { parseStub } from "./stub";

export type ParseLayoutResult = { parsed: unknown; status: string };

function result(
  parsed: unknown,
  status: "complete" | "partial" | "not_implemented" | "error"
): ParseLayoutResult {
  return { parsed, status };
}

function popcount16(x: number): number {
  let n = 0;
  for (let i = 0; i < 16; i++) if ((x >> i) & 1) n++;
  return n;
}

// ---------------------------------------------------------------------------
// parseCoverage(buffer, baseOffset, coverageOffset)
// Coverage table at baseOffset + coverageOffset. Returns all glyph IDs or null.
// ---------------------------------------------------------------------------
function parseCoverage(
  buffer: ArrayBuffer,
  baseOffset: number,
  coverageOffset: number
): number[] | null {
  try {
    const abs = baseOffset + coverageOffset;
    const view = new DataView(buffer, abs);
    const format = view.getUint16(0, false);
    const glyphs: number[] = [];

    if (format === 1) {
      const glyphCount = view.getUint16(2, false);
      for (let i = 0; i < glyphCount; i++) glyphs.push(view.getUint16(4 + i * 2, false));
    } else if (format === 2) {
      const rangeCount = view.getUint16(2, false);
      for (let i = 0; i < rangeCount; i++) {
        const o = 4 + i * 6;
        const start = view.getUint16(o, false);
        const end = view.getUint16(o + 2, false);
        for (let gid = start; gid <= end; gid++) glyphs.push(gid);
      }
    }
    return glyphs;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// parseClassDef(buffer, baseOffset, classDefOffset) -> Map<gid, class> | null
// ---------------------------------------------------------------------------
function parseClassDef(
  buffer: ArrayBuffer,
  baseOffset: number,
  classDefOffset: number
): Map<number, number> | null {
  try {
    const view = new DataView(buffer, baseOffset + classDefOffset);
    const format = view.getUint16(0, false);
    const map = new Map<number, number>();

    if (format === 1) {
      const startGlyphID = view.getUint16(2, false);
      const glyphCount = view.getUint16(4, false);
      for (let i = 0; i < glyphCount; i++)
        map.set(startGlyphID + i, view.getUint16(6 + i * 2, false));
    } else if (format === 2) {
      const rangeCount = view.getUint16(2, false);
      for (let i = 0; i < rangeCount; i++) {
        const o = 4 + i * 6;
        const start = view.getUint16(o, false);
        const end = view.getUint16(o + 2, false);
        const cls = view.getUint16(o + 4, false);
        for (let gid = start; gid <= end; gid++) map.set(gid, cls);
      }
    }
    return map;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// parseFeatureList: FeatureList + Feature table -> { tag, lookupCount, featureParams? }[]
// Feature table: FeatureParamsOffset (2), LookupCount (2), LookupListIndex[].
// When featureParamsOffset !== 0, parse FeatureParams (Size, StylisticSet, CharVariants).
// ---------------------------------------------------------------------------
function parseFeatureList(
  buffer: ArrayBuffer,
  baseOffset: number,
  featureListOffset: number,
  tableLength: number
): Array<{
  tag: string;
  lookupCount: number;
  lookupListIndices: number[];
  featureParams?: Record<string, unknown>;
}> {
  const out: Array<{
    tag: string;
    lookupCount: number;
    lookupListIndices: number[];
    featureParams?: Record<string, unknown>;
  }> = [];
  try {
    if (featureListOffset <= 0 || featureListOffset + 2 > tableLength) return out;
    const view = new DataView(
      buffer,
      baseOffset + featureListOffset,
      tableLength - featureListOffset
    );
    const featureCount = view.getUint16(0, false);
    for (let i = 0; i < featureCount && featureListOffset + 2 + (i + 1) * 6 <= tableLength; i++) {
      const rec = featureListOffset + 2 + i * 6;
      const b = new Uint8Array(buffer, baseOffset + rec, 4);
      const tag = tag4(b[0], b[1], b[2], b[3]);
      const featureOffset = view.getUint16(rec - featureListOffset + 4, false);
      let lookupCount = 0;
      const lookupListIndices: number[] = [];
      let featureParams: Record<string, unknown> | undefined;
      const featAbs = featureListOffset + featureOffset;
      if (featAbs + 4 <= tableLength) {
        const fv = new DataView(buffer, baseOffset + featAbs, tableLength - featAbs);
        const featureParamsOffset = fv.getUint16(0, false);
        lookupCount = fv.getUint16(2, false);
        if (4 + lookupCount * 2 <= fv.byteLength) {
          for (let L = 0; L < lookupCount; L++) {
            lookupListIndices.push(fv.getUint16(4 + L * 2, false));
          }
        }
        if (featureParamsOffset !== 0) {
          const paramsBase = baseOffset + featAbs + featureParamsOffset;
          if (paramsBase + 2 <= baseOffset + tableLength) {
            if (tag === "size" && paramsBase + 6 <= baseOffset + tableLength) {
              const pv = new DataView(buffer, paramsBase, 6);
              featureParams = {
                DesignSize: pv.getInt32(0, false) / 65536,
                SubfamilyNameID: pv.getUint16(4, false),
              };
            } else if (
              /^ss(0[1-9]|1[0-9]|20)$/.test(tag) &&
              paramsBase + 4 <= baseOffset + tableLength
            ) {
              // FeatureParamsStylisticSet: Version (2) at 0, UINameID (2) at 2
              const pv = new DataView(buffer, paramsBase, 4);
              const uiNameID = pv.getUint16(2, false);
              featureParams = {
                UINameID: uiNameID,
                uiName: resolveNameID(buffer, uiNameID) ?? undefined,
              };
            } else if (
              /^cv(0[1-9]|[1-9][0-9])$/.test(tag) &&
              paramsBase + 4 <= baseOffset + tableLength
            ) {
              // FeatureParamsCharacterVariants Format 0: Format (2) at 0, FeatUILabelNameID (2) at 2
              const pv = new DataView(buffer, paramsBase, 4);
              const featUILabelNameID = pv.getUint16(2, false);
              featureParams = {
                Format: pv.getUint16(0, false),
                UINameID: featUILabelNameID,
                uiName: featUILabelNameID
                  ? (resolveNameID(buffer, featUILabelNameID) ?? undefined)
                  : undefined,
              };
            }
          }
        }
      }
      out.push(
        featureParams
          ? { tag, lookupCount, lookupListIndices, featureParams }
          : { tag, lookupCount, lookupListIndices }
      );
    }
  } catch {
    // return what we have
  }
  return out;
}

// ---------------------------------------------------------------------------
// parseScriptListWithFeatures: ScriptList + Script + LangSys -> script/lang/featureTags
// featureList is by FeatureList index; scriptListOffset from GSUB/GPOS header.
// ---------------------------------------------------------------------------
function parseScriptListWithFeatures(
  buffer: ArrayBuffer,
  baseOffset: number,
  scriptListOffset: number,
  tableLength: number,
  featureList: Array<{ tag: string }>
): Array<{ script: string; lang: string; featureTags: string[]; requiredTag?: string }> {
  const out: Array<{ script: string; lang: string; featureTags: string[]; requiredTag?: string }> =
    [];
  try {
    if (scriptListOffset <= 0 || scriptListOffset + 2 > tableLength) return out;
    const slView = new DataView(
      buffer,
      baseOffset + scriptListOffset,
      tableLength - scriptListOffset
    );
    const scriptCount = slView.getUint16(0, false);
    for (let i = 0; i < scriptCount && scriptListOffset + 2 + (i + 1) * 6 <= tableLength; i++) {
      const recOff = 2 + i * 6;
      const tagBytes = new Uint8Array(buffer, baseOffset + scriptListOffset + recOff, 4);
      const scriptTag = tag4(tagBytes[0], tagBytes[1], tagBytes[2], tagBytes[3]);
      const scriptOffset = slView.getUint16(recOff + 4, false);
      const scriptBase = scriptListOffset + scriptOffset;
      if (scriptBase + 4 > tableLength) continue;
      const scView = new DataView(buffer, baseOffset + scriptBase, tableLength - scriptBase);
      const defaultLangSysOffset = scView.getUint16(0, false);
      const langSysCount = scView.getUint16(2, false);

      const readLangSys = (lsOffset: number): { featureTags: string[]; requiredTag?: string } => {
        const lsBase = scriptBase + lsOffset;
        if (lsBase + 6 > tableLength) return { featureTags: [] };
        const lsView = new DataView(buffer, baseOffset + lsBase, tableLength - lsBase);
        const requiredFeatureIndex = lsView.getUint16(2, false);
        const featureIndexCount = lsView.getUint16(4, false);
        const featureTags: string[] = [];
        for (let k = 0; k < featureIndexCount && lsBase + 6 + (k + 1) * 2 <= tableLength; k++) {
          const fi = lsView.getUint16(6 + k * 2, false);
          const t = featureList[fi]?.tag;
          if (t) featureTags.push(t);
        }
        const requiredTag =
          requiredFeatureIndex !== 0xffff ? featureList[requiredFeatureIndex]?.tag : undefined;
        return { featureTags, requiredTag };
      };

      if (defaultLangSysOffset !== 0) {
        const { featureTags, requiredTag } = readLangSys(defaultLangSysOffset);
        out.push({ script: scriptTag, lang: "dflt", featureTags, requiredTag });
      }
      for (let j = 0; j < langSysCount && scriptBase + 4 + (j + 1) * 6 <= tableLength; j++) {
        const lrOff = 4 + j * 6;
        const lrTag = new Uint8Array(buffer, baseOffset + scriptBase + lrOff, 4);
        const langTag = tag4(lrTag[0], lrTag[1], lrTag[2], lrTag[3]);
        const langSysOffset = scView.getUint16(lrOff + 4, false);
        const { featureTags, requiredTag } = readLangSys(langSysOffset);
        out.push({ script: scriptTag, lang: langTag, featureTags, requiredTag });
      }
    }
  } catch {
    // return what we have
  }
  return out;
}

// ---------------------------------------------------------------------------
// buildFeatureSummary: featureList + scriptFeatures -> compact, non-redundant
// featureInventory (unique tag→lookupCount), featureSets (unique tag sets),
// scriptFeatureMatrix.bySet (set id -> script/lang list). Omits raw featureList
// and scriptFeatures to avoid 249 and 14×18 repetition.
// ---------------------------------------------------------------------------
function buildFeatureSummary(
  featureList: Array<{ tag: string; lookupCount: number }>,
  scriptFeatures: Array<{ script: string; lang: string; featureTags: string[] }>
): {
  featureInventory: Array<{ tag: string; lookupCount: number }>;
  featureSets: Array<{ id: number; tags: string[]; tagCount: number }>;
  scriptFeatureMatrix: { bySet: Record<string, string[]> };
  scriptFeatureSummary: string;
} {
  const featureInventory: Array<{ tag: string; lookupCount: number }> = [];
  const seen = new Set<string>();
  for (const f of featureList) {
    if (!seen.has(f.tag)) {
      seen.add(f.tag);
      featureInventory.push({ tag: f.tag, lookupCount: f.lookupCount });
    }
  }
  featureInventory.sort((a, b) => a.tag.localeCompare(b.tag));

  const keyToSet = new Map<string, { id: number; tags: string[]; tagCount: number }>();
  const bySet: Record<string, string[]> = {};
  let nextId = 1;
  for (const sf of scriptFeatures) {
    const key = sf.featureTags.join(",");
    if (!keyToSet.has(key)) {
      keyToSet.set(key, { id: nextId, tags: sf.featureTags, tagCount: sf.featureTags.length });
      bySet[String(nextId)] = [];
      nextId++;
    }
    const set = keyToSet.get(key);
    if (set) bySet[String(set.id)].push(`${sf.script}/${sf.lang.trim()}`);
  }
  const featureSets = [...keyToSet.values()];

  const setCount = featureSets.length;
  const comboCount = scriptFeatures.length;
  const scriptFeatureSummary =
    setCount <= 1
      ? `${comboCount} script+language combination(s)`
      : `${setCount} feature sets across ${comboCount} script+language combinations`;

  return {
    featureInventory,
    featureSets,
    scriptFeatureMatrix: { bySet },
    scriptFeatureSummary,
  };
}

// ---------------------------------------------------------------------------
// GDEF
// ---------------------------------------------------------------------------
function parseGDEF(buffer: ArrayBuffer, offset: number, length: number): ParseLayoutResult {
  try {
    if (length < 12) return result(parseStub("GDEF", length), "not_implemented");

    const view = new DataView(buffer, offset, length);
    const version = view.getUint32(0, false);
    const glyphClassDefOffset = view.getUint16(4, false);
    const attachListOffset = view.getUint16(6, false);
    const ligCaretListOffset = view.getUint16(8, false);
    const markAttachClassDefOffset = view.getUint16(10, false);

    const out: Record<string, unknown> = { version: fixed16ToDecimal(version) };

    if (glyphClassDefOffset > 0) {
      const classMap = parseClassDef(buffer, offset, glyphClassDefOffset);
      if (classMap) {
        const counts = { base: 0, ligature: 0, mark: 0, component: 0 };
        const name = (v: number) =>
          v === 1 ? "base" : v === 2 ? "ligature" : v === 3 ? "mark" : v === 4 ? "component" : null;

        classMap.forEach((v) => {
          const k = name(v);
          if (k) counts[k]++;
        });

        out.glyphClassDef = {
          totalGlyphs: classMap.size,
          baseGlyphs: counts.base,
          ligatureGlyphs: counts.ligature,
          markGlyphs: counts.mark,
          componentGlyphs: counts.component,
        };
      }
    }

    if (ligCaretListOffset > 0 && offset + ligCaretListOffset + 4 <= buffer.byteLength) {
      const lcBase = offset + ligCaretListOffset;
      const lc = new DataView(buffer, lcBase);
      const ligGlyphCount = lc.getUint16(2, false);
      let caretCount = 0;
      for (let i = 0; i < ligGlyphCount && 4 + (i + 1) * 2 <= buffer.byteLength - lcBase; i++) {
        const ligGlyphOff = lc.getUint16(4 + i * 2, false);
        const lgAddr = lcBase + ligGlyphOff;
        if (lgAddr + 2 <= buffer.byteLength) {
          caretCount += new DataView(buffer, lgAddr, 2).getUint16(0, false);
        }
      }
      out.ligCaretList = {
        ligatureCount: ligGlyphCount,
        caretCount,
      };
    }

    if (attachListOffset > 0) {
      const alBase = offset + attachListOffset;
      if (alBase + 2 <= buffer.byteLength) {
        const covOff = new DataView(buffer, alBase, 2).getUint16(0, false);
        const coverage = parseCoverage(buffer, alBase, covOff);
        out.attachList = { glyphCount: coverage?.length ?? 0 };
      } else {
        out.attachList = "Present";
      }
    }
    if (markAttachClassDefOffset > 0) {
      const classMap = parseClassDef(buffer, offset, markAttachClassDefOffset);
      if (classMap) {
        out.markAttachClassDef = {
          glyphCount: classMap.size,
          classCount: new Set(classMap.values()).size,
        };
      } else {
        out.markAttachClassDef = "Present";
      }
    }

    if (version >= 0x0001_0002 && length >= 14) {
      const v = view.getUint16(12, false);
      if (v > 0) out.markGlyphSetsDef = "Present";
    }
    if (version >= 0x0001_0003 && length >= 18) {
      const v = view.getUint32(14, false);
      if (v > 0) out.itemVarStore = "Present (variable font)";
    }

    return result(out, "partial");
  } catch (e) {
    console.warn("[parseGDEF] Parse failed:", e);
    return result(parseStub("GDEF", length), "error");
  }
}

// ---------------------------------------------------------------------------
// parseGSUBSingleSubst: Format 1 or 2; Coverage at 2 -> glyphCount
// ---------------------------------------------------------------------------
function parseGSUBSingleSubst(buffer: ArrayBuffer, subtableOffset: number): { glyphCount: number } {
  try {
    const v = new DataView(buffer, subtableOffset);
    if (v.byteLength < 4) return { glyphCount: 0 };
    const coverageOffset = v.getUint16(2, false);
    const cov = parseCoverage(buffer, subtableOffset, coverageOffset);
    return { glyphCount: cov?.length ?? 0 };
  } catch {
    return { glyphCount: 0 };
  }
}

// ---------------------------------------------------------------------------
// parseGSUBMultipleSubst: Format 1; Coverage at 2 -> glyphCount
// ---------------------------------------------------------------------------
function parseGSUBMultipleSubst(
  buffer: ArrayBuffer,
  subtableOffset: number
): { glyphCount: number } {
  try {
    const v = new DataView(buffer, subtableOffset);
    if (v.getUint16(0, false) !== 1 || v.byteLength < 6) return { glyphCount: 0 };
    const coverageOffset = v.getUint16(2, false);
    const cov = parseCoverage(buffer, subtableOffset, coverageOffset);
    return { glyphCount: cov?.length ?? 0 };
  } catch {
    return { glyphCount: 0 };
  }
}

// ---------------------------------------------------------------------------
// parseGSUBAlternateSubst: Format 1; Coverage at 2 -> glyphCount
// ---------------------------------------------------------------------------
function parseGSUBAlternateSubst(
  buffer: ArrayBuffer,
  subtableOffset: number
): { glyphCount: number } {
  try {
    const v = new DataView(buffer, subtableOffset);
    if (v.getUint16(0, false) !== 1 || v.byteLength < 6) return { glyphCount: 0 };
    const coverageOffset = v.getUint16(2, false);
    const cov = parseCoverage(buffer, subtableOffset, coverageOffset);
    return { glyphCount: cov?.length ?? 0 };
  } catch {
    return { glyphCount: 0 };
  }
}

// ---------------------------------------------------------------------------
// parseGSUBLigatureSubstitution: subtableOffset absolute, first component from Coverage
// ---------------------------------------------------------------------------
function parseGSUBLigatureSubstitution(
  buffer: ArrayBuffer,
  subtableOffset: number
): { ligatures: Array<{ components: number[]; ligatureGlyph: number }>; total: number } {
  const out: Array<{ components: number[]; ligatureGlyph: number }> = [];
  let total = 0;

  try {
    const v = new DataView(buffer, subtableOffset);
    if (v.getUint16(0, false) !== 1) return { ligatures: out, total: 0 };

    const coverageOffset = v.getUint16(2, false);
    const ligatureSetCount = v.getUint16(4, false);
    const coverageGlyphs = parseCoverage(buffer, subtableOffset, coverageOffset) ?? [];

    for (let i = 0; i < ligatureSetCount; i++) {
      const setOff = v.getUint16(6 + i * 2, false);
      if (setOff === 0) continue;

      const setAddr = subtableOffset + setOff;
      const setView = new DataView(buffer, setAddr);
      const ligatureCount = setView.getUint16(0, false);
      total += ligatureCount;

      for (let j = 0; j < ligatureCount; j++) {
        const ligOff = setView.getUint16(2 + j * 2, false);
        const ligAddr = setAddr + ligOff;
        const ligView = new DataView(buffer, ligAddr);
        const ligatureGlyph = ligView.getUint16(0, false);
        const compCount = ligView.getUint16(2, false);
        const rest: number[] = [];
        for (let k = 1; k < compCount; k++) rest.push(ligView.getUint16(4 + (k - 1) * 2, false));
        const first = coverageGlyphs[i] ?? 0;
        out.push({ components: [first, ...rest], ligatureGlyph });
      }
    }
  } catch {
    // return what we have
  }
  return { ligatures: out, total };
}

// ---------------------------------------------------------------------------
// GSUB
// ---------------------------------------------------------------------------
function parseGSUB(buffer: ArrayBuffer, offset: number, length: number): ParseLayoutResult {
  try {
    if (length < 10) return result(parseStub("GSUB", length), "not_implemented");

    const view = new DataView(buffer, offset, length);
    const version = view.getUint32(0, false);
    const scriptListOffset = view.getUint16(4, false);
    const featureListOffset = view.getUint16(6, false);
    const lookupListOffset = view.getUint16(8, false);

    const featureList = parseFeatureList(buffer, offset, featureListOffset, length);
    const scriptFeatures = parseScriptListWithFeatures(
      buffer,
      offset,
      scriptListOffset,
      length,
      featureList
    );
    const scripts = [...new Set(scriptFeatures.map((x) => x.script))];
    const { featureInventory, featureSets, scriptFeatureMatrix, scriptFeatureSummary } =
      buildFeatureSummary(featureList, scriptFeatures);
    const features = featureInventory.map((f) => f.tag);
    const featureParams: Record<string, Record<string, unknown>> = {};
    for (const f of featureList) if (f.featureParams) featureParams[f.tag] = f.featureParams;

    // Feature-to-script mapping: which scripts use which features
    const featuresByScript: Record<string, string[]> = {};
    scriptFeatures.forEach((sf) => {
      if (!featuresByScript[sf.script]) featuresByScript[sf.script] = [];
      sf.featureTags.forEach((tag) => {
        if (!featuresByScript[sf.script].includes(tag)) featuresByScript[sf.script].push(tag);
      });
    });

    // Lookup index -> feature tags (for ligature-by-feature counts)
    const lookupToFeatures = new Map<number, string[]>();
    featureList.forEach((f) => {
      (f.lookupListIndices ?? []).forEach((idx) => {
        const arr = lookupToFeatures.get(idx);
        if (arr) arr.push(f.tag);
        else lookupToFeatures.set(idx, [f.tag]);
      });
    });

    const lookupInventory: Record<string, number> = {};
    let numLookups = 0;
    const ligaturesByFeature: Record<string, number> = {};
    let singleSubstCount = 0;
    let multipleSubstCount = 0;
    let alternateSubstCount = 0;
    let contextSubstCount = 0;
    let chainingContextSubstCount = 0;

    if (lookupListOffset > 0 && lookupListOffset < length) {
      const ll = new DataView(buffer, offset + lookupListOffset, length - lookupListOffset);
      numLookups = ll.getUint16(0, false);

      for (let j = 0; j < numLookups && 2 + (j + 1) * 2 <= ll.byteLength; j++) {
        const lookOff = ll.getUint16(2 + j * 2, false);
        const lookAddr = offset + lookupListOffset + lookOff;

        if (lookAddr + 6 > buffer.byteLength) continue;
        const lv = new DataView(buffer, lookAddr);
        const lookupType = lv.getUint16(0, false);
        const subTableCount = lv.getUint16(4, false);
        const typeName =
          (GSUB_LOOKUP_TYPES as Record<number, string>)[lookupType] ?? `Type ${lookupType}`;
        lookupInventory[typeName] = (lookupInventory[typeName] ?? 0) + 1;

        if (lookupType === 1) {
          for (let k = 0; k < subTableCount; k++) {
            const subOff = lv.getUint16(6 + k * 2, false);
            singleSubstCount += parseGSUBSingleSubst(buffer, lookAddr + subOff).glyphCount;
          }
        } else if (lookupType === 2) {
          for (let k = 0; k < subTableCount; k++) {
            const subOff = lv.getUint16(6 + k * 2, false);
            multipleSubstCount += parseGSUBMultipleSubst(buffer, lookAddr + subOff).glyphCount;
          }
        } else if (lookupType === 3) {
          for (let k = 0; k < subTableCount; k++) {
            const subOff = lv.getUint16(6 + k * 2, false);
            alternateSubstCount += parseGSUBAlternateSubst(buffer, lookAddr + subOff).glyphCount;
          }
        } else if (lookupType === 4) {
          const featTags = lookupToFeatures.get(j) ?? ["unknown"];
          for (let k = 0; k < subTableCount; k++) {
            const subOff = lv.getUint16(6 + k * 2, false);
            const res = parseGSUBLigatureSubstitution(buffer, lookAddr + subOff);
            featTags.forEach((tag) => {
              ligaturesByFeature[tag] = (ligaturesByFeature[tag] ?? 0) + res.total;
            });
          }
        } else if (lookupType === 5) {
          contextSubstCount += subTableCount;
        } else if (lookupType === 6) {
          chainingContextSubstCount += subTableCount;
        }
      }
    }

    const ligTotal = Object.values(ligaturesByFeature).reduce((a, b) => a + b, 0);
    const out: Record<string, unknown> = {
      version: fixed16ToDecimal(version),
      scriptCount: scripts.length,
      featureCount: featureInventory.length,
      scripts,
      features,
      featuresByScript,
      featureInventory,
      featureSets,
      scriptFeatureMatrix,
      scriptFeatureSummary,
      totalLookups: numLookups,
      lookupInventory,
      summary: `${scripts.length} scripts, ${featureInventory.length} features, ${numLookups} lookups${ligTotal ? `, ${ligTotal} ligatures` : ""}`,
    };
    if (Object.keys(featureParams).length > 0) out.featureParams = featureParams;
    if (singleSubstCount > 0) out.singleSubst = { glyphCount: singleSubstCount };
    if (multipleSubstCount > 0) out.multipleSubst = { glyphCount: multipleSubstCount };
    if (alternateSubstCount > 0) out.alternateSubst = { glyphCount: alternateSubstCount };
    if (contextSubstCount > 0) out.contextSubst = { subtableCount: contextSubstCount };
    if (chainingContextSubstCount > 0)
      out.chainingContextSubst = { subtableCount: chainingContextSubstCount };
    if (Object.keys(ligaturesByFeature).length > 0) {
      out.ligatures = { byFeature: ligaturesByFeature, total: ligTotal };
    }

    return result(out, "partial");
  } catch (e) {
    console.warn("[parseGSUB] Parse failed:", e);
    return result(parseStub("GSUB", length), "error");
  }
}

/**
 * Parse only the GSUB feature list and return featureParams by tag.
 * Used by FeatureExtractor to resolve UINameID/FeatUILabelNameID when opentype.js/fontkit
 * do not expose FeatureParams (e.g. ss01–ss20, cv01–cv99).
 */
export function getGSUBFeatureParamsFromBuffer(
  buffer: ArrayBuffer,
  gsubOffset: number,
  gsubLength: number
): Record<string, Record<string, unknown>> {
  if (gsubLength < 10) return {};
  try {
    const view = new DataView(buffer, gsubOffset, 10);
    const featureListOffset = view.getUint16(6, false);
    const featureList = parseFeatureList(buffer, gsubOffset, featureListOffset, gsubLength);
    const featureParams: Record<string, Record<string, unknown>> = {};
    for (const f of featureList) {
      if (f.featureParams) featureParams[f.tag] = f.featureParams;
    }
    return featureParams;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// parseGPOSSinglePos: Format 1 or 2; Coverage at 2 -> glyphCount
// ---------------------------------------------------------------------------
function parseGPOSSinglePos(buffer: ArrayBuffer, subtableOffset: number): { glyphCount: number } {
  try {
    const v = new DataView(buffer, subtableOffset);
    if (v.byteLength < 4) return { glyphCount: 0 };
    const coverageOffset = v.getUint16(2, false);
    const cov = parseCoverage(buffer, subtableOffset, coverageOffset);
    return { glyphCount: cov?.length ?? 0 };
  } catch {
    return { glyphCount: 0 };
  }
}

// ---------------------------------------------------------------------------
// parseGPOSMarkBaseFormat1: MarkCoverage 2, BaseCoverage 6, MarkArray 8 -> baseCount, markCount, markClassCount
// ---------------------------------------------------------------------------
function parseGPOSMarkBaseFormat1(
  buffer: ArrayBuffer,
  subtableOffset: number
): { baseCount: number; markCount: number; markClassCount: number } {
  try {
    const v = new DataView(buffer, subtableOffset);
    if (v.getUint16(0, false) !== 1 || v.byteLength < 12)
      return { baseCount: 0, markCount: 0, markClassCount: 0 };
    const markCov = parseCoverage(buffer, subtableOffset, v.getUint16(2, false));
    const baseCov = parseCoverage(buffer, subtableOffset, v.getUint16(6, false));
    const markArrayOffset = v.getUint16(8, false);
    let markClassCount = 0;
    if (markArrayOffset > 0) {
      const markArrayAddr = subtableOffset + markArrayOffset;
      if (markArrayAddr + 2 <= buffer.byteLength) {
        const markArrayView = new DataView(
          buffer,
          markArrayAddr,
          buffer.byteLength - markArrayAddr
        );
        const markCount = markArrayView.getUint16(0, false);
        const markClasses = new Set<number>();
        for (let i = 0; i < markCount && 2 + (i + 1) * 4 <= markArrayView.byteLength; i++) {
          markClasses.add(markArrayView.getUint16(2 + i * 4, false));
        }
        markClassCount = markClasses.size;
      }
    }
    return { baseCount: baseCov?.length ?? 0, markCount: markCov?.length ?? 0, markClassCount };
  } catch {
    return { baseCount: 0, markCount: 0, markClassCount: 0 };
  }
}

// ---------------------------------------------------------------------------
// parseGPOSPairAdjustment Format 1: Coverage for left, ValueRecord stride, XAdvance
// ---------------------------------------------------------------------------
function parseGPOSPairAdjustment(
  buffer: ArrayBuffer,
  subtableOffset: number
): Array<{ left: number; right: number; value: number }> {
  const pairs: Array<{ left: number; right: number; value: number }> = [];

  try {
    const v = new DataView(buffer, subtableOffset);
    if (v.getUint16(0, false) !== 1) return pairs;

    const coverageOffset = v.getUint16(2, false);
    const valueFormat1 = v.getUint16(4, false);
    const valueFormat2 = v.getUint16(6, false);
    const pairSetCount = v.getUint16(8, false);

    const value1Len = 2 * popcount16(valueFormat1);
    const value2Len = 2 * popcount16(valueFormat2);
    const recordStride = 2 + value1Len + value2Len;
    const hasXAdv1 = (valueFormat1 & 0x0004) !== 0;
    const xAdvanceOffset = hasXAdv1 ? 2 * popcount16(valueFormat1 & 0x0003) : 0;

    const coverageGlyphs = parseCoverage(buffer, subtableOffset, coverageOffset) ?? [];

    for (let i = 0; i < pairSetCount; i++) {
      const setOff = v.getUint16(10 + i * 2, false);
      if (setOff === 0) continue;

      const setAddr = subtableOffset + setOff;
      const ps = new DataView(buffer, setAddr);
      const pairValueCount = ps.getUint16(0, false);
      const left = coverageGlyphs[i] ?? 0;

      for (let j = 0; j < pairValueCount; j++) {
        const rec = 2 + j * recordStride;
        const secondGlyph = ps.getUint16(rec, false);
        let value = 0;
        if (hasXAdv1) value = ps.getInt16(rec + 2 + xAdvanceOffset, false);
        pairs.push({ left, right: secondGlyph, value });
      }
    }
  } catch {
    // return what we have
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// GPOS
// ---------------------------------------------------------------------------
function parseGPOS(buffer: ArrayBuffer, offset: number, length: number): ParseLayoutResult {
  try {
    if (length < 10) return result(parseStub("GPOS", length), "not_implemented");

    const view = new DataView(buffer, offset, length);
    const version = view.getUint32(0, false);
    const scriptListOffset = view.getUint16(4, false);
    const featureListOffset = view.getUint16(6, false);
    const lookupListOffset = view.getUint16(8, false);

    const featureList = parseFeatureList(buffer, offset, featureListOffset, length);
    const scriptFeatures = parseScriptListWithFeatures(
      buffer,
      offset,
      scriptListOffset,
      length,
      featureList
    );
    const scripts = [...new Set(scriptFeatures.map((x) => x.script))];
    const { featureInventory, featureSets, scriptFeatureMatrix, scriptFeatureSummary } =
      buildFeatureSummary(featureList, scriptFeatures);
    const features = featureInventory.map((f) => f.tag);
    const gposFeatureParams: Record<string, Record<string, unknown>> = {};
    for (const f of featureList) if (f.featureParams) gposFeatureParams[f.tag] = f.featureParams;

    // Feature-to-script mapping
    const featuresByScript: Record<string, string[]> = {};
    scriptFeatures.forEach((sf) => {
      if (!featuresByScript[sf.script]) featuresByScript[sf.script] = [];
      sf.featureTags.forEach((tag) => {
        if (!featuresByScript[sf.script].includes(tag)) featuresByScript[sf.script].push(tag);
      });
    });

    const lookupInventory: Record<string, number> = {};
    let numLookups = 0;
    let pairCount = 0;
    let singlePosCount = 0;
    let markToBaseBases = 0;
    let markToBaseMarks = 0;
    let markToBaseClassCount = 0;

    if (lookupListOffset > 0 && lookupListOffset < length) {
      const ll = new DataView(buffer, offset + lookupListOffset, length - lookupListOffset);
      numLookups = ll.getUint16(0, false);

      for (let j = 0; j < numLookups && 2 + (j + 1) * 2 <= ll.byteLength; j++) {
        const lookOff = ll.getUint16(2 + j * 2, false);
        const lookAddr = offset + lookupListOffset + lookOff;

        if (lookAddr + 6 > buffer.byteLength) continue;
        const lv = new DataView(buffer, lookAddr);
        const lookupType = lv.getUint16(0, false);
        const subTableCount = lv.getUint16(4, false);
        const typeName =
          (GPOS_LOOKUP_TYPES as Record<number, string>)[lookupType] ?? `Type ${lookupType}`;
        lookupInventory[typeName] = (lookupInventory[typeName] ?? 0) + 1;

        if (lookupType === 1) {
          for (let k = 0; k < subTableCount; k++) {
            const subOff = lv.getUint16(6 + k * 2, false);
            singlePosCount += parseGPOSSinglePos(buffer, lookAddr + subOff).glyphCount;
          }
        } else if (lookupType === 2) {
          for (let k = 0; k < subTableCount; k++) {
            const subOff = lv.getUint16(6 + k * 2, false);
            pairCount += parseGPOSPairAdjustment(buffer, lookAddr + subOff).length;
          }
        } else if (lookupType === 4) {
          for (let k = 0; k < subTableCount; k++) {
            const subOff = lv.getUint16(6 + k * 2, false);
            const sub = new DataView(buffer, lookAddr + subOff);
            if (sub.byteLength >= 2 && sub.getUint16(0, false) === 1) {
              const mb = parseGPOSMarkBaseFormat1(buffer, lookAddr + subOff);
              markToBaseBases += mb.baseCount;
              markToBaseMarks += mb.markCount;
              markToBaseClassCount = Math.max(markToBaseClassCount, mb.markClassCount);
            }
          }
        }
      }
    }

    const out: Record<string, unknown> = {
      version: fixed16ToDecimal(version),
      scriptCount: scripts.length,
      featureCount: featureInventory.length,
      scripts,
      features,
      featuresByScript,
      featureInventory,
      featureSets,
      scriptFeatureMatrix,
      scriptFeatureSummary,
      totalLookups: numLookups,
      lookupInventory,
      summary: `${scripts.length} scripts, ${featureInventory.length} features, ${numLookups} lookups${pairCount ? `, ${pairCount} kerning pairs` : ""}`,
    };
    if (Object.keys(gposFeatureParams).length > 0) out.featureParams = gposFeatureParams;
    if (singlePosCount > 0) out.singlePos = { glyphCount: singlePosCount };
    if (markToBaseMarks > 0) {
      out.markToBase = {
        baseCount: markToBaseBases,
        markCount: markToBaseMarks,
        markClasses: markToBaseClassCount,
        _note: `Marks organized into ${markToBaseClassCount} attachment classes`,
      };
    }
    if (pairCount > 0) {
      out.kerningPairs = { count: pairCount };
    }

    return result(out, "partial");
  } catch (e) {
    console.warn("[parseGPOS] Parse failed:", e);
    return result(parseStub("GPOS", length), "error");
  }
}

// ---------------------------------------------------------------------------
// kern: count only; kerningPairs: { count }. All format-0 pairs, subtable bound 14+(i+1)*6<=subLen.
// ---------------------------------------------------------------------------
function parseKern(buffer: ArrayBuffer, offset: number, length: number): ParseLayoutResult {
  try {
    if (length < 4) return result(parseStub("kern", length), "not_implemented");

    const view = new DataView(buffer, offset, length);
    const version = view.getUint16(0, false);
    const nTables = view.getUint16(2, false);

    let totalPairs = 0;
    let pos = 4;

    for (let t = 0; t < nTables && pos + 6 <= length; t++) {
      const subLen = view.getUint16(pos, false);
      const subFormat = (view.getUint16(pos + 4, false) >> 8) & 0xff;

      if (subFormat === 0 && subLen >= 14) {
        totalPairs += view.getUint16(pos + 6, false);
      }
      pos += subLen;
    }

    return result(
      {
        version,
        nTables,
        kerningPairs: { count: totalPairs },
      },
      "partial"
    );
  } catch (e) {
    console.warn("[parseKern] Parse failed:", e);
    return result(parseStub("kern", length), "error");
  }
}

// ---------------------------------------------------------------------------
// parseLayout dispatcher
// ---------------------------------------------------------------------------
export function parseLayout(
  tag: string,
  buffer: ArrayBuffer,
  offset: number,
  length: number
): ParseLayoutResult {
  try {
    switch (tag) {
      case "GDEF":
        return parseGDEF(buffer, offset, length);
      case "GSUB":
        return parseGSUB(buffer, offset, length);
      case "GPOS":
        return parseGPOS(buffer, offset, length);
      case "kern":
        return parseKern(buffer, offset, length);

      case "morx":
      case "mort":
      case "feat":
        return result(
          {
            _: "Apple AAT table",
            tag,
            size: length,
            _note: "AAT tables not yet supported; OpenType GSUB/GPOS recommended",
          },
          "not_implemented"
        );

      case "JSTF":
        return result(
          { _: "Justification table", tag, size: length, _note: "JSTF not yet supported" },
          "not_implemented"
        );

      default:
        return result(parseStub(tag, length), "not_implemented");
    }
  } catch (error) {
    console.warn(`[parseLayout] Parse failed for ${tag}:`, error);
    return result(parseStub(tag, length), "error");
  }
}
