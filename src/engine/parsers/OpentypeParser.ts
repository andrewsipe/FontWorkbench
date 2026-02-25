// @ts-nocheck — Untyped third-party APIs (opentype.js); type checking disabled for this file.
/**
 * Opentype.js parser wrapper
 * Normalizes opentype.js API to unified ParsedFont interface
 * Phase 1: Foundation parser
 */

import opentype from "opentype.js";
import type {
  AxisData,
  FvarTableData,
  GposTableData,
  GsubTableData,
  MetricsTableData,
  NameTableData,
  ParsedFont,
} from "../../types/extractors.types";
import {
  findTableOffset,
  quickParseBinary,
  readNameTableRecords,
  readOS2TableFields,
  readPostTableFields,
} from "./RawTableParser";

/**
 * Extract name table from opentype font
 * Checks all platforms (Windows 3, Mac 1) and all encodings
 * Uses binary parsing as fallback for missing Name IDs (3, 5, 16, 17)
 */
function extractNameTable(opentypeFont: any, fontBuffer?: ArrayBuffer): NameTableData | null {
  if (!opentypeFont || !opentypeFont.tables || !opentypeFont.tables.name) {
    return null;
  }

  const nameTable: NameTableData = {};

  try {
    // Opentype.js provides tables.name.records array
    const records = opentypeFont.tables.name.records || [];

    for (const record of records) {
      const nameID = record.nameID;
      if (typeof nameID === "number" && nameID >= 0) {
        // Prefer string property, fallback to decoding
        let value: string | null = null;

        if (typeof record.string === "string" && record.string.length > 0) {
          value = record.string.trim();
        } else if (record.value || record.bytes || record.raw) {
          // Try to decode
          const raw = record.value || record.bytes || record.raw;
          try {
            if (record.platformID === 3 || record.platformID === 0) {
              // Windows Unicode (UTF-16BE)
              value = new TextDecoder("utf-16be")
                .decode(new Uint8Array(raw))
                .replace(/\0/g, "")
                .trim();
            } else if (record.platformID === 1) {
              // Mac Roman (single byte encoding)
              value = new TextDecoder("macintosh")
                .decode(new Uint8Array(raw))
                .replace(/\0/g, "")
                .trim();
            } else {
              // Try UTF-8 as fallback
              value = new TextDecoder("utf-8")
                .decode(new Uint8Array(raw))
                .replace(/\0/g, "")
                .trim();
            }
          } catch {
            // Decoding failed, skip this record
            continue;
          }
        }

        if (value && value.length > 0) {
          // Prefer Windows Unicode English, then Mac English, then any match
          // CRITICAL: For priority Name IDs (3, 5, 16, 17), accept any platform/language
          const priorityNameIDs = [3, 5, 16, 17];
          const isPriority = priorityNameIDs.includes(nameID);

          const isWindowsEnglish =
            record.platformID === 3 &&
            (record.encodingID === 1 || record.encodingID === 0) &&
            record.languageID === 0x0409;

          const isMacEnglish =
            record.platformID === 1 && record.encodingID === 0 && record.languageID === 0;

          // For priority Name IDs, accept any match if not already found
          // For others, prefer Windows/Mac English
          if (!nameTable[nameID] || isWindowsEnglish || isMacEnglish || isPriority) {
            nameTable[nameID] = value;
          }
        }
      }
    }

    // Also check opentypeFont.names (semantic accessor) - this is often more reliable
    if (opentypeFont.names && typeof opentypeFont.names === "object") {
      // Opentype.js names object uses semantic keys, not numeric nameIDs
      // Map semantic names to nameIDs
      const semanticToNameID: Record<string, number> = {
        copyright: 0,
        fontFamily: 1,
        fontSubfamily: 2,
        uniqueID: 3,
        fullName: 4,
        version: 5,
        postScriptName: 6,
        trademark: 7,
        manufacturer: 8,
        designer: 9,
        description: 10,
        manufacturerURL: 11,
        designerURL: 12,
        license: 13,
        licenseURL: 14,
        preferredFamily: 16,
        preferredSubfamily: 17,
        compatibleFullName: 18,
        sampleText: 19,
      };

      for (const [key, localizedName] of Object.entries(opentypeFont.names)) {
        // Try to get nameID from semantic key
        const nameID = semanticToNameID[key];
        if (nameID !== undefined) {
          let value: string | null = null;

          if (typeof localizedName === "string") {
            value = localizedName.trim();
          } else if (typeof localizedName === "object" && localizedName !== null) {
            // Try English first, then any value
            value =
              (
                (localizedName as any).en ||
                (localizedName as any)["en-US"] ||
                Object.values(localizedName)[0]
              )?.trim() || null;
          }

          if (value && value.length > 0) {
            // Overwrite if not set
            if (!nameTable[nameID]) {
              nameTable[nameID] = value;
            }
          }
        }
      }
    }

    // Binary parsing fallback for missing priority Name IDs (3, 5, 16, 17)
    const priorityNameIDs = [3, 5, 16, 17];
    const missingPriority = priorityNameIDs.filter((id) => !nameTable[id]);
    if (missingPriority.length > 0 && fontBuffer) {
      const nameTableInfo = findTableOffset(fontBuffer, "name");
      if (nameTableInfo) {
        const binaryNames = readNameTableRecords(
          fontBuffer,
          nameTableInfo.offset,
          nameTableInfo.length,
          missingPriority
        );

        // Add missing Name IDs from binary parsing
        for (const [nameID, value] of binaryNames.entries()) {
          if (!nameTable[nameID] && value) {
            nameTable[nameID] = value;
          }
        }
      }
    }
  } catch (error) {
    console.warn("[OpentypeParser] Failed to extract name table:", error);
  }

  return Object.keys(nameTable).length > 0 ? nameTable : null;
}

