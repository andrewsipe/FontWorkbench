// @ts-nocheck — Untyped third-party APIs (fontkit); type checking disabled for this file.
/**
 * Fontkit parser wrapper
 * Normalizes fontkit API to unified ParsedFont interface
 * Phase 1: Foundation parser
 */

import { Buffer } from "buffer";
import * as fontkitModule from "fontkit";
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
  readNameTableRecords,
  readOS2TableFields,
  readPostTableFields,
} from "./RawTableParser";

// Try multiple access patterns to find the create function
const fontkit: any = (() => {
  try {
    // Helper to safely enable error logging
    const enableErrorLogging = (fk: any) => {
      if (fk && fk.logErrors !== undefined) {
        try {
          fk.logErrors = true;
        } catch {
          // Property is read-only, which is fine
        }
      }
    };

    // Check if create is directly on the module (named export)
    if (fontkitModule && typeof (fontkitModule as any).create === "function") {
      const fk = fontkitModule as any;
      enableErrorLogging(fk);
      return fk;
    }

    // Check if there's a default export
    if (
      (fontkitModule as any).default &&
      typeof (fontkitModule as any).default.create === "function"
    ) {
      const fk = (fontkitModule as any).default;
      enableErrorLogging(fk);
      return fk;
    }

    // Fallback: return the module as-is
    enableErrorLogging(fontkitModule);
    return fontkitModule;
  } catch (e) {
    console.warn("[FontkitParser] Fontkit module access failed:", e);
    return null;
  }
})();

/**
 * Extract name table from fontkit font
 * Checks all platforms (Windows 3, Mac 1) and all encodings
 * Uses binary parsing as fallback for missing Name IDs (3, 5, 16, 17)
 */
