/**
 * Instance extractor
 * Extracts fvar instances with accurate name resolution
 * Binary-first approach: only returns what's in the fvar table
 */

import type { ExtractionResult, NameTable, ParsedFont } from "../../types/extractors.types";
import type { NamedVariation, VariableAxis } from "../../types/font.types";
import { findTableOffset, parseFvarTable } from "../parsers/RawTableParser";
import { resolveName } from "../resolvers/NameResolver";
import { extractorLogger } from "./logger";

/**
 * Extract variable font instances with accurate name resolution
 * Binary-first approach: reads fvar table directly and resolves names via NameTable
 * Only returns instances that exist in the fvar table (no placeholders)
 */
export function extractInstances(
  opentypeFont: ParsedFont | null,
  fontkitFont: ParsedFont | null,
  axes: VariableAxis[] | undefined,
  nameTable: NameTable | null,
  fontBuffer?: ArrayBuffer
): ExtractionResult<NamedVariation[]> {
  const startTime = Date.now();
  extractorLogger.info("InstanceExtractor", "extract", {
    hasOpentype: !!opentypeFont,
    hasFontkit: !!fontkitFont,
    hasAxes: !!axes,
    axisCount: axes?.length || 0,
    hasNameTable: !!nameTable,
    hasBuffer: !!fontBuffer,
  });

  if (!nameTable) {
    extractorLogger.error("InstanceExtractor", "extract", {
      error: "NameTable is required for instance extraction",
    });
    return {
      success: false,
      error: "NameTable is required for instance extraction",
    };
  }

  if (!axes || axes.length === 0) {
    extractorLogger.warn("InstanceExtractor", "extract", {
      warning: "No axes provided, cannot extract instances",
    });
    return {
      success: true,
      data: [],
    };
  }

  if (!fontBuffer) {
    extractorLogger.warn("InstanceExtractor", "extract", {
      warning: "No font buffer provided, cannot extract instances",
    });
    return {
      success: true,
      data: [],
    };
  }

  interface InstanceWithMetadata {
    name: string;
    coordinates: Record<string, number>;
  }

  try {
    const instances: InstanceWithMetadata[] = [];

    // Binary Extraction Path (The Source of Truth)
    const fvarInfo = findTableOffset(fontBuffer, "fvar");
    if (!fvarInfo) {
      extractorLogger.warn("InstanceExtractor", "extract", {
        warning: "fvar table not found in font buffer",
      });
      return {
        success: true,
        data: [],
      };
    }

    const fvarData = parseFvarTable(fontBuffer, fvarInfo.offset, fvarInfo.length);
    if (!fvarData?.instances || !Array.isArray(fvarData.instances)) {
      extractorLogger.info("InstanceExtractor", "extract", {
        message: "No instances found in fvar table",
      });
      return {
        success: true,
        data: [],
      };
    }

    // Ensure axes are VariableAxis[] (they should already be, but verify)
    if (!Array.isArray(axes) || axes.length === 0) {
      extractorLogger.warn("InstanceExtractor", "extract", {
        warning: "Invalid axes array",
      });
      return {
        success: true,
        data: [],
      };
    }

    // Extract instances from binary data
    for (let idx = 0; idx < fvarData.instances.length; idx++) {
      const inst = fvarData.instances[idx];

      // Map the binary float array to axis tags using VariableAxis array
      const coordinates: Record<string, number> = {};
      if (Array.isArray(inst.coordinates)) {
        inst.coordinates.forEach((val, axisIdx) => {
          const axis = axes[axisIdx];
          if (axis?.tag) {
            coordinates[axis.tag] = val;
          }
        });
      }

      // Resolve the Subfamily Name with fallback: ID 17 -> ID 2
      let resolvedName: string | null = null;

      if (inst.subfamilyNameID !== undefined && inst.subfamilyNameID !== null) {
        // Try the primary subfamilyNameID
        resolvedName = resolveName(
          inst.subfamilyNameID,
          nameTable,
          opentypeFont?.raw || null,
          fontkitFont?.raw || null
        );

        // Fallback: If ID 17 (preferredSubfamily) fails, try ID 2 (fontSubfamily)
        if (!resolvedName && inst.subfamilyNameID === 17) {
          resolvedName = resolveName(
            2,
            nameTable,
            opentypeFont?.raw || null,
            fontkitFont?.raw || null
          );
        }
      }

      // Only include instances with valid names (no placeholders)
      if (!resolvedName) {
        extractorLogger.debug("InstanceExtractor", "extract", {
          message: `Skipping instance ${idx} - no valid name resolved`,
          subfamilyNameID: inst.subfamilyNameID,
        });
        continue;
      }

      instances.push({
        name: resolvedName,
        coordinates,
      });
    }

    // Keep instances in the order they appear in the fvar table
    // The font designer's intended order is preserved

    // Convert to NamedVariation[] format
    const namedVariations: NamedVariation[] = instances.map((inst) => ({
      name: inst.name,
      coordinates: inst.coordinates,
    }));

    extractorLogger.timed("info", "InstanceExtractor", "extract", startTime, {
      instanceCount: namedVariations.length,
    });

    return {
      success: true,
      data: namedVariations,
    };
  } catch (error) {
    extractorLogger.error("InstanceExtractor", "extract", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error extracting instances",
    };
  }
}
