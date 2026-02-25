// @ts-nocheck — Untyped third-party APIs (opentype.js parsed shapes); type checking disabled for this file.
/**
 * Web Worker for parsing font files
 * Prevents UI blocking when parsing large fonts (>5MB)
 * Phase 2: Refactored to use extractor architecture
 *
 * LIMITATIONS:
 * - fontkit may not work reliably in workers, so we use opentype.js only
 * - Large fonts (>5MB) parsed in worker will have:
 *   - Less accurate named variations (missing fontkit.namedVariations)
 *   - Missing UINameID data for OpenType features (fontkit exposes FeatureParams better)
 *   - Potentially missing some feature metadata
 *
 * WORKAROUND:
 * - Threshold is set to 5MB - fonts smaller than this use main thread with full fontkit support
 * - Consider increasing threshold to 10MB if needed for better accuracy on larger fonts
 */

import { extractAxes } from "../engine/extractors/AxisExtractor";
import { extractFeatures } from "../engine/extractors/FeatureExtractor";
import { extractInstances } from "../engine/extractors/InstanceExtractor";
import { extractMetadata } from "../engine/extractors/MetadataExtractor";
import { extractMetrics } from "../engine/extractors/MetricsExtractor";
import { extractMisc } from "../engine/extractors/MiscExtractor";
import { extractNameTableFromMultiple } from "../engine/extractors/NameExtractor";
import { parseOpentype } from "../engine/parsers/OpentypeParser";
import { findTableOffset } from "../engine/parsers/RawTableParser";
import { getGSUBFeatureParamsFromBuffer } from "../engine/parsers/tables/layout";
import type { FontExtractionSuite } from "../types/extractors.types";
import type {
  FontMetadata,
  NamedVariation,
  OpenTypeFeature,
  VariableAxis,
} from "../types/font.types";

// Worker uses extractor architecture - helper functions removed
// All name/feature extraction now handled by extractors

interface ParseFontMessage {
  type: "PARSE_FONT";
  payload: {
    arrayBuffer: ArrayBuffer;
  };
}

interface ParseSuccessMessage {
  type: "PARSE_SUCCESS";
  payload: {
    metadata: FontMetadata;
  };
}

interface ParseErrorMessage {
  type: "PARSE_ERROR";
  payload: {
    error: string;
  };
}

type WorkerMessage = ParseFontMessage;

/**
 * Run parallel extraction pipeline in worker
 * Phase 6: Three-stage parallel execution matching main thread implementation
 * Worker uses opentype.js only (fontkit not available in workers)
 *
 * Stage 1 (Sequential): NameExtractor - required dependency
 * Stage 2 (Parallel): Independent extractors (Metrics, Misc, Axes) - no dependencies
 * Stage 3 (Parallel): Name-dependent extractors (Metadata, Feature) - require Stage 1
 * Stage 4 (Sequential): InstanceExtractor - requires axes and nameTable from previous stages
 */