/**
 * Extract metrics from opentype font
 * Uses binary parsing as fallback for missing OS/2 fields
 */
function extractMetrics(opentypeFont: any, fontBuffer?: ArrayBuffer): MetricsTableData | null {
  if (!opentypeFont || !opentypeFont.tables) {
    return null;
  }

  const metrics: MetricsTableData = {};

  try {
    if (opentypeFont.tables.head) {
      metrics.unitsPerEm = opentypeFont.tables.head.unitsPerEm;
    }

    if (opentypeFont.tables["OS/2"]) {
      const os2 = opentypeFont.tables["OS/2"];
      metrics.typoAscender = os2.sTypoAscender;
      metrics.typoDescender = os2.sTypoDescender;
      metrics.typoLineGap = os2.sTypoLineGap;
      metrics.winAscent = os2.usWinAscent;
      metrics.winDescent = os2.usWinDescent;
      metrics.capHeight = os2.sCapHeight;
      metrics.xHeight = os2.sxHeight;
      // Strikeout metrics from OS/2 table
      metrics.strikeoutPosition = os2.yStrikeoutPosition;
      metrics.strikeoutSize = os2.yStrikeoutSize;
    }

    // Binary parsing fallback for missing OS/2 fields
    // Run even if library didn't parse OS/2 table - use binary parsing to fill in all OS/2 metrics
    // Use binary parsing if library didn't provide values (undefined or null)
    if (fontBuffer) {
      const os2TableInfo = findTableOffset(fontBuffer, "OS/2");
      if (os2TableInfo) {
        const binaryFields = readOS2TableFields(
          fontBuffer,
          os2TableInfo.offset,
          os2TableInfo.length
        );

        // Fill in missing fields from binary parsing
        // Check for both undefined and null (library may set null instead of undefined)
        if (
          (metrics.typoAscender === undefined || metrics.typoAscender === null) &&
          binaryFields.sTypoAscender !== undefined
        ) {
          metrics.typoAscender = binaryFields.sTypoAscender;
        }
        if (
          (metrics.typoDescender === undefined || metrics.typoDescender === null) &&
          binaryFields.sTypoDescender !== undefined
        ) {
          metrics.typoDescender = binaryFields.sTypoDescender;
        }
        if (
          (metrics.typoLineGap === undefined || metrics.typoLineGap === null) &&
          binaryFields.sTypoLineGap !== undefined
        ) {
          metrics.typoLineGap = binaryFields.sTypoLineGap;
        }
        if (
          (metrics.winAscent === undefined || metrics.winAscent === null) &&
          binaryFields.usWinAscent !== undefined
        ) {
          metrics.winAscent = binaryFields.usWinAscent;
        }
        if (
          (metrics.winDescent === undefined || metrics.winDescent === null) &&
          binaryFields.usWinDescent !== undefined
        ) {
          metrics.winDescent = binaryFields.usWinDescent;
        }
        if (
          (metrics.xHeight === undefined || metrics.xHeight === null) &&
          binaryFields.sxHeight !== undefined
        ) {
          metrics.xHeight = binaryFields.sxHeight;
        }
        if (
          (metrics.capHeight === undefined || metrics.capHeight === null) &&
          binaryFields.sCapHeight !== undefined
        ) {
          metrics.capHeight = binaryFields.sCapHeight;
        }
        // Fill in strikeout metrics from binary parsing
        if (
          (metrics.strikeoutPosition === undefined || metrics.strikeoutPosition === null) &&
          binaryFields.yStrikeoutPosition !== undefined
        ) {
          metrics.strikeoutPosition = binaryFields.yStrikeoutPosition;
        }
        if (
          (metrics.strikeoutSize === undefined || metrics.strikeoutSize === null) &&
          binaryFields.yStrikeoutSize !== undefined
        ) {
          metrics.strikeoutSize = binaryFields.yStrikeoutSize;
        }
      }
    }

    if (opentypeFont.tables.hhea) {
      metrics.hheaAscender = opentypeFont.tables.hhea.ascender;
      metrics.hheaDescender = opentypeFont.tables.hhea.descender;
      metrics.hheaLineGap = opentypeFont.tables.hhea.lineGap;
    }

    // Underline metrics from POST table (not head table)
    if (opentypeFont.tables.post) {
      metrics.underlinePosition = opentypeFont.tables.post.underlinePosition;
      metrics.underlineThickness = opentypeFont.tables.post.underlineThickness;
    }

    // Binary parsing fallback for underline metrics from POST table
    if (fontBuffer) {
      const postTableInfo = findTableOffset(fontBuffer, "post");
      if (postTableInfo) {
        const binaryFields = readPostTableFields(
          fontBuffer,
          postTableInfo.offset,
          postTableInfo.length
        );

        // Fill in missing underline fields from binary parsing
        if (
          (metrics.underlinePosition === undefined || metrics.underlinePosition === null) &&
          binaryFields.underlinePosition !== undefined
        ) {
          metrics.underlinePosition = binaryFields.underlinePosition;
        }
        if (
          (metrics.underlineThickness === undefined || metrics.underlineThickness === null) &&
          binaryFields.underlineThickness !== undefined
        ) {
          metrics.underlineThickness = binaryFields.underlineThickness;
        }
      }
    }
  } catch (error) {
    console.warn("[OpentypeParser] Failed to extract metrics:", error);
  }

  return Object.keys(metrics).length > 0 ? metrics : null;
}

