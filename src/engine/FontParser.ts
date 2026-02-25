// @ts-nocheck — Untyped third-party APIs (fontkit / opentype.js); type checking disabled for this file.
/**
 * Font parsing engine - REPAIRED VERSION
 * Handles robust fallback between fontkit and opentype.js
 * Fixes NameID extraction for Variable Fonts and Stylistic Sets
 *
 * API Usage Notes:
 *
 * opentype.js:
 * - FontNames uses LocalizedName: { [lang: string]: string } (not arrays)
 * - Use getEnglishName('fontFamily') or names.fontFamily.en for standard names
 * - For arbitrary nameIDs: use tables.name.records array
 * - fvar instances: subfamilyNameID may not be directly exposed (API limitation)
 * - Features: tables.gsub.features and tables.gpos.features are arrays
 *
 * fontkit:
 * - variationAxes: Record<string, VariationAxis> - object keyed by tag
 * - namedVariations: Record<string, Record<string, number>> - object keyed by name
 * - VariationAxis supports both min/minValue, max/maxValue, default/defaultValue
 * - name.records: Record<string, any> - may use numeric or string keys
 * - name.names: Array<{nameID, platformID, encodingID, string, toUnicode}>
 * - GSUB/GPOS.featureList: Record<string, any> | Array<any>
 */

// Import fontkit - handle export variations at runtime
import * as fontkitModule from "fontkit";
import opentype from "opentype.js";
import type { AxisData, FontExtractionSuite, ParsedFont } from "../types/extractors.types";
import type {
  FontMetadata,
  NamedVariation,
  OpenTypeFeature,
  VariableAxis,
} from "../types/font.types";

// Phase 2: Helper functions moved to extractors/resolvers
// Keeping only what's needed for logging functions

import { extractAxes } from "./extractors/AxisExtractor";
import { extractFeatures } from "./extractors/FeatureExtractor";
import { extractInstances } from "./extractors/InstanceExtractor";
import { extractMetadata } from "./extractors/MetadataExtractor";
import { extractMetrics } from "./extractors/MetricsExtractor";
import { extractMisc } from "./extractors/MiscExtractor";
import { extractNameTableFromMultiple } from "./extractors/NameExtractor";
// Phase 2: Import extractors and parsers
import { parseFontkit } from "./parsers/FontkitParser";
import { parseOpentype } from "./parsers/OpentypeParser";
import { findTableOffset } from "./parsers/RawTableParser";
import { getGSUBFeatureParamsFromBuffer } from "./parsers/tables/layout";

/**
 * Phase 2: Memory-aware batching configuration
 * Limits concurrent font parsing to prevent memory spikes
 * Allows Garbage Collector to run between operations
 */
const MAX_CONCURRENT_FONTS = 3;

/**
 * Memory-aware batching queue for font parsing
 * Ensures no more than MAX_CONCURRENT_FONTS are parsed simultaneously
 */
interface ParseTask {
  opentypeParsed: ParsedFont;
  fontkitParsed: ParsedFont | null;
  cleanBuffer: ArrayBuffer;
  resolve: (suite: FontExtractionSuite) => void;
  reject: (error: Error) => void;
}

class FontParseQueue {
  private queue: ParseTask[] = [];
  private activeCount = 0;

