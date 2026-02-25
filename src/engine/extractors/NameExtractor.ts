/**
 * Name table extractor
 * Extracts and merges name table data from fontkit and opentype sources
 * Phase 1: Foundation extractor
 */

import type {
  ExtractionResult,
  NameTable,
  NameTableData,
  ParsedFont,
} from "../../types/extractors.types";
import { extractorLogger } from "./logger";

/**
 * Unified NameTable implementation
 * Provides get() method for nameID lookups
 */
class UnifiedNameTable implements NameTable {
  private data: NameTableData;

  constructor(data: NameTableData) {
    this.data = data;
  }

  get(nameID: number): string | null {
    return this.data[nameID] ?? null;
  }

  getAll(): NameTableData {
    return { ...this.data };
  }
}

/** Create a NameTable from raw NameTableData (e.g. for tests or single-parser use). */
export function createNameTable(data: NameTableData): NameTable {
  return new UnifiedNameTable(data);
}

/**
 * Merge name tables with priority
 * Opentype preferred, fontkit fallback
 */
function mergeNameTables(
  opentypeTable: NameTableData | null,
  fontkitTable: NameTableData | null
): NameTableData {
  const merged: NameTableData = {};

  // First, add fontkit entries (lower priority)
  if (fontkitTable) {
    for (const [nameIDStr, value] of Object.entries(fontkitTable)) {
      const nameID = parseInt(nameIDStr, 10);
      if (!Number.isNaN(nameID) && value) {
        merged[nameID] = value;
      }
    }
  }

  // Then, overwrite with opentype entries (higher priority)
  if (opentypeTable) {
    for (const [nameIDStr, value] of Object.entries(opentypeTable)) {
      const nameID = parseInt(nameIDStr, 10);
      if (!Number.isNaN(nameID) && value) {
        merged[nameID] = value;
      }
    }
  }

  return merged;
}

/**
 * Extract name table from ParsedFont
 * Handles both fontkit and opentype sources
 */
export function extractNameTable(parsedFont: ParsedFont | null): ExtractionResult<NameTable> {
  const startTime = Date.now();
  extractorLogger.info("NameExtractor", "extract", {
    hasParsedFont: !!parsedFont,
    source: parsedFont?.source,
  });

  if (!parsedFont) {
    extractorLogger.error("NameExtractor", "extract", {
      error: "No parsed font provided",
    });
    return {
      success: false,
      error: "No parsed font provided",
    };
  }

  try {
    // Get name table from parsed font
    const nameTableData = parsedFont.getNameTable();

    if (!nameTableData || Object.keys(nameTableData).length === 0) {
      extractorLogger.warn("NameExtractor", "extract", {
        warning: "Name table not found or empty",
      });
      return {
        success: false,
        error: "Name table not found or empty",
        warnings: ["Font may be missing name table"],
      };
    }

    const nameTable = new UnifiedNameTable(nameTableData);
    const nameIDCount = Object.keys(nameTableData).length;

    extractorLogger.timed("info", "NameExtractor", "extract", startTime, {
      nameIDCount,
      source: parsedFont.source,
    });

    return {
      success: true,
      data: nameTable,
    };
  } catch (error) {
    extractorLogger.error("NameExtractor", "extract", {
      error: error instanceof Error ? error.message : "Unknown error extracting name table",
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error extracting name table",
    };
  }
}

/**
 * Extract name table from multiple ParsedFont sources
 * Merges opentype (preferred) and fontkit (fallback) sources
 */
export function extractNameTableFromMultiple(
  opentypeFont: ParsedFont | null,
  fontkitFont: ParsedFont | null
): ExtractionResult<NameTable> {
  const startTime = Date.now();
  extractorLogger.info("NameExtractor", "extractFromMultiple", {
    hasOpentype: !!opentypeFont,
    hasFontkit: !!fontkitFont,
  });

  try {
    const opentypeTable = opentypeFont?.getNameTable() ?? null;
    const fontkitTable = fontkitFont?.getNameTable() ?? null;

    if (!opentypeTable && !fontkitTable) {
      return {
        success: false,
        error: "No name table found in any source",
      };
    }

    const merged = mergeNameTables(opentypeTable, fontkitTable);

    if (Object.keys(merged).length === 0) {
      return {
        success: false,
        error: "Merged name table is empty",
      };
    }

    const nameTable = new UnifiedNameTable(merged);
    const nameIDCount = Object.keys(merged).length;

    // Log extracted nameIDs for debugging
    const extractedNameIDs = Object.keys(merged)
      .map((k) => parseInt(k, 10))
      .sort((a, b) => a - b);

    // Check for required Name IDs: 3 (Unique Font Identifier), 5 (Version), 16 (Typographic Family), 17 (Typographic Subfamily)
    const hasNameID3 = extractedNameIDs.includes(3);
    const hasNameID5 = extractedNameIDs.includes(5);
    const hasNameID16 = extractedNameIDs.includes(16);
    const hasNameID17 = extractedNameIDs.includes(17);

    extractorLogger.timed("info", "NameExtractor", "extractFromMultiple", startTime, {
      nameIDCount,
      fromOpentype: !!opentypeTable,
      fromFontkit: !!fontkitTable,
      extractedNameIDs: extractedNameIDs.slice(0, 20), // Log first 20 for debugging
      hasStandardNames: extractedNameIDs.some((id) => [1, 2, 3, 4, 5, 6].includes(id)),
      hasNameID3, // Unique Font Identifier
      hasNameID5, // Version String
      hasNameID16, // Typographic Family Name
      hasNameID17, // Typographic Subfamily Name
    });

    return {
      success: true,
      data: nameTable,
      warnings:
        !opentypeTable && fontkitTable
          ? ["Using fontkit name table only (opentype unavailable)"]
          : undefined,
    };
  } catch (error) {
    extractorLogger.error("NameExtractor", "extractFromMultiple", {
      error: error instanceof Error ? error.message : "Unknown error merging name tables",
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error merging name tables",
    };
  }
}
