/**
 * Axis extractor
 * Extracts variable font axes
 * Phase 2: Independent extractor (can run in parallel)
 */

import type { ExtractionResult, ParsedFont } from "../../types/extractors.types";
import { ValidationMode } from "../../types/extractors.types";
import type { VariableAxis } from "../../types/font.types";
import { extractorLogger } from "./logger";
import { validateWithMode, variableAxisSchema } from "./validation";

/**
 * Extract variable axes from parsed font
 * Returns empty array for non-variable fonts (not an error)
 */
export function extractAxes(
  opentypeFont: ParsedFont | null,
  fontkitFont: ParsedFont | null
): ExtractionResult<VariableAxis[]> {
  const startTime = Date.now();
  extractorLogger.info("AxisExtractor", "extract", {
    hasOpentype: !!opentypeFont,
    hasFontkit: !!fontkitFont,
  });

  try {
    const axes: VariableAxis[] = [];

    // Try fontkit first (more reliable for variable fonts)
    if (fontkitFont) {
      const fontkitAxes = fontkitFont.getVariationAxes();
      if (fontkitAxes && fontkitAxes.length > 0) {
        for (const axis of fontkitAxes) {
          const name = typeof axis.name === "string" ? axis.name : axis.name?.en || axis.tag;

          axes.push({
            tag: axis.tag,
            name,
            min: axis.min,
            max: axis.max,
            default: axis.default,
            current: axis.default,
          });
        }
      }
    }

    // Fallback to opentype
    if (axes.length === 0 && opentypeFont) {
      const opentypeAxes = opentypeFont.getVariationAxes();
      if (opentypeAxes && opentypeAxes.length > 0) {
        for (const axis of opentypeAxes) {
          // Normalize name to string for VariableAxis interface
          const name = typeof axis.name === "string" ? axis.name : axis.name?.en || axis.tag;

          axes.push({
            tag: axis.tag,
            name,
            min: axis.min,
            max: axis.max,
            default: axis.default,
            current: axis.default,
          });
        }
      }
    }

    // Validate each axis with LENIENT mode
    const validatedAxes: VariableAxis[] = [];
    let validationErrors = 0;

    for (const axis of axes) {
      const validation = validateWithMode(variableAxisSchema, axis, ValidationMode.LENIENT);
      if (validation.success) {
        validatedAxes.push(validation.data);
      } else {
        validationErrors++;
        // Still include axis even if validation fails (LENIENT mode)
        validatedAxes.push(axis);
      }
    }

    if (validationErrors > 0) {
      extractorLogger.warn("AxisExtractor", "validation", {
        errors: validationErrors,
        totalAxes: axes.length,
      });
    }

    extractorLogger.timed("info", "AxisExtractor", "extract", startTime, {
      axisCount: validatedAxes.length,
      validationErrors,
    });

    // Non-variable fonts return empty array (not an error)
    return {
      success: true,
      data: validatedAxes,
      warnings: validationErrors > 0 ? [`Validation: ${validationErrors} axis errors`] : undefined,
    };
  } catch (error) {
    extractorLogger.error("AxisExtractor", "extract", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error extracting axes",
    };
  }
}
