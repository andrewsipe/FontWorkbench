// @ts-nocheck — Untyped third-party APIs (opentype.js / fontkit); type checking disabled for this file.
/**
 * Name resolver
 * Resolves names from nameIDs using NameTable
 * Phase 2: Deferred name resolution
 * Migrated lookup functions from fontParserHelpers.ts
 */

import type { NameTable } from "../../types/extractors.types";

/**
 * Look up name from opentype.js name table by ID
 * Migrated from fontParserHelpers.ts
 */
export function lookupOpentypeName(opentypeFont: any, nameID: number): string | null {
  if (nameID === undefined || nameID === null || !opentypeFont) return null;

  // 0. Direct access (like idiotproofed.com): font.names[nameID].en
  if (opentypeFont.names && typeof opentypeFont.names === "object") {
    const nameRecord = opentypeFont.names[nameID] || opentypeFont.names[String(nameID)];
    if (nameRecord) {
      if (typeof nameRecord === "string") return nameRecord;
      if (typeof nameRecord === "object" && nameRecord !== null) {
        return (
          nameRecord.en ||
          nameRecord["en-US"] ||
          (typeof nameRecord === "object" ? (Object.values(nameRecord)[0] as string) : null)
        );
      }
    }
  }

  // Helper to decode name record with encoding tolerance
  function decodeNameRecord(record: any): string | null {
    if (!record) return null;
    if (typeof record.string === "string" && record.string.length) {
      return record.string;
    }
    const raw = record.value || record.bytes || record.raw;
    if (!raw) return null;
    try {
      if (record.platformID === 3 || record.platformID === 0) {
        return new TextDecoder("utf-16be").decode(new Uint8Array(raw)).replace(/\0/g, "");
      }
    } catch {}
    try {
      return new TextDecoder("utf-8").decode(new Uint8Array(raw)).replace(/\0/g, "");
    } catch {}
    return null;
  }

  // Locate the Name Records array
  let records: any[] | null = null;
  if (opentypeFont.tables?.name?.records && Array.isArray(opentypeFont.tables.name.records)) {
    records = opentypeFont.tables.name.records;
  } else if (opentypeFont.names?.records && Array.isArray(opentypeFont.names.records)) {
    records = opentypeFont.names.records;
  } else if (opentypeFont.tables?.name && Array.isArray(opentypeFont.tables.name)) {
    records = opentypeFont.tables.name;
  }

  if (records && records.length > 0 && typeof nameID === "number") {
    const preferred = records.find(
      (r: any) => r.nameID === nameID && r.platformID === 3 && r.languageID === 0x0409
    );
    const fallback = records.find((r: any) => r.nameID === nameID);
    const record = preferred || fallback;
    const decoded = decodeNameRecord(record);
    if (decoded) return decoded;
  }

  // Semantic Keys (Standard IDs 0-17)
  const nameIDToKey: Record<number, string> = {
    0: "copyright",
    1: "fontFamily",
    2: "fontSubfamily",
    3: "uniqueSubfamily",
    4: "fullName",
    5: "version",
    6: "postScriptName",
    7: "trademark",
    8: "manufacturer",
    9: "designer",
    10: "description",
    11: "manufacturerURL",
    12: "designerURL",
    13: "license",
    14: "licenseURL",
    16: "preferredFamily",
    17: "preferredSubfamily",
  };

  if (nameIDToKey[nameID] && opentypeFont.names) {
    const key = nameIDToKey[nameID];
    const localizedName = opentypeFont.names[key];
    if (localizedName) {
      if (typeof localizedName === "string") {
        return localizedName;
      }
      if (typeof localizedName === "object" && localizedName !== null) {
        return (
          localizedName.en ||
          localizedName["en-US"] ||
          localizedName["en-GB"] ||
          (Object.values(localizedName)[0] as string) ||
          null
        );
      }
    }
    if (typeof opentypeFont.getEnglishName === "function") {
      try {
        const name = opentypeFont.getEnglishName(key);
        if (name && typeof name === "string") return name;
      } catch {
        // Method may not work for all keys
      }
    }
  }

  return null;
}

/**
 * Look up name from fontkit name table by ID
 * Migrated from fontParserHelpers.ts
 */
export function lookupFontkitName(font: any, nameID: number): string | null {
  if (nameID === undefined || nameID === null || !font?.name) return null;

  // Direct access
  if (font.names && typeof font.names === "object") {
    const nameRecord = font.names[nameID] || font.names[String(nameID)];
    if (nameRecord) {
      if (typeof nameRecord === "string") return nameRecord;
      if (typeof nameRecord === "object" && nameRecord !== null) {
        return (
          nameRecord.en ||
          nameRecord["en-US"] ||
          (typeof nameRecord === "object" ? (Object.values(nameRecord)[0] as string) : null)
        );
      }
    }
  }

  // Raw names array (Most reliable)
  if (font.name.names && Array.isArray(font.name.names)) {
    const platformPriority = [
      { platformID: 3, encodingID: 1 },
      { platformID: 3, encodingID: 10 },
      { platformID: 1, encodingID: 0 },
    ];

    for (const { platformID, encodingID } of platformPriority) {
      const record = font.name.names.find(
        (n: any) =>
          n.nameID === nameID && n.platformID === platformID && n.encodingID === encodingID
      );

      if (record && typeof record.toUnicode === "function") {
        try {
          return record.toUnicode();
        } catch {
          // toUnicode may fail, continue to next fallback
        }
      } else if (record && typeof record.string === "string") {
        return record.string;
      }
    }

    // Greedy Fallback
    const anyRecord = font.name.names.find((n: any) => n.nameID === nameID);
    if (anyRecord) {
      if (typeof anyRecord.toUnicode === "function") {
        try {
          return anyRecord.toUnicode();
        } catch {
          // toUnicode may fail, continue to next fallback
        }
      }
      if (typeof anyRecord.string === "string") return anyRecord.string;
    }
  }

  // Processed records object
  if (font.name.records) {
    const record = font.name.records[nameID] || font.name.records[String(nameID)];
    if (record) {
      if (typeof record === "string") return record;
      if (typeof record === "object" && record !== null) {
        return record.en || record["en-US"] || (Object.values(record)[0] as string);
      }
    }
  }

  return null;
}

/**
 * Resolve name from nameID
 * Prefers opentype, falls back to fontkit
 * Returns null if not found (never throws)
 */
export function resolveName(
  nameID: number | null,
  nameTable: NameTable | null,
  opentypeFont: any,
  fontkitFont: any
): string | null {
  if (nameID === null || nameID === undefined) {
    return null;
  }

  // Try name table first (preferred)
  if (nameTable) {
    const name = nameTable.get(nameID);
    if (name) {
      return name;
    }
  }

  // Fallback to direct lookup
  if (opentypeFont) {
    const name = lookupOpentypeName(opentypeFont, nameID);
    if (name) {
      return name;
    }
  }

  if (fontkitFont) {
    try {
      const name = lookupFontkitName(fontkitFont, nameID);
      if (name) {
        return name;
      }
    } catch {
      // Fontkit lookup might fail, continue
    }
  }

  return null;
}
