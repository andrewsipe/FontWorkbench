/**
 * Raw table parser for binary font table parsing
 * Handles fvar and name table binary parsing when library parsers fail
 * Phase 1: Foundation parser
 */

import type { AxisData, FvarTableData } from "../../types/extractors.types";

/**
 * Parse fvar table from binary data
 * Extracts axes and instances with nameIDs
 */
export function parseFvarTable(
  buffer: ArrayBuffer,
  offset: number,
  length: number
): FvarTableData | null {
  try {
    const view = new DataView(buffer, offset, length);

    // Read fvar header
    const majorVersion = view.getUint16(0, false);
    const minorVersion = view.getUint16(2, false);
    const axesArrayOffset = view.getUint16(4, false);
    // const reserved = view.getUint16(6, false); // Reserved field, not used
    const axisCount = view.getUint16(8, false);
    const axisSize = view.getUint16(10, false);
    const instanceCount = view.getUint16(12, false);
    const instanceSize = view.getUint16(14, false);

    if (majorVersion !== 1) {
      console.warn(`[RawTableParser] Unsupported fvar version: ${majorVersion}.${minorVersion}`);
      return null;
    }

    const axes: AxisData[] = [];
    let currentOffset = axesArrayOffset;

    // Parse axes
    for (let i = 0; i < axisCount; i++) {
      // Bounds check: ensure we have enough space for this axis
      if (currentOffset + axisSize > length) {
        console.warn(
          `[RawTableParser] Axis ${i} extends beyond table bounds (offset: ${currentOffset}, size: ${axisSize}, table length: ${length})`
        );
        break;
      }

      const axisTag = String.fromCharCode(
        view.getUint8(currentOffset),
        view.getUint8(currentOffset + 1),
        view.getUint8(currentOffset + 2),
        view.getUint8(currentOffset + 3)
      );

      const minValue = view.getInt32(currentOffset + 4, false) / 65536.0;
      const defaultValue = view.getInt32(currentOffset + 8, false) / 65536.0;
      const maxValue = view.getInt32(currentOffset + 12, false) / 65536.0;
      // const flags = view.getUint16(currentOffset + 16, false); // Flags not used in Phase 1
      // const axisNameID = view.getUint16(currentOffset + 18, false); // NameID resolved separately

      axes.push({
        tag: axisTag,
        name: null, // Name will be resolved from name table
        min: minValue,
        max: maxValue,
        default: defaultValue,
      });

      currentOffset += axisSize;
    }

    // Parse instances
    const instances: Array<{
      coordinates: number[];
      subfamilyNameID?: number;
      postScriptNameID?: number;
    }> = [];

    for (let i = 0; i < instanceCount; i++) {
      // Bounds check: ensure we have enough space for instance header (at least 4 bytes)
      if (currentOffset + 4 > length) {
        console.warn(
          `[RawTableParser] Instance ${i} header extends beyond table bounds (offset: ${currentOffset}, table length: ${length})`
        );
        break;
      }

      const subfamilyNameID = view.getUint16(currentOffset, false);
      // const flags = view.getUint16(currentOffset + 2, false); // Flags not used in Phase 1
      const coordinatesOffset = currentOffset + 4;

      // Bounds check: ensure we have enough space for all coordinates
      const coordinatesSize = axisCount * 4;
      if (coordinatesOffset + coordinatesSize > length) {
        console.warn(
          `[RawTableParser] Instance ${i} coordinates extend beyond table bounds (offset: ${coordinatesOffset}, size: ${coordinatesSize}, table length: ${length})`
        );
        break;
      }

      // Coordinates are stored as Fixed (16.16) values, one per axis
      const coordinates: number[] = [];
      for (let j = 0; j < axisCount; j++) {
        const coordValue = view.getInt32(coordinatesOffset + j * 4, false) / 65536.0;
        coordinates.push(coordValue);
      }

      // Check for postScriptNameID (OpenType 1.8+)
      // It's stored after coordinates if present
      // Note: view coordinates are relative to table start (0-based), so compare with length, not offset + length
      let postScriptNameID: number | undefined;
      const postScriptNameIDOffset = coordinatesOffset + coordinatesSize;
      if (postScriptNameIDOffset + 2 <= length) {
        // Only read if we have space (some fonts may not have this field)
        try {
          postScriptNameID = view.getUint16(postScriptNameIDOffset, false);
          // If it's 0xFFFF, it means "not present"
          if (postScriptNameID === 0xffff) {
            postScriptNameID = undefined;
          }
        } catch (_error) {
          // If reading fails, just skip it (font may not have this field)
          postScriptNameID = undefined;
        }
      }

      instances.push({
        coordinates,
        subfamilyNameID: subfamilyNameID !== 0xffff ? subfamilyNameID : undefined,
        postScriptNameID,
      });

      // Bounds check before moving to next instance
      if (currentOffset + instanceSize > length) {
        console.warn(
          `[RawTableParser] Instance ${i} extends beyond table bounds (offset: ${currentOffset}, size: ${instanceSize}, table length: ${length})`
        );
        break;
      }

      currentOffset += instanceSize;
    }

    return {
      axes: axes.length > 0 ? axes : undefined,
      instances: instances.length > 0 ? instances : undefined,
    };
  } catch (error) {
    console.warn("[RawTableParser] Failed to parse fvar table:", error);
    return null;
  }
}

