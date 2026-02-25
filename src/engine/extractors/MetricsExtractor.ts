/**
 * Metrics extractor
 * Extracts typographic and OS/2 metrics from font tables
 * Phase 2: Independent extractor (can run in parallel)
 *
 * Extracts:
 * - OS/2 table: sTypoAscender, sTypoDescender, sTypoLineGap, usWinAscent, usWinDescent,
 *   sCapHeight, sxHeight, yStrikeoutPosition, yStrikeoutSize
 * - head table: unitsPerEm, underlinePosition, underlineThickness
 * - hhea table: hheaAscender, hheaDescender, hheaLineGap
 */

import type { ExtractionResult, FontMetrics, ParsedFont } from "../../types/extractors.types";
import { ValidationMode } from "../../types/extractors.types";
import { extractorLogger } from "./logger";
import { fontMetricsSchema, validateWithMode } from "./validation";

/**
 * Extract font metrics from parsed font
 * Handles missing tables gracefully
 */
export function extractMetrics(parsedFont: ParsedFont | null): ExtractionResult<FontMetrics> {
  const startTime = Date.now();
  extractorLogger.info("MetricsExtractor", "extract", {
    hasParsedFont: !!parsedFont,
    source: parsedFont?.source,
  });

  if (!parsedFont) {
    extractorLogger.error("MetricsExtractor", "extract", {
      error: "No parsed font provided",
    });
    return {
      success: false,
      error: "No parsed font provided",
    };
  }

  try {
    const metricsTable = parsedFont.getMetricsTable();

    if (!metricsTable) {
      extractorLogger.warn("MetricsExtractor", "extract", {
        warning: "Metrics table not found",
      });
      return {
        success: false,
        error: "Metrics table not found",
        warnings: ["Font may be missing head, OS/2, or hhea tables"],
      };
    }

    // Extract all OS/2 and head table metrics
    // OS/2 table metrics:
    // - sTypoAscender, sTypoDescender, sTypoLineGap (typographic metrics)
    // - usWinAscent, usWinDescent (Windows metrics)
    // - sCapHeight, sxHeight (cap height and x-height)
    // - yStrikeoutPosition, yStrikeoutSize (strikeout metrics)
    // head table metrics:
    // - unitsPerEm (required)
    // - underlinePosition, underlineThickness (underline metrics - note: these are in head, not post)
    const rawMetrics: FontMetrics = {
      unitsPerEm: metricsTable.unitsPerEm ?? 0,
      // OS/2 typographic metrics
      typoAscender: metricsTable.typoAscender ?? null, // sTypoAscender
      typoDescender: metricsTable.typoDescender ?? null, // sTypoDescender
      typoLineGap: metricsTable.typoLineGap ?? null, // sTypoLineGap
      // OS/2 Windows metrics
      winAscent: metricsTable.winAscent ?? null, // usWinAscent
      winDescent: metricsTable.winDescent ?? null, // usWinDescent
      // OS/2 height metrics
      capHeight: metricsTable.capHeight ?? null, // sCapHeight
      xHeight: metricsTable.xHeight ?? null, // sxHeight
      // OS/2 strikeout metrics
      strikeoutPosition: metricsTable.strikeoutPosition ?? null, // yStrikeoutPosition
      strikeoutSize: metricsTable.strikeoutSize ?? null, // yStrikeoutSize
      // hhea table metrics
      hheaAscender: metricsTable.hheaAscender ?? null,
      hheaDescender: metricsTable.hheaDescender ?? null,
      hheaLineGap: metricsTable.hheaLineGap ?? null,
      // head table underline metrics (note: these are in head table, not post table)
      underlinePosition: metricsTable.underlinePosition ?? null,
      underlineThickness: metricsTable.underlineThickness ?? null,
    };

    // Validate with LENIENT mode
    const validation = validateWithMode(fontMetricsSchema, rawMetrics, ValidationMode.LENIENT);

    if (!validation.success && validation.errors.length > 0) {
      extractorLogger.warn("MetricsExtractor", "validation", {
        errors: validation.errors,
      });
    }

    // Validate unitsPerEm (required)
    if (validation.data.unitsPerEm === 0) {
      extractorLogger.error("MetricsExtractor", "extract", {
        error: "unitsPerEm is zero or missing",
      });
      return {
        success: false,
        error: "unitsPerEm is zero or missing",
        data: validation.data,
      };
    }

    extractorLogger.timed("info", "MetricsExtractor", "extract", startTime, {
      unitsPerEm: validation.data.unitsPerEm,
      tablesFound: Object.keys(metricsTable).length,
      validationErrors: validation.errors.length,
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
    extractorLogger.error("MetricsExtractor", "extract", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error extracting metrics",
    };
  }
}