/**
 * Extract variation axes from opentype font
 */
function extractVariationAxes(opentypeFont: any): AxisData[] | null {
  if (!opentypeFont || !opentypeFont.tables || !opentypeFont.tables.fvar) {
    return null;
  }

  try {
    const fvar = opentypeFont.tables.fvar;
    const axes: AxisData[] = [];

    if (fvar.axes && Array.isArray(fvar.axes)) {
      for (const axis of fvar.axes) {
        axes.push({
          tag: axis.tag || axis.axisTag || "",
          name: axis.name || null,
          min: axis.min ?? axis.minValue ?? 0,
          max: axis.max ?? axis.maxValue ?? 0,
          default: axis.default ?? axis.defaultValue ?? 0,
        });
      }
    }

    return axes.length > 0 ? axes : null;
  } catch (error) {
    console.warn("[OpentypeParser] Failed to extract variation axes:", error);
    return null;
  }
}

/**
 * Extract fvar table data from opentype font
 */
function extractFvarTable(opentypeFont: any): FvarTableData | null {
  if (!opentypeFont || !opentypeFont.tables || !opentypeFont.tables.fvar) {
    return null;
  }

  try {
    const axes = extractVariationAxes(opentypeFont);

    return {
      axes: axes || undefined,
      // Instances will be extracted separately in InstanceExtractor
      instances: undefined,
    };
  } catch (error) {
    console.warn("[OpentypeParser] Failed to extract fvar table:", error);
    return null;
  }
}

/**
 * Extract GSUB table data from opentype font
 */
function extractGsubTable(opentypeFont: any): GsubTableData | null {
  if (!opentypeFont || !opentypeFont.tables || !opentypeFont.tables.gsub) {
    return null;
  }

  try {
    const gsub = opentypeFont.tables.gsub;
    const features: Array<{ tag: string; featureParams?: any }> = [];

    if (gsub.features && Array.isArray(gsub.features)) {
      for (const feature of gsub.features) {
        if (feature?.tag) {
          features.push({
            tag: feature.tag,
            featureParams: feature.featureParams,
          });
        }
      }
    }

    return features.length > 0 ? { features } : null;
  } catch (error) {
    console.warn("[OpentypeParser] Failed to extract GSUB table:", error);
    return null;
  }
}

/**
 * Extract GPOS table data from opentype font
 */
function extractGposTable(opentypeFont: any): GposTableData | null {
  if (!opentypeFont || !opentypeFont.tables || !opentypeFont.tables.gpos) {
    return null;
  }

  try {
    const gpos = opentypeFont.tables.gpos;
    const features: Array<{ tag: string; featureParams?: any }> = [];

    if (gpos.features && Array.isArray(gpos.features)) {
      for (const feature of gpos.features) {
        if (feature?.tag) {
          features.push({
            tag: feature.tag,
            featureParams: feature.featureParams,
          });
        }
      }
    }

    return features.length > 0 ? { features } : null;
  } catch (error) {
    console.warn("[OpentypeParser] Failed to extract GPOS table:", error);
    return null;
  }
}

/**
 * Quick parse for immediate display.
 * Extracts only essential metadata (family, style, numGlyphs).
 * Takes ~50-100ms instead of 300-500ms for full parse.
 */