/**
 * Get all available table tags from SFNT structure
 * Reads numTables at offset 4, iterates through table directory starting at offset 12
 * Returns 4-character tags exactly as they appear (e.g., 'OS/2', 'head')
 */
export function getAvailableTableTags(buffer: ArrayBuffer): string[] {
  const tags: string[] = [];

  try {
    const view = new DataView(buffer);

    // Read SFNT header
    const numTables = view.getUint16(4, false);

    // Iterate through table directory (starting at offset 12)
    for (let i = 0; i < numTables; i++) {
      const entryOffset = 12 + i * 16;

      // Extract 4-character tag exactly as it appears
      const tag = String.fromCharCode(
        view.getUint8(entryOffset),
        view.getUint8(entryOffset + 1),
        view.getUint8(entryOffset + 2),
        view.getUint8(entryOffset + 3)
      );

      // No filtering - if it's 4 characters in the table directory, it's valid
      tags.push(tag);
    }
  } catch (error) {
    console.warn("[RawTableParser] Failed to get available table tags:", error);
  }

  return tags;
}

export interface TableDirectoryEntry {
  tag: string;
  offset: number;
  length: number;
  checksum: number;
}

/**
 * Get full table directory (tag, offset, length, checksum) from SFNT structure.
 * Used by Font Source for parse-on-expand and checksum display.
 */
export function getTableDirectory(buffer: ArrayBuffer): TableDirectoryEntry[] {
  const entries: TableDirectoryEntry[] = [];
  try {
    const view = new DataView(buffer);
    const numTables = view.getUint16(4, false);
    for (let i = 0; i < numTables; i++) {
      const entryOffset = 12 + i * 16;
      const tag = String.fromCharCode(
        view.getUint8(entryOffset),
        view.getUint8(entryOffset + 1),
        view.getUint8(entryOffset + 2),
        view.getUint8(entryOffset + 3)
      );
      const checksum = view.getUint32(entryOffset + 4, false);
      const offset = view.getUint32(entryOffset + 8, false);
      const length = view.getUint32(entryOffset + 12, false);
      entries.push({ tag, offset, length, checksum });
    }
  } catch (error) {
    console.warn("[RawTableParser] Failed to get table directory:", error);
  }
  return entries;
}

/**
 * Find table offset in SFNT structure
 */
export function findTableOffset(
  buffer: ArrayBuffer,
  tableTag: string
): { offset: number; length: number } | null {
  try {
    const view = new DataView(buffer);

    // Read SFNT header
    // const sfntVersion = view.getUint32(0, false); // Version not used for table lookup
    const numTables = view.getUint16(4, false);

    // Search for table
    for (let i = 0; i < numTables; i++) {
      const entryOffset = 12 + i * 16;
      const tag = String.fromCharCode(
        view.getUint8(entryOffset),
        view.getUint8(entryOffset + 1),
        view.getUint8(entryOffset + 2),
        view.getUint8(entryOffset + 3)
      );

      if (tag === tableTag) {
        // const checksum = view.getUint32(entryOffset + 4, false); // Checksum not used in Phase 1
        const offset = view.getUint32(entryOffset + 8, false);
        const length = view.getUint32(entryOffset + 12, false);

        return { offset, length };
      }
    }

    return null;
  } catch (error) {
    console.warn(`[RawTableParser] Failed to find table ${tableTag}:`, error);
    return null;
  }
}

/**
 * Read OS/2 table fields from binary data.
 * Offsets follow the OpenType OS/2 spec: v0 ends at usWinDescent (78); v1 adds ulCodePageRange (through 86);
 * v2 adds sxHeight, sCapHeight, usDefaultChar, usBreakChar, usMaxContext (through 96); v5 adds optical sizes (96-99).
 * yStrikeoutSize at 26-27, yStrikeoutPosition at 28-29 (not at 90/92).
 */