function extractNameTable(fontkitFont: any, fontBuffer?: ArrayBuffer): NameTableData | null {
  if (!fontkitFont) {
    return null;
  }

  const nameTable: NameTableData = {};

  try {
    // Strategy 1: Use fontkit's name.get() method if available (most reliable)
    // CRITICAL: Try multiple platform/language combinations to find Name IDs 3, 5, 16, 17
    if (fontkitFont.name && typeof fontkitFont.name.get === "function") {
      const standardNameIDs = [0, 1, 2, 3, 4, 5, 6, 16, 17, 18];

      // Platform/language combinations to try (in priority order)
      const platformCombos = [
        { platformID: 3, encodingID: 1, languageID: 0x0409 }, // Windows Unicode English
        { platformID: 3, encodingID: 0, languageID: 0x0409 }, // Windows Unicode English (alternate encoding)
        { platformID: 1, encodingID: 0, languageID: 0 }, // Mac Roman English
        { platformID: 0, encodingID: 3, languageID: 0 }, // Unicode (deprecated but sometimes used)
      ];

      for (const nameID of standardNameIDs) {
        // Try each platform/language combo until we find a match
        for (const combo of platformCombos) {
          try {
            const name = fontkitFont.name.get(
              nameID,
              combo.platformID,
              combo.encodingID,
              combo.languageID
            );
            if (name && (typeof name === "string" ? name.trim().length > 0 : true)) {
              nameTable[nameID] = typeof name === "string" ? name : String(name);
              break; // Found it, move to next nameID
            }
          } catch {}
        }
      }
    }

    // Strategy 2: Extract from name.records array (check all platforms)
    // CRITICAL: This is important for Name IDs 3, 5, 16, 17 which may not be in name.get()
    if (fontkitFont.name) {
      const records = fontkitFont.name.records || fontkitFont.name.names || [];

      if (Array.isArray(records)) {
        // Priority Name IDs we're looking for: 3, 5, 16, 17
        const priorityNameIDs = [3, 5, 16, 17];

        for (const record of records) {
          const nameID = record.nameID ?? record.id;
          if (typeof nameID === "number" && nameID >= 0) {
            let value: string | null = null;

            // Try multiple ways to get the string value
            if (typeof record.string === "string" && record.string.length > 0) {
              value = record.string;
            } else if (typeof record.name === "string" && record.name.length > 0) {
              value = record.name;
            } else if (typeof record.toUnicode === "function") {
              try {
                value = record.toUnicode();
              } catch {
                // Decoding failed
              }
            } else if (record.value) {
              // Try to decode raw value
              try {
                if (record.platformID === 3 || record.platformID === 0) {
                  value = new TextDecoder("utf-16be")
                    .decode(new Uint8Array(record.value))
                    .replace(/\0/g, "")
                    .trim();
                } else if (record.platformID === 1) {
                  value = new TextDecoder("macintosh")
                    .decode(new Uint8Array(record.value))
                    .replace(/\0/g, "")
                    .trim();
                }
              } catch {
                // Decoding failed
              }
            }

            if (value && typeof value === "string" && value.trim().length > 0) {
              // Prefer Windows Unicode English, but accept any if not found
              // CRITICAL: For priority Name IDs (3, 5, 16, 17), accept any platform/language
              const isWindowsEnglish =
                record.platformID === 3 &&
                (record.encodingID === 1 || record.encodingID === 0) &&
                record.languageID === 0x0409;

              const isMacEnglish =
                record.platformID === 1 && record.encodingID === 0 && record.languageID === 0;

              const isPriority = priorityNameIDs.includes(nameID);

              // For priority Name IDs, accept any match if not already found
              // For others, prefer Windows/Mac English
              if (!nameTable[nameID] || isWindowsEnglish || isMacEnglish || isPriority) {
                nameTable[nameID] = value;
              }
            }
          }
        }
      }
    }

    // Strategy 3: Use fontkit's direct properties as fallback for standard nameIDs
    if (!nameTable[1] && fontkitFont.familyName) {
      nameTable[1] = fontkitFont.familyName;
    }
    if (!nameTable[2] && fontkitFont.subfamilyName) {
      nameTable[2] = fontkitFont.subfamilyName;
    }
    if (!nameTable[4] && fontkitFont.fullName) {
      nameTable[4] = fontkitFont.fullName;
    }
    if (!nameTable[6] && fontkitFont.postscriptName) {
      nameTable[6] = fontkitFont.postscriptName;
    }
  } catch (error) {
    console.warn("[FontkitParser] Failed to extract name table:", error);
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

  // Debug: Log missing priority Name IDs after binary parsing
  const stillMissing = priorityNameIDs.filter((id) => !nameTable[id]);
  if (stillMissing.length > 0 && fontkitFont.name) {
    const records = fontkitFont.name.records || fontkitFont.name.names || [];
    const foundNameIDs = Array.isArray(records)
      ? records.map((r: any) => r.nameID ?? r.id).filter((id: any) => typeof id === "number")
      : [];
    console.log(
      `[FontkitParser] Missing priority Name IDs after binary parsing: ${stillMissing.join(", ")}. Found Name IDs in records:`,
      foundNameIDs
    );
  }

  return Object.keys(nameTable).length > 0 ? nameTable : null;
}

/**
 * Extract metrics from fontkit font
 * Uses binary parsing as fallback for missing OS/2 fields
 */
function extractMetrics(fontkitFont: any, fontBuffer?: ArrayBuffer): MetricsTableData | null {
  if (!fontkitFont) {
    return null;
  }

  const metrics: MetricsTableData = {};

  try {
    if (fontkitFont.head) {
      metrics.unitsPerEm = fontkitFont.head.unitsPerEm;
    }

    if (fontkitFont["OS/2"]) {
      const os2 = fontkitFont["OS/2"];
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

    if (fontkitFont.hhea) {
      metrics.hheaAscender = fontkitFont.hhea.ascender;
      metrics.hheaDescender = fontkitFont.hhea.descender;
      metrics.hheaLineGap = fontkitFont.hhea.lineGap;
    }

    // Underline metrics from POST table (not head table)
    if (fontkitFont.post) {
      metrics.underlinePosition = fontkitFont.post.underlinePosition;
      metrics.underlineThickness = fontkitFont.post.underlineThickness;
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
    console.warn("[FontkitParser] Failed to extract metrics:", error);
  }

  return Object.keys(metrics).length > 0 ? metrics : null;
}

/**
 * Extract variation axes from fontkit font
 */
function extractVariationAxes(fontkitFont: any): AxisData[] | null {
  if (!fontkitFont || !fontkitFont.variationAxes) {
    return null;
  }

  try {
    const axes: AxisData[] = [];
    const variationAxes = fontkitFont.variationAxes;

    // Fontkit returns variationAxes as an object keyed by tag
    if (typeof variationAxes === "object" && !Array.isArray(variationAxes)) {
      for (const [tag, axis] of Object.entries(variationAxes)) {
        const axisData = axis as any;
        axes.push({
          tag,
          name: axisData.name || null,
          min: axisData.min ?? axisData.minValue ?? 0,
          max: axisData.max ?? axisData.maxValue ?? 0,
          default: axisData.default ?? axisData.defaultValue ?? 0,
        });
      }
    }

    return axes.length > 0 ? axes : null;
  } catch (error) {
    console.warn("[FontkitParser] Failed to extract variation axes:", error);
    return null;
  }
}

/**
 * Extract fvar table data from fontkit font
 */
function extractFvarTable(fontkitFont: any): FvarTableData | null {
  if (!fontkitFont || !fontkitFont.fvar) {
    return null;
  }

  try {
    const axes = extractVariationAxes(fontkitFont);

    return {
      axes: axes || undefined,
      // Instances will be extracted separately in InstanceExtractor
      instances: undefined,
    };
  } catch (error) {
    console.warn("[FontkitParser] Failed to extract fvar table:", error);
    return null;
  }
}

/**
 * Extract GSUB table data from fontkit font
 */
function extractGsubTable(fontkitFont: any): GsubTableData | null {
  if (!fontkitFont || !fontkitFont.GSUB) {
    return null;
  }

  try {
    const gsub = fontkitFont.GSUB;
    const features: Array<{ tag: string; featureParams?: any }> = [];

    // Fontkit GSUB.featureList can be an object or array
    const featureList = gsub.featureList || [];
    const featuresArray = Array.isArray(featureList) ? featureList : Object.values(featureList);

    for (const feature of featuresArray) {
      if (feature?.tag) {
        features.push({
          tag: feature.tag,
          featureParams: feature.featureParams,
        });
      }
    }

    return features.length > 0 ? { features } : null;
  } catch (error) {
    console.warn("[FontkitParser] Failed to extract GSUB table:", error);
    return null;
  }
}

/**
 * Extract GPOS table data from fontkit font
 */
function extractGposTable(fontkitFont: any): GposTableData | null {
  if (!fontkitFont || !fontkitFont.GPOS) {
    return null;
  }

  try {
    const gpos = fontkitFont.GPOS;
    const features: Array<{ tag: string; featureParams?: any }> = [];

    // Fontkit GPOS.featureList can be an object or array
    const featureList = gpos.featureList || [];
    const featuresArray = Array.isArray(featureList) ? featureList : Object.values(featureList);

    for (const feature of featuresArray) {
      if (feature?.tag) {
        features.push({
          tag: feature.tag,
          featureParams: feature.featureParams,
        });
      }
    }

    return features.length > 0 ? { features } : null;
  } catch (error) {
    console.warn("[FontkitParser] Failed to extract GPOS table:", error);
    return null;
  }
}

/**
 * Parse font using fontkit
 * Returns unified ParsedFont interface or null on failure
 */
export function parseFontkit(buffer: ArrayBuffer | Uint8Array): ParsedFont | null {
  if (!fontkit || typeof fontkit.create !== "function") {
    return null;
  }

  try {
    // Fontkit expects Node.js Buffer, not ArrayBuffer
    // Keep ArrayBuffer reference for binary parsing fallback
    // Ensure we have a true ArrayBuffer (not SharedArrayBuffer)
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
    const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const nodeBuffer = Buffer.from(uint8Array);
    const fontkitFont = fontkit.create(nodeBuffer);

    if (!fontkitFont) {
      return null;
    }

    // Create ParsedFont with accessor methods
    return {
      source: "fontkit",
      raw: fontkitFont,
      getNameTable: () => extractNameTable(fontkitFont, arrayBuffer),
      getMetricsTable: () => extractMetrics(fontkitFont, arrayBuffer),
      getVariationAxes: () => extractVariationAxes(fontkitFont),
      getFvarTable: () => extractFvarTable(fontkitFont),
      getGsubTable: () => extractGsubTable(fontkitFont),
      getGposTable: () => extractGposTable(fontkitFont),
    };
  } catch (error) {
    console.warn("[FontkitParser] Failed to parse font:", error);
    return null;
  }
}
