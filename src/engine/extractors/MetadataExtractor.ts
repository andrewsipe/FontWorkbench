/**
 * Metadata extractor
 * Extracts general font information (familyName, subfamilyName, etc.)
 * Phase 2: Uses NameExtractor for name table lookups
 */

import type {
  ExtractionResult,
  GeneralMetadata,
  NameTable,
  ParsedFont,
} from "../../types/extractors.types";
import { ValidationMode } from "../../types/extractors.types";
import { extractorLogger } from "./logger";
import { extractNameTableFromMultiple } from "./NameExtractor";
import { generalMetadataSchema, validateWithMode } from "./validation";

/**
 * Extract general metadata from parsed fonts
 * Uses name table for standard nameIDs (0-17)
 */
export function extractMetadata(
  opentypeFont: ParsedFont | null,
  fontkitFont: ParsedFont | null
): ExtractionResult<GeneralMetadata> {
  const startTime = Date.now();
  extractorLogger.info("MetadataExtractor", "extract", {
    hasOpentype: !!opentypeFont,
    hasFontkit: !!fontkitFont,
  });

  try {
    // Extract name table first (required)
    const nameTableResult = extractNameTableFromMultiple(opentypeFont, fontkitFont);

    if (!nameTableResult.success || !nameTableResult.data) {
      extractorLogger.error("MetadataExtractor", "extract", {
        error: "Failed to extract name table",
        warnings: nameTableResult.warnings,
      });
      return {
        success: false,
        error: "Failed to extract name table",
        warnings: nameTableResult.warnings,
      };
    }

    const nameTable: NameTable = nameTableResult.data;

    // Extract standard nameIDs
    const rawMetadata: GeneralMetadata = {
      familyName: nameTable.get(1) || nameTable.get(16) || "Unknown",
      subfamilyName: nameTable.get(2) || nameTable.get(17) || "Regular",
      uniqueIdentifier: nameTable.get(3) || undefined, // Name ID 3
      fullName: nameTable.get(4) || "",
      version: nameTable.get(5) || "",
      postscriptName: nameTable.get(6) || "",
      copyright: nameTable.get(0) || "",
      manufacturer: nameTable.get(8) || "",
      designer: nameTable.get(9) || "",
      description: nameTable.get(10) || "",
      manufacturerURL: nameTable.get(11) || "",
      designerURL: nameTable.get(12) || "",
      license: nameTable.get(13) || "",
      licenseURL: nameTable.get(14) || "",
      preferredFamily: nameTable.get(16) || undefined, // Name ID 16
      preferredSubfamily: nameTable.get(17) || undefined, // Name ID 17
    };

    // Validate with LENIENT mode
    const validation = validateWithMode(generalMetadataSchema, rawMetadata, ValidationMode.LENIENT);

    if (!validation.success && validation.errors.length > 0) {
      extractorLogger.warn("MetadataExtractor", "validation", {
        errors: validation.errors,
        fieldCount: Object.keys(rawMetadata).length,
      });
    }

    // LENIENT mode: Try fallbacks for family name, but don't fail
    let finalFamilyName = validation.data.familyName;

    if (!finalFamilyName || finalFamilyName === "Unknown") {
      // Try fallback: extract from PostScript name
      const postscriptName = validation.data.postscriptName;
      if (postscriptName) {
        // Extract family from PostScript name (e.g., "FontName-Regular" -> "FontName")
        const parts = postscriptName.split("-");
        if (parts.length > 0 && parts[0]) {
          finalFamilyName = parts[0];
          extractorLogger.info("MetadataExtractor", "fallback", {
            method: "postscriptName",
            familyName: finalFamilyName,
          });
        }
      }

      // If still unknown, use "Unknown" but don't fail (LENIENT mode)
      if (!finalFamilyName || finalFamilyName === "Unknown") {
        finalFamilyName = "Unknown";
        extractorLogger.warn("MetadataExtractor", "extract", {
          warning: "Family name not found, using 'Unknown'",
          nameTableKeys: Object.keys(nameTable.getAll()),
        });
      }
    }

    // Update the validated data with final family name
    const finalMetadata = {
      ...validation.data,
      familyName: finalFamilyName,
    };

    extractorLogger.timed("info", "MetadataExtractor", "extract", startTime, {
      familyName: finalMetadata.familyName,
      subfamilyName: finalMetadata.subfamilyName,
      validationErrors: validation.errors.length,
      usedFallback: finalMetadata.familyName !== validation.data.familyName,
    });

    return {
      success: true, // Always return success in LENIENT mode
      data: finalMetadata,
      warnings: [
        ...(nameTableResult.warnings || []),
        ...(validation.errors.length > 0 ? [`Validation: ${validation.errors.length} errors`] : []),
        ...(finalMetadata.familyName === "Unknown"
          ? ["Family name not found in name table, using 'Unknown'"]
          : []),
      ],
    };
  } catch (error) {
    extractorLogger.error("MetadataExtractor", "extract", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error extracting metadata",
    };
  }
}