export function readOS2TableFields(
  buffer: ArrayBuffer,
  tableOffset: number,
  tableLength: number
): {
  xAvgCharWidth?: number;
  usWeightClass?: number;
  usWidthClass?: number;
  fsType?: number;
  ySubscriptXSize?: number;
  ySubscriptYSize?: number;
  ySubscriptXOffset?: number;
  ySubscriptYOffset?: number;
  ySuperscriptXSize?: number;
  ySuperscriptYSize?: number;
  ySuperscriptXOffset?: number;
  ySuperscriptYOffset?: number;
  yStrikeoutSize?: number;
  yStrikeoutPosition?: number;
  sFamilyClass?: number;
  vendorID?: string;
  fsSelection?: number;
  usFirstCharIndex?: number;
  usLastCharIndex?: number;
  sTypoAscender?: number;
  sTypoDescender?: number;
  sTypoLineGap?: number;
  usWinAscent?: number;
  usWinDescent?: number;
  ulCodePageRange1?: number;
  ulCodePageRange2?: number;
  sxHeight?: number;
  sCapHeight?: number;
  usDefaultChar?: number;
  usBreakChar?: number;
  usMaxContext?: number;
  usLowerOpticalPointSize?: number;
  usUpperOpticalPointSize?: number;
} {
  const result: Record<string, number | string | undefined> = {};

  try {
    const view = new DataView(buffer, tableOffset, tableLength);
    const version = view.getUint16(0, false);

    if (tableLength >= 4) result.xAvgCharWidth = view.getInt16(2, false);
    if (tableLength >= 6) result.usWeightClass = view.getUint16(4, false);
    if (tableLength >= 8) result.usWidthClass = view.getUint16(6, false);
    if (tableLength >= 10) result.fsType = view.getUint16(8, false);

    if (tableLength >= 18) {
      result.ySubscriptXSize = view.getInt16(10, false);
      result.ySubscriptYSize = view.getInt16(12, false);
      result.ySubscriptXOffset = view.getInt16(14, false);
      result.ySubscriptYOffset = view.getInt16(16, false);
    }
    if (tableLength >= 26) {
      result.ySuperscriptXSize = view.getInt16(18, false);
      result.ySuperscriptYSize = view.getInt16(20, false);
      result.ySuperscriptXOffset = view.getInt16(22, false);
      result.ySuperscriptYOffset = view.getInt16(24, false);
    }
    if (tableLength >= 30) {
      result.yStrikeoutSize = view.getInt16(26, false);
      result.yStrikeoutPosition = view.getInt16(28, false);
    }
    if (tableLength >= 32) result.sFamilyClass = view.getInt16(30, false);

    if (tableLength >= 64) {
      result.vendorID = String.fromCharCode(
        view.getUint8(58),
        view.getUint8(59),
        view.getUint8(60),
        view.getUint8(61)
      );
      result.fsSelection = view.getUint16(62, false);
    }
    if (tableLength >= 68) {
      result.usFirstCharIndex = view.getUint16(64, false);
      result.usLastCharIndex = view.getUint16(66, false);
    }
    if (tableLength >= 78) {
      result.sTypoAscender = view.getInt16(68, false);
      result.sTypoDescender = view.getInt16(70, false);
      result.sTypoLineGap = view.getInt16(72, false);
      result.usWinAscent = view.getUint16(74, false);
      result.usWinDescent = view.getUint16(76, false);
    }
    if (version >= 1 && tableLength >= 86) {
      result.ulCodePageRange1 = view.getUint32(78, false);
      result.ulCodePageRange2 = view.getUint32(82, false);
    }
    if (version >= 2 && tableLength >= 90) {
      result.sxHeight = view.getInt16(86, false);
      result.sCapHeight = view.getInt16(88, false);
    }
    if (version >= 2 && tableLength >= 96) {
      result.usDefaultChar = view.getUint16(90, false);
      result.usBreakChar = view.getUint16(92, false);
      result.usMaxContext = view.getUint16(94, false);
    }
    if (version >= 5 && tableLength >= 100) {
      result.usLowerOpticalPointSize = view.getUint16(96, false);
      result.usUpperOpticalPointSize = view.getUint16(98, false);
    }
  } catch (error) {
    console.warn("[RawTableParser] Failed to read OS/2 table fields:", error);
  }

  return result as ReturnType<typeof readOS2TableFields>;
}

/**
 * Read POST table fields from binary data
 * Uses byte offsets to read fields that may be missing from library parsers
 * POST table structure (OpenType post): 0–3 version, 4–7 italicAngle,
 * 8–9 underlinePosition (FWORD), 10–11 underlineThickness (FWORD), 12+ isFixedPitch, …
 */
