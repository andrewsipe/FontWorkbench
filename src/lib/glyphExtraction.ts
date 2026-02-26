/**
 * Glyph extraction from font file (GSUB-aware).
 * Extracts all unicode glyphs with optional OpenType feature associations.
 * Ported from Fontrapunkt-2.
 */

import opentype from "opentype.js";

export interface GlyphInfo {
  char: string;
  unicode: string;
  name: string;
  unicodeNumber: number | null;
  features: string[];
  glyphIndex: number;
}

export interface FontForExtraction {
  fileData: ArrayBuffer;
  featureDetails?: { tag: string }[];
}

interface GsubFeature {
  tag: string;
  lookupListIndexes?: number[];
  lookupListIndices?: number[];
  feature?: { lookupListIndices?: number[] };
}

interface CoverageRange {
  start: number;
  end: number;
}

interface CoverageTable {
  glyphs?: number[];
  ranges?: CoverageRange[];
}

interface GsubSubtable {
  coverage?: CoverageTable | number[];
  sequences?: number[][];
  alternateSets?: number[][];
  ligatureSets?: LigatureSet[];
}

interface Ligature {
  ligGlyph?: number;
  components?: number[];
}

type LigatureSet = Ligature[];

function getCoverageGlyphs(coverage: CoverageTable | number[] | undefined): number[] {
  if (!coverage) return [];
  if (Array.isArray(coverage)) return coverage;
  if (coverage.glyphs && Array.isArray(coverage.glyphs)) return coverage.glyphs;
  if (coverage.ranges) {
    const glyphs: number[] = [];
    for (const range of coverage.ranges) {
      for (let i = range.start; i <= range.end; i++) glyphs.push(i);
    }
    return glyphs;
  }
  return [];
}