export function parseOpentypeQuick(arrayBuffer: ArrayBuffer):
  | {
      success: true;
      font: any;
      familyName: string;
      styleName: string;
      numGlyphs: number;
      unitsPerEm: number;
    }
  | { success: false; error: string } {
  try {
    const font = opentype.parse(arrayBuffer);

    if (!font) {
      return { success: false, error: "Failed to parse font" };
    }

    const names = font.names as
      | {
          fontFamily?: { en?: string };
          preferredFamily?: { en?: string };
          fontSubfamily?: { en?: string };
          preferredSubfamily?: { en?: string };
        }
      | undefined;
    const familyName =
      names?.fontFamily?.en ??
      names?.preferredFamily?.en ??
      (typeof (font as any).familyName === "string" ? (font as any).familyName : "Unknown");
    const styleName =
      names?.fontSubfamily?.en ??
      names?.preferredSubfamily?.en ??
      (typeof (font as any).subfamilyName === "string" ? (font as any).subfamilyName : "Regular");

    return {
      success: true,
      font,
      familyName: String(familyName).trim() || "Unknown",
      styleName: String(styleName).trim() || "Regular",
      numGlyphs: font.numGlyphs ?? 0,
      unitsPerEm: font.unitsPerEm ?? 1000,
    };
  } catch (error) {
    // Fallback: opentype.js can throw on GSUB/GPOS (e.g. "ClassDef format must be 1 or 2").
    // Use binary-only parse so the font still loads for display.
    const binary = quickParseBinary(arrayBuffer);
    if (binary) {
      return {
        success: true,
        font: null,
        familyName: binary.familyName,
        styleName: binary.styleName,
        numGlyphs: binary.numGlyphs,
        unitsPerEm: binary.unitsPerEm,
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Parse font using opentype.js
 * Returns unified ParsedFont interface or null on failure
 */
export function parseOpentype(buffer: ArrayBuffer | Uint8Array): ParsedFont | null {
  try {
    // Ensure we have ArrayBuffer (not SharedArrayBuffer)
    let arrayBuffer: ArrayBuffer;
    if (buffer instanceof ArrayBuffer) {
      arrayBuffer = buffer;
    } else {
      const sliced = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      // Convert SharedArrayBuffer to ArrayBuffer if needed
      if (sliced instanceof SharedArrayBuffer) {
        const uint8 = new Uint8Array(sliced);
        arrayBuffer = new ArrayBuffer(uint8.length);
        new Uint8Array(arrayBuffer).set(uint8);
      } else {
        arrayBuffer = sliced;
      }
    }

    const opentypeFont = opentype.parse(arrayBuffer);

    if (!opentypeFont) {
      return null;
    }

    // Create ParsedFont with accessor methods
    return {
      source: "opentype",
      raw: opentypeFont,
      getNameTable: () => extractNameTable(opentypeFont, arrayBuffer),
      getMetricsTable: () => extractMetrics(opentypeFont, arrayBuffer),
      getVariationAxes: () => extractVariationAxes(opentypeFont),
      getFvarTable: () => extractFvarTable(opentypeFont),
      getGsubTable: () => extractGsubTable(opentypeFont),
      getGposTable: () => extractGposTable(opentypeFont),
    };
  } catch (error) {
    // Fallback: opentype.js can throw on GSUB/GPOS (e.g. "ClassDef format must be 1 or 2").
    // Use binary-only parse and return minimal ParsedFont so Phase 2 can extract basic metadata.
    let arrayBuffer: ArrayBuffer;
    if (buffer instanceof ArrayBuffer) {
      arrayBuffer = buffer;
    } else {
      const sliced = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      if (sliced instanceof SharedArrayBuffer) {
        const uint8 = new Uint8Array(sliced);
        arrayBuffer = new ArrayBuffer(uint8.length);
        new Uint8Array(arrayBuffer).set(uint8);
      } else {
        arrayBuffer = sliced;
      }
    }

    const binary = quickParseBinary(arrayBuffer);
    if (binary) {
      // Return minimal ParsedFont with binary-only data
      const minimalNameTable: NameTableData = {
        1: binary.familyName,
        2: binary.styleName,
        16: binary.familyName,
        17: binary.styleName,
      };
      const minimalMetrics: MetricsTableData = {
        unitsPerEm: binary.unitsPerEm,
      };

      return {
        source: "opentype",
        raw: null,
        getNameTable: () => minimalNameTable,
        getMetricsTable: () => minimalMetrics,
        getVariationAxes: () => null,
        getFvarTable: () => null,
        getGsubTable: () => null,
        getGposTable: () => null,
      };
    }

    console.warn("[OpentypeParser] Failed to parse font (opentype.js and binary fallback):", error);
    return null;
  }
}