export function readPostTableFields(
  buffer: ArrayBuffer,
  tableOffset: number,
  tableLength: number
): {
  underlinePosition?: number;
  underlineThickness?: number;
} {
  const result: {
    underlinePosition?: number;
    underlineThickness?: number;
  } = {};

  try {
    const view = new DataView(buffer, tableOffset, tableLength);

    // underlinePosition at offset 8 (FWORD / Int16)
    if (tableLength >= 10) {
      result.underlinePosition = view.getInt16(8, false);
    }

    // underlineThickness at offset 10 (FWORD / Int16)
    if (tableLength >= 12) {
      result.underlineThickness = view.getInt16(10, false);
    }
  } catch (error) {
    console.warn("[RawTableParser] Failed to read POST table fields:", error);
  }

  return result;
}

/**
 * Read Name table records from binary data
 * Extracts specific Name IDs (3, 5, 16, 17) that may be missing from library parsers
 */
export function readNameTableRecords(
  buffer: ArrayBuffer,
  tableOffset: number,
  tableLength: number,
  targetNameIDs: number[] = [3, 5, 16, 17]
): Map<number, string> {
  const nameMap = new Map<number, string>();

  try {
    const view = new DataView(buffer, tableOffset, tableLength);

    // Read name table header
    view.getUint16(0, false); // format (not used)
    const count = view.getUint16(2, false);
    const stringOffset = view.getUint16(4, false);

    // Parse name records
    for (let i = 0; i < count; i++) {
      const recordOffset = 6 + i * 12;
      if (recordOffset + 12 > tableLength) break;

      const platformID = view.getUint16(recordOffset, false);
      const encodingID = view.getUint16(recordOffset + 2, false);
      const languageID = view.getUint16(recordOffset + 4, false);
      const nameID = view.getUint16(recordOffset + 6, false);
      const length = view.getUint16(recordOffset + 8, false);
      const offset = view.getUint16(recordOffset + 10, false);

      // Only extract target Name IDs
      if (!targetNameIDs.includes(nameID)) continue;

      // Prefer Windows Unicode (Platform 3, Encoding 1, Language 0x0409)
      // or Mac Roman (Platform 1, Encoding 0, Language 0)
      const isPreferred =
        (platformID === 3 && (encodingID === 1 || encodingID === 0) && languageID === 0x0409) ||
        (platformID === 1 && encodingID === 0 && languageID === 0);

      // Skip if we already have a preferred entry for this nameID
      if (nameMap.has(nameID) && !isPreferred) continue;

      // Read string data
      const stringDataOffset = tableOffset + stringOffset + offset;
      if (stringDataOffset + length > buffer.byteLength) continue;

      try {
        let decoded: string | null = null;

        if (platformID === 3 || platformID === 0) {
          // Windows Unicode (UTF-16BE) or Unicode
          const bytes = new Uint8Array(buffer, stringDataOffset, length);
          decoded = new TextDecoder("utf-16be").decode(bytes).replace(/\0/g, "").trim();
        } else if (platformID === 1) {
          // Mac Roman
          const bytes = new Uint8Array(buffer, stringDataOffset, length);
          decoded = new TextDecoder("macintosh").decode(bytes).replace(/\0/g, "").trim();
        }

        if (decoded && decoded.length > 0) {
          // Overwrite if this is a preferred platform, otherwise only set if not already present
          if (isPreferred || !nameMap.has(nameID)) {
            nameMap.set(nameID, decoded);
          }
        }
      } catch (_error) {}
    }
  } catch (error) {
    console.warn("[RawTableParser] Failed to read name table records:", error);
  }

  return nameMap;
}

/**
 * Minimal binary-only quick parse for Phase 1 display.
 * Only reads name, head, maxp — never touches GSUB/GPOS/ClassDef.
 * Use when opentype.parse() throws (e.g. "ClassDef format must be 1 or 2") so
 * the app can still show the font for display.
 */
export function quickParseBinary(buffer: ArrayBuffer): {
  familyName: string;
  styleName: string;
  numGlyphs: number;
  unitsPerEm: number;
} | null {
  try {
    const nameInfo = findTableOffset(buffer, "name");
    const headInfo = findTableOffset(buffer, "head");
    const maxpInfo = findTableOffset(buffer, "maxp");
    if (!nameInfo || !headInfo || headInfo.length < 20 || !maxpInfo || maxpInfo.length < 6) {
      return null;
    }

    const names = readNameTableRecords(buffer, nameInfo.offset, nameInfo.length, [1, 2, 16, 17]);
    const familyName = (names.get(16) ?? names.get(1))?.trim() || "Unknown";
    const styleName = (names.get(17) ?? names.get(2))?.trim() || "Regular";

    const headView = new DataView(buffer, headInfo.offset, headInfo.length);
    const unitsPerEm = headView.getUint16(18, false) || 1000;

    const maxpView = new DataView(buffer, maxpInfo.offset, maxpInfo.length);
    const numGlyphs = maxpView.getUint16(4, false) || 0;

    return { familyName, styleName, numGlyphs, unitsPerEm };
  } catch {
    return null;
  }
}