export async function extractGlyphsFromFont(currentFont: FontForExtraction): Promise<GlyphInfo[]> {
  const opentypeFont = opentype.parse(currentFont.fileData) as opentype.Font;
  const extractedGlyphs: GlyphInfo[] = [];
  const seenUnicodes = new Set<number>();

  const unicodeToFeatures = new Map<number, Set<string>>();
  const glyphIndexToFeatures = new Map<number, Set<string>>();

  const fontFeatures = currentFont.featureDetails ?? [];
  const featureTags: string[] =
    fontFeatures.length > 0
      ? fontFeatures.map((f) => f.tag)
      : ((opentypeFont.tables?.gsub?.features as GsubFeature[] | undefined)?.map((f) => f.tag) ??
        []);

  if (featureTags.length > 0 && opentypeFont.tables?.gsub) {
    try {
      const gsub = opentypeFont.tables.gsub;

      for (const featureTag of featureTags) {
        const addFeatureToGlyph = (glyphIndex: number, hasUnicode: boolean, unicode?: number) => {
          if (!glyphIndexToFeatures.has(glyphIndex))
            glyphIndexToFeatures.set(glyphIndex, new Set());
          glyphIndexToFeatures.get(glyphIndex)?.add(featureTag);
          if (hasUnicode && unicode != null) {
            if (!unicodeToFeatures.has(unicode)) unicodeToFeatures.set(unicode, new Set());
            unicodeToFeatures.get(unicode)?.add(featureTag);
          }
        };

        const feature = (gsub.features as GsubFeature[] | undefined)?.find(
          (f) => f.tag === featureTag
        );
        if (!feature) continue;

        const lookupIndices: number[] =
          feature.lookupListIndexes && Array.isArray(feature.lookupListIndexes)
            ? feature.lookupListIndexes
            : feature.feature?.lookupListIndices && Array.isArray(feature.feature.lookupListIndices)
              ? feature.feature.lookupListIndices
              : feature.lookupListIndices && Array.isArray(feature.lookupListIndices)
                ? feature.lookupListIndices
                : [];

        if (lookupIndices.length === 0) continue;

        for (const lookupIndex of lookupIndices) {
          const lookup = gsub.lookups?.[lookupIndex];
          if (!lookup?.subtables) continue;

          for (const subtable of lookup.subtables as GsubSubtable[]) {
            const coverageGlyphs = getCoverageGlyphs(subtable.coverage);
            if (coverageGlyphs.length === 0) continue;

            if (lookup.lookupType === 1) {
              for (const glyphIndex of coverageGlyphs) {
                try {
                  const glyph = opentypeFont.glyphs.get(glyphIndex);
                  const hasUnicode = glyph != null && glyph.unicode != null;
                  addFeatureToGlyph(glyphIndex, hasUnicode, glyph?.unicode);
                } catch {
                  /* ignore */
                }
              }
            } else if (lookup.lookupType === 2 && subtable.sequences) {
              coverageGlyphs.forEach((glyphIndex, i) => {
                try {
                  const baseGlyph = opentypeFont.glyphs.get(glyphIndex);
                  const hasUnicode = baseGlyph != null && baseGlyph.unicode != null;
                  addFeatureToGlyph(glyphIndex, hasUnicode, baseGlyph?.unicode);
                  const sequence = subtable.sequences?.[i];
                  if (Array.isArray(sequence)) {
                    for (const seqIdx of sequence) {
                      try {
                        const seqGlyph = opentypeFont.glyphs.get(seqIdx);
                        addFeatureToGlyph(
                          seqIdx,
                          seqGlyph != null && seqGlyph.unicode != null,
                          seqGlyph?.unicode
                        );
                      } catch {
                        /* ignore */
                      }
                    }
                  }
                } catch {
                  /* ignore */
                }
              });
            } else if (lookup.lookupType === 3 && subtable.alternateSets) {
              coverageGlyphs.forEach((glyphIndex, i) => {
                try {
                  const baseGlyph = opentypeFont.glyphs.get(glyphIndex);
                  addFeatureToGlyph(
                    glyphIndex,
                    baseGlyph != null && baseGlyph.unicode != null,
                    baseGlyph?.unicode
                  );
                  const altSet = subtable.alternateSets?.[i];
                  if (Array.isArray(altSet)) {
                    for (const altIdx of altSet) {
                      try {
                        const altGlyph = opentypeFont.glyphs.get(altIdx);
                        addFeatureToGlyph(
                          altIdx,
                          altGlyph != null && altGlyph.unicode != null,
                          altGlyph?.unicode
                        );
                      } catch {
                        /* ignore */
                      }
                    }
                  }
                } catch {
                  /* ignore */
                }
              });
            } else if (lookup.lookupType === 4 && subtable.ligatureSets) {
              coverageGlyphs.forEach((firstGlyphIndex, i) => {
                try {
                  const firstGlyph = opentypeFont.glyphs.get(firstGlyphIndex);
                  addFeatureToGlyph(
                    firstGlyphIndex,
                    firstGlyph != null && firstGlyph.unicode != null,
                    firstGlyph?.unicode
                  );
                  const ligSet = subtable.ligatureSets?.[i];
                  if (Array.isArray(ligSet)) {
                    for (const lig of ligSet) {
                      if (lig.ligGlyph !== undefined) {
                        try {
                          const ligGlyph = opentypeFont.glyphs.get(lig.ligGlyph);
                          addFeatureToGlyph(
                            lig.ligGlyph,
                            ligGlyph != null && ligGlyph.unicode != null,
                            ligGlyph?.unicode
                          );
                        } catch {
                          /* ignore */
                        }
                      }
                      if (Array.isArray(lig.components)) {
                        for (const compIdx of lig.components) {
                          try {
                            const compGlyph = opentypeFont.glyphs.get(compIdx);
                            addFeatureToGlyph(
                              compIdx,
                              compGlyph != null && compGlyph.unicode != null,
                              compGlyph?.unicode
                            );
                          } catch {
                            /* ignore */
                          }
                        }
                      }
                    }
                  }
                } catch {
                  /* ignore */
                }
              });
            }
          }
        }
      }
    } catch (err) {
      console.error("[glyphExtraction] GSUB parse error:", err);
    }
  }

  if (opentypeFont.glyphs && opentypeFont.numGlyphs) {
    for (let i = 0; i < opentypeFont.numGlyphs; i++) {
      try {
        const glyph = opentypeFont.glyphs.get(i);
        if (glyph == null || glyph.unicode == null || seenUnicodes.has(glyph.unicode)) continue;

        seenUnicodes.add(glyph.unicode);
        const char = String.fromCodePoint(glyph.unicode);
        const unicodeHex = glyph.unicode.toString(16).toUpperCase().padStart(4, "0");
        const unicodeFeatures = Array.from(unicodeToFeatures.get(glyph.unicode) ?? []);
        const indexFeatures = Array.from(glyphIndexToFeatures.get(i) ?? []);

        extractedGlyphs.push({
          char,
          unicode: `U+${unicodeHex}`,
          name: glyph.name ?? "unnamed",
          unicodeNumber: glyph.unicode,
          features: Array.from(new Set([...unicodeFeatures, ...indexFeatures])),
          glyphIndex: i,
        });
      } catch {
        /* ignore malformed glyphs */
      }
    }
  }

  extractedGlyphs.sort((a, b) => {
    if (a.unicodeNumber != null && b.unicodeNumber != null)
      return a.unicodeNumber - b.unicodeNumber;
    return a.unicodeNumber == null ? 1 : -1;
  });

  return extractedGlyphs;
}
