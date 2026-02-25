// @ts-nocheck — Untyped third-party APIs (opentype.js / fontkit table shapes); type checking disabled for this file.
/**
 * Miscellaneous data extractor
 * Extracts glyph count, weight/width classes, italic angle, fsSelection, etc.
 * Phase 2: Independent extractor (can run in parallel)
 */

import type { ExtractionResult, MiscellaneousData, ParsedFont } from "../../types/extractors.types";
import { ValidationMode } from "../../types/extractors.types";
import {
  findTableOffset,
  getAvailableTableTags,
  readOS2TableFields,
} from "../parsers/RawTableParser";
import { extractorLogger } from "./logger";
import { miscellaneousDataSchema, validateWithMode } from "./validation";

/**
 * Extract miscellaneous font data
 * Handles missing tables gracefully
 * Uses binary parsing fallback for missing OS/2 fields
 */
export function extractMisc(
  opentypeFont: ParsedFont | null,
  fontkitFont: ParsedFont | null,
  fontBuffer?: ArrayBuffer
): ExtractionResult<MiscellaneousData> {
  const startTime = Date.now();
  extractorLogger.info("MiscExtractor", "extract", {
    hasOpentype: !!opentypeFont,
    hasFontkit: !!fontkitFont,
  });

  try {
    const misc: MiscellaneousData = {
      glyphCount: 0,
      weightClass: null,
      widthClass: null,
      italicAngle: null,
      underlinePosition: null,
      underlineThickness: null,
      fsSelection: {
        isItalic: false,
        isBold: false,
        isRegular: false,
        useTypoMetrics: false,
      },
      fsType: null,
      fsTypeInterpreted: "",
      isFixedPitch: false,
      availableTables: [],
      vendorID: null,
    };

    // Try fontkit first (more reliable for some properties)
    if (fontkitFont?.raw) {
      const fk = fontkitFont.raw;

      misc.glyphCount = fk.numGlyphs || 0;

      if (fk["OS/2"]) {
        const os2 = fk["OS/2"];
        misc.weightClass = os2.usWeightClass ?? null;
        misc.widthClass = os2.usWidthClass ?? null;

        // Extract fsSelection bits - verify property exists and is a number
        // CRITICAL: Check os2.fsSelection directly (not os2.fsSelection !== undefined, which fails for 0)
        // Must check typeof first to ensure it's a number, including 0
        if (typeof os2.fsSelection === "number") {
          const fsSelection = os2.fsSelection;
          // Bitwise operations: 0x0001 = Italic, 0x0020 = Bold, 0x0040 = Regular, 0x0080 = Use Typo Metrics
          misc.fsSelection.isItalic = !!(fsSelection & 0x0001);
          misc.fsSelection.isBold = !!(fsSelection & 0x0020);
          misc.fsSelection.isRegular = !!(fsSelection & 0x0040);
          misc.fsSelection.useTypoMetrics = !!(fsSelection & 0x0080);
        } else {
          // Try alternative property names if fsSelection doesn't exist
          const altFsSelection =
            (os2 as any).fsSelection ?? (os2 as any).fs_selection ?? (os2 as any).selection;
          if (typeof altFsSelection === "number") {
            const fsSelection = altFsSelection;
            misc.fsSelection.isItalic = !!(fsSelection & 0x0001);
            misc.fsSelection.isBold = !!(fsSelection & 0x0020);
            misc.fsSelection.isRegular = !!(fsSelection & 0x0040);
            misc.fsSelection.useTypoMetrics = !!(fsSelection & 0x0080);
          }
        }

        // Extract Vendor ID (achVendID) - 4-character string
        if (os2.achVendID) {
          misc.vendorID = typeof os2.achVendID === "string" ? os2.achVendID : String(os2.achVendID);
        }

        // Extract fsType - handle both number and object formats
        // CRITICAL: Explicitly handle fsType === 0 (must check !== undefined first to catch 0)
        // fontkit returns fsType as an object with boolean flags, need to reconstruct the number
        let fsTypeValue: number | null = null;

        if (os2.fsType !== undefined) {
          if (typeof os2.fsType === "number") {
            // Direct number value
            fsTypeValue = os2.fsType;
          } else if (os2.fsType !== null && typeof os2.fsType === "object") {
            // Check for raw/value property first
            const rawValue = (os2.fsType as any).value ?? (os2.fsType as any).raw;
            if (typeof rawValue === "number") {
              fsTypeValue = rawValue;
            } else {
              // fontkit returns fsType as object with boolean flags:
              // { noEmbedding, viewOnly, editable, noSubsetting, bitmapOnly }
              // Reconstruct the numeric value from flags
              const fsTypeObj = os2.fsType as any;
              let bits = 0;

              // OpenType fsType bit flags:
              // 0x0002 = Restricted license embedding (noEmbedding)
              // 0x0004 = Preview & Print embedding (viewOnly)
              // 0x0008 = Editable embedding (editable)
              // 0x0100 = No Subsetting (noSubsetting)
              // 0x0200 = Bitmap Only (bitmapOnly)
              if (fsTypeObj.noEmbedding) bits |= 0x0002;
              if (fsTypeObj.viewOnly) bits |= 0x0004;
              if (fsTypeObj.editable) bits |= 0x0008;
              if (fsTypeObj.noSubsetting) bits |= 0x0100;
              if (fsTypeObj.bitmapOnly) bits |= 0x0200;

              // If all flags are false, bits = 0 (Installable)
              fsTypeValue = bits;
            }
          }
        }

        misc.fsType = fsTypeValue;
      }

      if (fk.post) {
        misc.italicAngle = fk.post.italicAngle ?? null;
        misc.isFixedPitch = !!fk.post.isFixedPitch;
      }

      if (fk.head) {
        misc.underlinePosition = fk.head.underlinePosition ?? null;
        misc.underlineThickness = fk.head.underlineThickness ?? null;
      }

      // Get available tables - use binary parsing for accurate table discovery
      // No restrictive filters - if it's 4 characters in the table directory, it's valid
      if (fontBuffer) {
        misc.availableTables = getAvailableTableTags(fontBuffer);
      } else {
        // Fallback to library parser if buffer not available
        const isValidTag = (tag: string) =>
          tag.toLowerCase() === "os2" || (tag.length === 4 && /^[\x20-\x7E]{4}$/.test(tag));

        if (fk.directory) {
          misc.availableTables = Object.keys(fk.directory).filter((tag) => {
            if (typeof tag !== "string") return false;
            return isValidTag(tag);
          });
        } else if (fk.tables) {
          misc.availableTables = Object.keys(fk.tables).filter((tag) => {
            if (typeof tag !== "string") return false;
            return isValidTag(tag);
          });
        }
      }
    }

    // Fallback to opentype
    if (opentypeFont?.raw) {
      const ot = opentypeFont.raw;

      if (misc.glyphCount === 0) {
        misc.glyphCount = ot.numGlyphs || 0;
      }

      if (ot.tables) {
        if (!misc.availableTables.length) {
          // Use binary parsing for accurate table discovery if buffer available
          if (fontBuffer) {
            misc.availableTables = getAvailableTableTags(fontBuffer);
          } else {
            // Fallback to library parser if buffer not available
            const isValidTag = (tag: string) =>
              tag.toLowerCase() === "os2" || (tag.length === 4 && /^[\x20-\x7E]{4}$/.test(tag));

            misc.availableTables = Object.keys(ot.tables).filter((tag) => {
              if (typeof tag !== "string") return false;
              return isValidTag(tag);
            });
          }
        }

        if (ot.tables["OS/2"]) {
          const os2 = ot.tables["OS/2"];
          if (misc.weightClass === null) {
            misc.weightClass = os2.usWeightClass ?? null;
          }
          if (misc.widthClass === null) {
            misc.widthClass = os2.usWidthClass ?? null;
          }
          if (misc.fsType === null) {
            // Extract fsType - handle both number and object formats
            // CRITICAL: Explicitly handle fsType === 0 (must check !== undefined first to catch 0)
            // opentype.js may return fsType as number or object
            let fsTypeValue: number | null = null;

            if (os2.fsType !== undefined) {
              if (typeof os2.fsType === "number") {
                // Direct number value
                fsTypeValue = os2.fsType;
              } else if (os2.fsType !== null && typeof os2.fsType === "object") {
                // Check for raw/value property first
                const rawValue = (os2.fsType as any).value ?? (os2.fsType as any).raw;
                if (typeof rawValue === "number") {
                  fsTypeValue = rawValue;
                } else {
                  // Some parsers return fsType as object with boolean flags
                  // Reconstruct the numeric value from flags
                  const fsTypeObj = os2.fsType as any;
                  let bits = 0;

                  // OpenType fsType bit flags:
                  // 0x0002 = Restricted license embedding (noEmbedding)
                  // 0x0004 = Preview & Print embedding (viewOnly)
                  // 0x0008 = Editable embedding (editable)
                  // 0x0100 = No Subsetting (noSubsetting)
                  // 0x0200 = Bitmap Only (bitmapOnly)
                  if (fsTypeObj.noEmbedding) bits |= 0x0002;
                  if (fsTypeObj.viewOnly) bits |= 0x0004;
                  if (fsTypeObj.editable) bits |= 0x0008;
                  if (fsTypeObj.noSubsetting) bits |= 0x0100;
                  if (fsTypeObj.bitmapOnly) bits |= 0x0200;

                  // If all flags are false, bits = 0 (Installable)
                  fsTypeValue = bits;
                }
              }
            }

            misc.fsType = fsTypeValue;
          }
          // Update fsSelection if not set - verify property exists and is a number
          // CRITICAL: Check typeof first to ensure it's a number, including 0
          // Don't use !== undefined check as it fails to catch 0 values
          if (typeof os2.fsSelection === "number") {
            const fsSelection = os2.fsSelection;
            // Bitwise operations: 0x0001 = Italic, 0x0020 = Bold, 0x0040 = Regular, 0x0080 = Use Typo Metrics
            misc.fsSelection.isItalic = !!(fsSelection & 0x0001);
            misc.fsSelection.isBold = !!(fsSelection & 0x0020);
            misc.fsSelection.isRegular = !!(fsSelection & 0x0040);
            misc.fsSelection.useTypoMetrics = !!(fsSelection & 0x0080);
          } else {
            // Try alternative property names if fsSelection doesn't exist
            const altFsSelection =
              (os2 as any).fsSelection ?? (os2 as any).fs_selection ?? (os2 as any).selection;
            if (typeof altFsSelection === "number") {
              const fsSelection = altFsSelection;
              misc.fsSelection.isItalic = !!(fsSelection & 0x0001);
              misc.fsSelection.isBold = !!(fsSelection & 0x0020);
              misc.fsSelection.isRegular = !!(fsSelection & 0x0040);
              misc.fsSelection.useTypoMetrics = !!(fsSelection & 0x0080);
            }
          }

          // Extract Vendor ID (achVendID) - 4-character string
          if (misc.vendorID === null && os2.achVendID) {
            misc.vendorID =
              typeof os2.achVendID === "string" ? os2.achVendID : String(os2.achVendID);
          }
        }

        if (ot.tables.post) {
          if (misc.italicAngle === null) {
            misc.italicAngle = ot.tables.post.italicAngle ?? null;
          }
          if (!misc.isFixedPitch) {
            misc.isFixedPitch = !!ot.tables.post.isFixedPitch;
          }
        }

        if (ot.tables.head) {
          if (misc.underlinePosition === null) {
            misc.underlinePosition = ot.tables.head.underlinePosition ?? null;
          }
          if (misc.underlineThickness === null) {
            misc.underlineThickness = ot.tables.head.underlineThickness ?? null;
          }
        }
      }
    }

    // Binary parsing fallback for missing OS/2 fields
    // Fill in weightClass, widthClass, fsType, vendorID, and fsSelection if library parsers failed
    if (fontBuffer) {
      const os2TableInfo = findTableOffset(fontBuffer, "OS/2");
      if (os2TableInfo) {
        const binaryFields = readOS2TableFields(
          fontBuffer,
          os2TableInfo.offset,
          os2TableInfo.length
        );

        // Fill in missing fields from binary parsing
        if (misc.weightClass === null && binaryFields.usWeightClass !== undefined) {
          misc.weightClass = binaryFields.usWeightClass;
        }
        if (misc.widthClass === null && binaryFields.usWidthClass !== undefined) {
          misc.widthClass = binaryFields.usWidthClass;
        }
        if (misc.fsType === null && binaryFields.fsType !== undefined) {
          misc.fsType = binaryFields.fsType;
        }
        if (misc.vendorID === null && binaryFields.vendorID) {
          misc.vendorID = binaryFields.vendorID;
        }

        // Use binary fsSelection as fallback for flags that library parser missed
        // Check each flag individually to catch cases where library gets some right but misses others
        if (binaryFields.fsSelection !== undefined) {
          const binaryFsSelection = binaryFields.fsSelection;

          // Bitwise operations: 0x0001 = Italic (Bit 0), 0x0020 = Bold (Bit 5),
          // 0x0040 = Regular (Bit 6), 0x0080 = Use Typo Metrics (Bit 7)

          // Use binary value if library didn't set this specific flag
          // This ensures all flags are correctly extracted even if library parser is partial
          if (!misc.fsSelection.isItalic && binaryFsSelection & 0x0001) {
            misc.fsSelection.isItalic = true;
          }
          if (!misc.fsSelection.isBold && binaryFsSelection & 0x0020) {
            misc.fsSelection.isBold = true;
          }
          if (!misc.fsSelection.isRegular && binaryFsSelection & 0x0040) {
            misc.fsSelection.isRegular = true;
          }
          if (!misc.fsSelection.useTypoMetrics && binaryFsSelection & 0x0080) {
            misc.fsSelection.useTypoMetrics = true;
          }
        }
      }
    }

    // Validate with LENIENT mode FIRST (before interpretation)
    const validation = validateWithMode(miscellaneousDataSchema, misc, ValidationMode.LENIENT);

    if (!validation.success && validation.errors.length > 0) {
      extractorLogger.warn("MiscExtractor", "validation", {
        errors: validation.errors,
      });
    }

    // Interpret fsType according to OpenType spec AFTER validation
    // Phase 3: Return proper interpretation strings matching reference UI
    // CRITICAL FIX: Explicitly handle fsType === 0 as 'Installable'
    // Must check typeof first to catch 0 (which is falsy but valid)
    // Use validated data to ensure we're working with the correct value
    const validatedFsType = validation.data.fsType;
    if (typeof validatedFsType === "number") {
      const bits = validatedFsType;

      // OpenType fsType interpretation (per Microsoft spec):
      // 0x0000 = Installable (no restrictions)
      // 0x0002 = Restricted license embedding
      // 0x0004 = Preview & Print embedding
      // 0x0008 = Editable embedding
      // Bits can be combined

      // Explicitly handle fsType === 0 as 'Installable' (must be first check)
      if (bits === 0) {
        validation.data.fsTypeInterpreted = "Installable";
      } else if (bits === 0x0002) {
        validation.data.fsTypeInterpreted = "Restricted";
      } else if (bits === 0x0004) {
        validation.data.fsTypeInterpreted = "Preview & Print";
      } else if (bits === 0x0008) {
        validation.data.fsTypeInterpreted = "Editable";
      } else {
        // Handle bit combinations
        const parts: string[] = [];
        if (bits & 0x0002) parts.push("Restricted");
        if (bits & 0x0004) parts.push("Preview & Print");
        if (bits & 0x0008) parts.push("Editable");
        if (bits & 0x0100) parts.push("No Subsetting");
        if (bits & 0x0200) parts.push("Bitmap Only");

        // If no recognized bits, default to Installable
        validation.data.fsTypeInterpreted = parts.length > 0 ? parts.join(", ") : "Installable";
      }
    } else {
      // Only set to "Unknown" if fsType is actually null/undefined, not if it's 0
      validation.data.fsTypeInterpreted = "Unknown";
    }

    extractorLogger.timed("info", "MiscExtractor", "extract", startTime, {
      glyphCount: validation.data.glyphCount,
      availableTables: validation.data.availableTables.length,
      validationErrors: validation.errors.length,
      fsType: validation.data.fsType,
      fsTypeInterpreted: validation.data.fsTypeInterpreted,
    });

    return {
      success: true,
      data: validation.data,
      warnings:
        validation.errors.length > 0
          ? [`Validation: ${validation.errors.length} errors`]
          : undefined,
    };
  } catch (error) {
    extractorLogger.error("MiscExtractor", "extract", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error extracting miscellaneous data",
    };
  }
}