  async enqueue(
    opentypeParsed: ParsedFont,
    fontkitParsed: ParsedFont | null,
    cleanBuffer: ArrayBuffer
  ): Promise<FontExtractionSuite> {
    return new Promise<FontExtractionSuite>((resolve, reject) => {
      this.queue.push({
        opentypeParsed,
        fontkitParsed,
        cleanBuffer,
        resolve,
        reject,
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    // Don't process if at capacity or queue is empty
    if (this.activeCount >= MAX_CONCURRENT_FONTS || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.activeCount++;

    try {
      // Run extraction
      const suite = await runParallelExtractionAsync(
        task.opentypeParsed,
        task.fontkitParsed,
        task.cleanBuffer
      );

      // Allow GC to run before resolving
      await new Promise((resolve) => setTimeout(resolve, 0));

      task.resolve(suite);
    } catch (error) {
      task.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.activeCount--;
      // Process next task in queue
      this.processQueue();
    }
  }
}

// Global parse queue instance
const parseQueue = new FontParseQueue();

/**
 * Debug flag for font name resolution diagnostics
 * Checks: Vite dev mode, URL parameter, localStorage
 */
const DEBUG_FONT_NAMES: boolean = (() => {
  if (typeof window === "undefined") return false;

  // Check URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("debugFontNames") === "true") return true;

  // Check localStorage
  try {
    if (localStorage.getItem("debugFontNames") === "true") return true;
  } catch {
    // localStorage may not be available
  }

  // Default: enabled in dev mode
  return import.meta.env.DEV;
})();

// Handle fontkit import - it may export differently depending on bundler
// Try multiple access patterns to find the create function
const fontkit: any = (() => {
  try {
    // Helper to safely enable error logging
    const enableErrorLogging = (fk: any) => {
      if (fk && fk.logErrors !== undefined) {
        try {
          // Try to set it, but don't fail if it's read-only
          fk.logErrors = true;
        } catch {
          // Property is read-only, which is fine - just skip enabling logging
          // This happens when the module is frozen or has read-only properties
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
    console.warn("[FontParser] Fontkit module access failed:", e);
    return null;
  }
})();

/**
 * Ensure we have a clean ArrayBuffer.
 * Do not use complex slicing or views that confuse DataView in library backends.
 */
function ensureArrayBuffer(buffer: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) {
    // Return a copy to prevent mutation issues, but don't strictly isolate
    // if it causes platform issues. slice(0) is the standard way to clone.
    const sliced = buffer.slice(0);
    // Check if it's a SharedArrayBuffer (only if SharedArrayBuffer is available)
    // SharedArrayBuffer requires specific security headers and may not be available
    if (typeof SharedArrayBuffer !== "undefined" && sliced instanceof SharedArrayBuffer) {
      // Create a new ArrayBuffer and copy data
      const uint8 = new Uint8Array(sliced);
      const newBuffer = new ArrayBuffer(uint8.length);
      new Uint8Array(newBuffer).set(uint8);
      return newBuffer;
    }
    // TypeScript doesn't know that slice() on ArrayBuffer always returns ArrayBuffer
    // (not SharedArrayBuffer), so we assert it
    return sliced as ArrayBuffer;
  } else if (buffer instanceof Uint8Array) {
    // If it's a view, create a new buffer from it
    const sliced = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    if (typeof SharedArrayBuffer !== "undefined" && sliced instanceof SharedArrayBuffer) {
      // Create a new ArrayBuffer and copy data
      const uint8 = new Uint8Array(sliced);
      const newBuffer = new ArrayBuffer(uint8.length);
      new Uint8Array(newBuffer).set(uint8);
      return newBuffer;
    }
    // TypeScript doesn't know that slice() on ArrayBuffer always returns ArrayBuffer
    return sliced as ArrayBuffer;
  }
  // Fallback
  return new ArrayBuffer(0);
}

/**
 * Diagnostic logging helpers
 */

/**
 * Log parsing context once per font
 */
function logParsingContext(
  parserPath: "main-fontkit" | "main-opentype" | "worker-opentype",
  hasFontkit: boolean,
  isVariable: boolean,
  featureCount: number,
  instanceCount: number
): void {
  if (!DEBUG_FONT_NAMES) return;

  console.warn("[FontParser:context]", {
    parserPath,
    hasFontkit,
    isVariable,
    featureCount,
    instanceCount,
  });
}

// Phase 3: logNameResolutionFailure removed - name resolution logging is now handled by extractors/resolvers

/**
 * Log comprehensive parsing summary
 * Groups all extracted data for easy inspection
 */
function logParsingSummary(
  metadata: FontMetadata,
  parserPath: "main-fontkit" | "main-opentype" | "worker-opentype",
  hasFontkit: boolean
): void {
  if (!DEBUG_FONT_NAMES) return;

  console.group(`[FontParser:summary] ${metadata.familyName} ${metadata.styleName}`);
  console.log("Parser path:", parserPath);
  console.log("Fontkit available:", hasFontkit);
  console.log("Variable font:", metadata.isVariable);
  console.log("Axes:", metadata.axes?.length || 0);
  if (metadata.axes && metadata.axes.length > 0) {
    console.log(
      "Axis details:",
      metadata.axes.map((a) => `${a.tag}: ${a.min}-${a.max} (default: ${a.default})`)
    );
  }
  console.log("Named variations:", metadata.namedVariations?.length || 0);
  console.log("Features:", metadata.features?.length || 0);
  console.log("Glyphs:", metadata.glyphCount);

  if (metadata.namedVariations && metadata.namedVariations.length > 0) {
    console.group("Named Variations:");
    metadata.namedVariations.forEach((v, i) => {
      console.log(`${i + 1}. "${v.name}"`, v.coordinates);
    });
    console.groupEnd();
  }

  if (metadata.featureDetails) {
    const withUINameID = metadata.featureDetails.filter((f) => f.uinameid);
    const withoutUINameID = metadata.featureDetails.filter((f) => !f.uinameid);
    console.group("Features:");
    console.log(`With UINameID: ${withUINameID.length}`);
    console.log(`Without UINameID: ${withoutUINameID.length}`);
    if (withUINameID.length > 0) {
      console.log(
        "Features with custom names:",
        withUINameID.map((f) => `${f.tag} → "${f.name}"`)
      );
    }
    if (withoutUINameID.length > 0 && withoutUINameID.length <= 10) {
      console.log(
        "Features without names:",
        withoutUINameID.map((f) => f.tag)
      );
    }
    console.groupEnd();
  }

  console.groupEnd();
}

/**
 * Log parsing decision (why worker vs main thread was chosen)
 */
function logParsingDecision(
  fileSize: number,
  isVariable: boolean,
  fontkitAvailable: boolean,
  chosenPath: "worker" | "main"
): void {
  if (!DEBUG_FONT_NAMES) return;

  console.log("[FontParser:decision]", {
    fileSize: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
    isVariable,
    fontkitAvailable,
    chosenPath,
    reason:
      isVariable && fontkitAvailable
        ? "Variable font → main thread (fontkit)"
        : fileSize > 5 * 1024 * 1024
          ? "Large file → worker"
          : "Small file → main thread",
  });
}

/**
 * Run parallel extraction pipeline
 * Phase 2: Three-stage parallel execution for optimal performance
 *
 * Stage 1 (Sequential): NameExtractor - required dependency for other stages
 * Stage 2 (Parallel): Independent extractors (Metrics, Misc) - no dependencies
 * Stage 3 (Parallel): Name-dependent extractors (Metadata, Feature) - require Stage 1
 * Stage 4 (Sequential): InstanceExtractor - requires axes and nameTable from previous stages
 *
 * Goal: 2x speedup in parsing time for complex fonts
 */
function runParallelExtraction(
  opentypeParsed: ParsedFont,
  fontkitParsed: ParsedFont | null,
  cleanBuffer: ArrayBuffer
): FontExtractionSuite {
  // Stage 1: Sequential - NameExtractor (required dependency)
  const nameTableResult = extractNameTableFromMultiple(opentypeParsed, fontkitParsed);

  if (!nameTableResult.success) {
    // If name extraction fails, we can't proceed with name-dependent extractors
    // But we can still extract independent metrics and misc data
    const nameTable = null;

    // Stage 2: Parallel - Independent extractors (can run even if name extraction fails)
    const [metricsResult, miscResult, axesResult] = [
      extractMetrics(opentypeParsed),
      extractMisc(opentypeParsed, fontkitParsed, cleanBuffer),
      extractAxes(opentypeParsed, fontkitParsed),
    ];

    // Stage 3: Name-dependent extractors will fail gracefully
    const gsubLocFail = findTableOffset(cleanBuffer, "GSUB");
    const rawGsubFail = gsubLocFail
      ? getGSUBFeatureParamsFromBuffer(cleanBuffer, gsubLocFail.offset, gsubLocFail.length)
      : undefined;
    const metadataResult = extractMetadata(opentypeParsed, fontkitParsed);
    const featuresResult = extractFeatures(opentypeParsed, fontkitParsed, rawGsubFail);

    // Stage 4: Instances require nameTable and axes
    const axes = axesResult.success ? axesResult.data : undefined;
    const instancesResult = extractInstances(
      opentypeParsed,
      fontkitParsed,
      axes,
      nameTable,
      cleanBuffer
    );

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
  const [metricsResult, miscResult, axesResult] = [
    extractMetrics(opentypeParsed),
    extractMisc(opentypeParsed, fontkitParsed, cleanBuffer),
    extractAxes(opentypeParsed, fontkitParsed),
  ];

  // Stage 3: Parallel - Name-dependent extractors (require Stage 1)
  // Raw GSUB featureParams (UINameID/FeatUILabelNameID) for correct ss*/cv* names when libs don't expose them
  const gsubLoc = findTableOffset(cleanBuffer, "GSUB");
  const rawGsubFeatureParams = gsubLoc
    ? getGSUBFeatureParamsFromBuffer(cleanBuffer, gsubLoc.offset, gsubLoc.length)
    : undefined;

  const [metadataResult, featuresResult] = [
    extractMetadata(opentypeParsed, fontkitParsed),
    extractFeatures(opentypeParsed, fontkitParsed, rawGsubFeatureParams),
  ];

  // Stage 4: Sequential - InstanceExtractor (requires axes and nameTable from previous stages)
  const axes = axesResult.success ? axesResult.data : undefined;
  const instancesResult = extractInstances(
    opentypeParsed,
    fontkitParsed,
    axes,
    nameTable,
    cleanBuffer
  );

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

/**
 * Run parallel extraction pipeline (async version)
 * Phase 2: Three-stage parallel execution for optimal performance
 * For use in async contexts where true parallelism is beneficial
 * Exported for use by FontCache service
 *
 * Stage 1 (Sequential): NameExtractor - required dependency
 * Stage 2 (Parallel): Independent extractors (Metrics, Misc, Axes) - Promise.all
 * Stage 3 (Parallel): Name-dependent extractors (Metadata, Feature) - Promise.all
 * Stage 4 (Sequential): InstanceExtractor - requires previous stages
 */
export async function runParallelExtractionAsync(
  opentypeParsed: ParsedFont,
  fontkitParsed: ParsedFont | null,
  cleanBuffer: ArrayBuffer
): Promise<FontExtractionSuite> {
  // Stage 1: Sequential - NameExtractor (required dependency)
  const nameTableResult = extractNameTableFromMultiple(opentypeParsed, fontkitParsed);

  if (!nameTableResult.success) {
    // If name extraction fails, we can't proceed with name-dependent extractors
    // But we can still extract independent metrics and misc data
    const nameTable = null;

    // Stage 2: Parallel - Independent extractors (can run even if name extraction fails)
    const [metricsResult, miscResult, axesResult] = await Promise.all([
      Promise.resolve(extractMetrics(opentypeParsed)),
      Promise.resolve(extractMisc(opentypeParsed, fontkitParsed, cleanBuffer)),
      Promise.resolve(extractAxes(opentypeParsed, fontkitParsed)),
    ]);

    // Stage 3: Name-dependent extractors will fail gracefully
    const gsubLocFail = findTableOffset(cleanBuffer, "GSUB");
    const rawGsubFail = gsubLocFail
      ? getGSUBFeatureParamsFromBuffer(cleanBuffer, gsubLocFail.offset, gsubLocFail.length)
      : undefined;
    const [metadataResult, featuresResult] = await Promise.all([
      Promise.resolve(extractMetadata(opentypeParsed, fontkitParsed)),
      Promise.resolve(extractFeatures(opentypeParsed, fontkitParsed, rawGsubFail)),
    ]);

    // Stage 4: Instances require nameTable and axes
    const axes = axesResult.success ? axesResult.data : undefined;
    const instancesResult = extractInstances(
      opentypeParsed,
      fontkitParsed,
      axes,
      nameTable,
      cleanBuffer
    );

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
    Promise.resolve(extractMisc(opentypeParsed, fontkitParsed, cleanBuffer)),
    Promise.resolve(extractAxes(opentypeParsed, fontkitParsed)),
  ]);

  // Stage 3: Parallel - Name-dependent extractors (require Stage 1)
  // Raw GSUB featureParams for correct ss*/cv* names when libs don't expose them
  const gsubLoc = findTableOffset(cleanBuffer, "GSUB");
  const rawGsubFeatureParams = gsubLoc
    ? getGSUBFeatureParamsFromBuffer(cleanBuffer, gsubLoc.offset, gsubLoc.length)
    : undefined;
  const [metadataResult, featuresResult] = await Promise.all([
    Promise.resolve(extractMetadata(opentypeParsed, fontkitParsed)),
    Promise.resolve(extractFeatures(opentypeParsed, fontkitParsed, rawGsubFeatureParams)),
  ]);

  // Stage 4: Sequential - InstanceExtractor (requires axes and nameTable from previous stages)
  const axes = axesResult.success ? axesResult.data : undefined;
  const instancesResult = extractInstances(
    opentypeParsed,
    fontkitParsed,
    axes,
    nameTable,
    cleanBuffer
  );

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

/**
 * Parse font with memory-aware batching
 * Phase 2: Uses queue system to limit concurrent parsing to MAX_CONCURRENT_FONTS
 * Allows Garbage Collector to run between operations, preventing memory spikes
 *
 * @param opentypeParsed - Parsed opentype font
 * @param fontkitParsed - Parsed fontkit font (optional)
 * @param cleanBuffer - Clean ArrayBuffer of font data
 * @returns Promise resolving to FontExtractionSuite
 */
export async function parseWithMemoryLimit(
  opentypeParsed: ParsedFont,
  fontkitParsed: ParsedFont | null,
  cleanBuffer: ArrayBuffer
): Promise<FontExtractionSuite> {
  return parseQueue.enqueue(opentypeParsed, fontkitParsed, cleanBuffer);
}

/**
 * Parse font synchronously on main thread (for small files <5MB)
 * Phase 2: Refactored to use parallel extractor architecture
 */
export function parseFontSync(arrayBuffer: ArrayBuffer | Uint8Array): FontMetadata {
  // CRITICAL FIX: Ensure we have a true ArrayBuffer
  const cleanBuffer = ensureArrayBuffer(arrayBuffer);

  console.log("[FontParser] Buffer type check:", {
    input: arrayBuffer.constructor.name,
    output: cleanBuffer.constructor.name,
    size: cleanBuffer.byteLength,
  });

  // Phase 2: Use parser wrappers
  const opentypeParsed = parseOpentype(cleanBuffer);
  const fontkitParsed = parseFontkit(cleanBuffer);

  if (!opentypeParsed) {
    throw new Error("Failed to parse font with opentype.js");
  }

  const opentypeFont = opentypeParsed.raw;
  const fontkitFont = fontkitParsed?.raw || null;

  // Run parallel extraction pipeline
  const suite = runParallelExtraction(opentypeParsed, fontkitParsed, cleanBuffer);

  const nameTable = suite.nameTable.success ? suite.nameTable.data : null;
  if (!nameTable) {
    throw new Error("Failed to extract name table");
  }

  // Convert AxisData[] to VariableAxis[] for compatibility
  const axesData = suite.axes.success ? suite.axes.data : undefined;
  const axes: VariableAxis[] | undefined = axesData?.map((axis: AxisData) => ({
    tag: axis.tag,
    name: typeof axis.name === "string" ? axis.name : axis.name?.en || axis.tag,
    min: axis.min,
    max: axis.max,
    default: axis.default,
    current: axis.default, // Use default as current initially
  }));
  const isVariable = (axes?.length ?? 0) > 0;

  // LENIENT mode: Use metadata if available, fallback to defaults
  let familyName = "Unknown";
  let styleName = "Regular";

  if (suite.metadata.success && suite.metadata.data) {
    familyName = suite.metadata.data.familyName || "Unknown";
    styleName = suite.metadata.data.subfamilyName || "Regular";
  } else {
    // Fallback: Try to get names directly from raw fonts
    if (fontkitFont) {
      familyName = fontkitFont.familyName || fontkitFont.postscriptName?.split("-")[0] || "Unknown";
      styleName = fontkitFont.subfamilyName || "Regular";
    } else if (opentypeFont) {
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
  }

  // Determine parser path for diagnostic logging
  const parserPath: "main-fontkit" | "main-opentype" =
    fontkitParsed && isVariable ? "main-fontkit" : "main-opentype";

  // Extract instances (already resolved and sorted by extractInstances)
  const namedVariations: NamedVariation[] | undefined =
    isVariable && suite.instances.success ? suite.instances.data : undefined;

  // Get features and glyph count
  const features: OpenTypeFeature[] = suite.features.success ? suite.features.data || [] : [];
  const featureTags = features.map((f: OpenTypeFeature) => f.tag);
  const glyphCount = suite.misc.success ? (suite.misc.data?.glyphCount ?? 0) : 0;

  // Log parsing context for diagnostics
  logParsingContext(
    parserPath,
    !!fontkitParsed,
    isVariable,
    features.length,
    namedVariations?.length || 0
  );

  // Debug logging
  if (features.length > 0) {
    console.log(`[FontParser] Extracted ${features.length} OpenType features`);
  }

  // Assemble final metadata with extractor results
  const metadata: FontMetadata = {
    familyName,
    styleName,
    isVariable,
    axes,
    features: featureTags,
    featureDetails: features.length > 0 ? features : undefined,
    namedVariations,
    glyphCount,
    // Phase 3: Include full extractor results
    metadata: suite.metadata.success ? suite.metadata.data : undefined,
    metrics: suite.metrics.success ? suite.metrics.data : undefined,
    misc: suite.misc.success ? suite.misc.data : undefined,
  };

  // Log comprehensive parsing summary
  logParsingSummary(metadata, parserPath, !!fontkitParsed);

  return metadata;
}

/**
 * Parse font asynchronously with parallel extraction
 * Used for async contexts where we can leverage true parallelism
 */
export async function parseFontAsync(arrayBuffer: ArrayBuffer | Uint8Array): Promise<FontMetadata> {
  const cleanBuffer = ensureArrayBuffer(arrayBuffer);

  const opentypeParsed = parseOpentype(cleanBuffer);
  const fontkitParsed = parseFontkit(cleanBuffer);

  if (!opentypeParsed) {
    throw new Error("Failed to parse font with opentype.js");
  }

  const opentypeFont = opentypeParsed.raw;
  const fontkitFont = fontkitParsed?.raw || null;

  // Run parallel extraction pipeline (async version)
  const suite = await runParallelExtractionAsync(opentypeParsed, fontkitParsed, cleanBuffer);

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
    // Fallback: Try to get names directly from raw fonts
    if (fontkitFont) {
      familyName = fontkitFont.familyName || fontkitFont.postscriptName?.split("-")[0] || "Unknown";
      styleName = fontkitFont.subfamilyName || "Regular";
    } else if (opentypeFont) {
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
  }

  // Convert AxisData[] to VariableAxis[] for compatibility
  const axesData = suite.axes.success ? suite.axes.data : undefined;
  const axes: VariableAxis[] | undefined = axesData?.map((axis: AxisData) => ({
    tag: axis.tag,
    name: typeof axis.name === "string" ? axis.name : axis.name?.en || axis.tag,
    min: axis.min,
    max: axis.max,
    default: axis.default,
    current: axis.default, // Use default as current initially
  }));
  const isVariable = (axes?.length ?? 0) > 0;

  // Determine parser path for diagnostic logging
  const parserPath: "main-fontkit" | "main-opentype" =
    fontkitParsed && isVariable ? "main-fontkit" : "main-opentype";

  // Extract instances (already resolved and sorted by extractInstances)
  const namedVariations: NamedVariation[] | undefined =
    isVariable && suite.instances.success ? suite.instances.data : undefined;

  // Get features and glyph count
  const features: OpenTypeFeature[] = suite.features.success ? suite.features.data || [] : [];
  const featureTags = features.map((f: OpenTypeFeature) => f.tag);
  const glyphCount = suite.misc.success ? (suite.misc.data?.glyphCount ?? 0) : 0;

  // Log parsing context for diagnostics
  logParsingContext(
    parserPath,
    !!fontkitParsed,
    isVariable,
    features.length,
    namedVariations?.length || 0
  );

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

  // Log comprehensive parsing summary
  logParsingSummary(metadata, parserPath, !!fontkitParsed);

  return metadata;
}

/**
 * Parse font in Web Worker (for large files >5MB)
 */
export function parseFontInWorker(arrayBuffer: ArrayBuffer): Promise<FontMetadata> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/fontParser.worker.ts", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      worker.terminate();

      if (type === "PARSE_SUCCESS") {
        resolve(payload.metadata);
      } else if (type === "PARSE_ERROR") {
        reject(new Error(payload.error));
      }
    };

    worker.onerror = (error) => {
      worker.terminate();
      reject(error);
    };

    worker.postMessage(
      {
        type: "PARSE_FONT",
        payload: { arrayBuffer },
      },
      [arrayBuffer] // Transfer ownership for performance
    );
  });
}

/**
 * Determine if Web Worker should be used based on file size and font type
 * Variable fonts always use main thread (fontkit) for deterministic parsing
 */
export function shouldUseWorker(fileSize: number, isVariable?: boolean): boolean {
  // Force main thread for variable fonts if fontkit available
  const fontkitAvailable = fontkit && typeof fontkit.create === "function";
  if (isVariable && fontkitAvailable) return false;

  return fileSize > 5 * 1024 * 1024; // 5MB threshold
}

/**
 * Parse font with automatic worker selection
 * Uses deterministic parsing: variable fonts always use main thread (fontkit)
 */
export async function parseFont(
  arrayBuffer: ArrayBuffer | Uint8Array,
  fileSize: number
): Promise<FontMetadata> {
  // CRITICAL FIX: Ensure clean ArrayBuffer before worker
  const cleanBuffer = ensureArrayBuffer(arrayBuffer);

  // Early detection: Parse with opentype.js to detect variable font
  // This is fast and needed anyway, so we do it to make deterministic decision
  let isVariable = false;
  try {
    const quickCheck = opentype.parse(cleanBuffer);
    isVariable = !!quickCheck?.tables?.fvar;
  } catch {
    // If quick parse fails, we'll handle it in the full parse
    // Default to size-based decision
  }

  // Log parsing decision
  const fontkitAvailable = fontkit && typeof fontkit.create === "function";
  const chosenPath = shouldUseWorker(fileSize, isVariable) ? "worker" : "main";
  logParsingDecision(fileSize, isVariable, fontkitAvailable, chosenPath);

  // Deterministic rule: variable fonts → main thread (if fontkit available)
  if (shouldUseWorker(fileSize, isVariable)) {
    return parseFontInWorker(cleanBuffer);
  } else {
    return parseFontSync(cleanBuffer);
  }
}