async function runWorkerExtraction(
  opentypeParsed: any,
  cleanBuffer: ArrayBuffer
): Promise<FontExtractionSuite> {
  // Stage 1: Sequential - NameExtractor (required dependency)
  const nameTableResult = extractNameTableFromMultiple(opentypeParsed, null);

  if (!nameTableResult.success) {
    // If name extraction fails, we can't proceed with name-dependent extractors
    // But we can still extract independent metrics and misc data
    const nameTable = null;

    // Stage 2: Parallel - Independent extractors (can run even if name extraction fails)
    const [metricsResult, miscResult, axesResult] = await Promise.all([
      Promise.resolve(extractMetrics(opentypeParsed)),
      Promise.resolve(extractMisc(opentypeParsed, null, cleanBuffer)),
      Promise.resolve(extractAxes(opentypeParsed, null)),
    ]);

    // Stage 3: Name-dependent extractors will fail gracefully
    const gsubLocFail = findTableOffset(cleanBuffer, "GSUB");
    const rawGsubFail = gsubLocFail
      ? getGSUBFeatureParamsFromBuffer(cleanBuffer, gsubLocFail.offset, gsubLocFail.length)
      : undefined;
    const [metadataResult, featuresResult] = await Promise.all([
      Promise.resolve(extractMetadata(opentypeParsed, null)),
      Promise.resolve(extractFeatures(opentypeParsed, null, rawGsubFail)),
    ]);

    // Stage 4: Instances require nameTable and axes
    const axes = axesResult.success ? axesResult.data : undefined;
    const instancesResult = extractInstances(opentypeParsed, null, axes, nameTable, cleanBuffer);

    return {
      nameTable: nameTableResult,
      metadata: metadataResult,
      metrics: metricsResult,
      misc: miscResult,
      features: featuresResult,
      axes: axesResult,
      instances: instancesResult,
    };
  }

  const nameTable = nameTableResult.data!;

  // Stage 2: Parallel - Independent extractors (no dependencies)
  // These can run simultaneously as they don't depend on each other
  const [metricsResult, miscResult, axesResult] = await Promise.all([
    Promise.resolve(extractMetrics(opentypeParsed)),
    Promise.resolve(extractMisc(opentypeParsed, null, cleanBuffer)),
    Promise.resolve(extractAxes(opentypeParsed, null)),
  ]);

  // Stage 3: Parallel - Name-dependent extractors (require Stage 1)
  // Raw GSUB featureParams for correct ss*/cv* names when opentype.js doesn't expose them
  const gsubLoc = findTableOffset(cleanBuffer, "GSUB");
  const rawGsubFeatureParams = gsubLoc
    ? getGSUBFeatureParamsFromBuffer(cleanBuffer, gsubLoc.offset, gsubLoc.length)
    : undefined;
  const [metadataResult, featuresResult] = await Promise.all([
    Promise.resolve(extractMetadata(opentypeParsed, null)),
    Promise.resolve(extractFeatures(opentypeParsed, null, rawGsubFeatureParams)),
  ]);

  // Stage 4: Sequential - InstanceExtractor (requires axes and nameTable from previous stages)
  const axes = axesResult.success ? axesResult.data : undefined;
  const instancesResult = extractInstances(opentypeParsed, null, axes, nameTable, cleanBuffer);

  return {
    nameTable: nameTableResult,
    metadata: metadataResult,
    metrics: metricsResult,
    misc: miscResult,
    features: featuresResult,
    axes: axesResult,
    instances: instancesResult,
  };
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, payload } = e.data;

  if (type === "PARSE_FONT") {
    try {
      const { arrayBuffer } = payload;

      // Phase 6: Non-blocking - yield to event loop before heavy parsing
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Parse with opentype.js (fontkit not available in workers)
      const opentypeParsed = parseOpentype(arrayBuffer);

      if (!opentypeParsed) {
        throw new Error("Failed to parse font with opentype.js");
      }

      const opentypeFont = opentypeParsed.raw;

      // Run parallel extraction pipeline (non-blocking via Promise.all)
      const suite = await runWorkerExtraction(opentypeParsed, arrayBuffer);

      const nameTable = suite.nameTable.success ? suite.nameTable.data : null;
      if (!nameTable) {
        throw new Error("Failed to extract name table");
      }

      // LENIENT mode: Use metadata if available, fallback to defaults
      let familyName = "Unknown";
      let styleName = "Regular";

      if (suite.metadata.success && suite.metadata.data) {
        familyName = suite.metadata.data.familyName || "Unknown";
        styleName = suite.metadata.data.subfamilyName || "Regular";
      } else {
        // Fallback: Try to get names directly from raw font
        const names = opentypeFont.names;
        if (names) {
          familyName =
            names.fontFamily?.en ||
            names.preferredFamily?.en ||
            (typeof names.fontFamily === "object" && names.fontFamily
              ? (Object.values(names.fontFamily)[0] as string)
              : "Unknown");
          styleName =
            names.fontSubfamily?.en ||
            names.preferredSubfamily?.en ||
            (typeof names.fontSubfamily === "object" && names.fontSubfamily
              ? (Object.values(names.fontSubfamily)[0] as string)
              : "Regular");
        }
      }

      // Convert AxisData[] to VariableAxis[] for compatibility
      const axesData = suite.axes.success ? suite.axes.data : undefined;
      const axes: VariableAxis[] | undefined = axesData?.map((axis: any) => ({
        tag: axis.tag,
        name: typeof axis.name === "string" ? axis.name : axis.name?.en || axis.tag,
        min: axis.min,
        max: axis.max,
        default: axis.default,
        current: axis.default, // Use default as current initially
      }));
      const isVariable = (axes?.length ?? 0) > 0;

      // Extract instances (already resolved and sorted by extractInstances)
      const namedVariations: NamedVariation[] | undefined =
        isVariable && suite.instances.success ? suite.instances.data : undefined;

      // Get features and glyph count
      const features: OpenTypeFeature[] = suite.features.success ? suite.features.data || [] : [];
      const featureTags = features.map((f: OpenTypeFeature) => f.tag);
      const glyphCount = suite.misc.success ? (suite.misc.data?.glyphCount ?? 0) : 0;

      // Assemble final metadata
      const metadata: FontMetadata = {
        familyName,
        styleName,
        isVariable,
        axes,
        features: featureTags,
        featureDetails: features.length > 0 ? features : undefined,
        namedVariations,
        glyphCount,
        metadata: suite.metadata.success ? suite.metadata.data : undefined,
        metrics: suite.metrics.success ? suite.metrics.data : undefined,
        misc: suite.misc.success ? suite.misc.data : undefined,
      };

      // Log parsing summary (flat format for worker - no console.group)
      console.log(`[FontParser:summary] ${metadata.familyName} ${metadata.styleName}`, {
        parserPath: "worker-opentype",
        hasFontkit: false,
        isVariable: metadata.isVariable,
        axes: metadata.axes?.length || 0,
        namedVariations: metadata.namedVariations?.length || 0,
        features: metadata.features?.length || 0,
        glyphs: metadata.glyphCount,
      });

      const response: ParseSuccessMessage = {
        type: "PARSE_SUCCESS",
        payload: { metadata },
      };

      self.postMessage(response);
    } catch (error) {
      // Phase 6: Enhanced error handling - preserve ExtractionResult errors
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Unknown parsing error";

      // Check if error contains ExtractionResult information
      const extractionErrors: string[] = [];
      if (error && typeof error === "object" && "extractionErrors" in error) {
        extractionErrors.push(...(error.extractionErrors as string[]));
      }

      const response: ParseErrorMessage = {
        type: "PARSE_ERROR",
        payload: {
          error:
            extractionErrors.length > 0
              ? `${errorMessage}\nExtraction errors: ${extractionErrors.join(", ")}`
              : errorMessage,
        },
      };
      self.postMessage(response);
    }
  }
};
