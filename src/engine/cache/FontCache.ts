/**
 * Font Cache Service
 * Single source of truth for loading and caching fonts
 * Phase 4: Storage Layer - Hash-based deduplication and persistent caching
 *
 * Orchestrates:
 * - File hashing (HashUtils)
 * - Cache lookups (FontCacheDB)
 * - Font parsing (FontParser parallel pipeline)
 * - Batch processing (BatchProcessor)
 */

import { v4 as uuidv4 } from "uuid";
import type {
  AxisData,
  FontExtractionSuite,
  GeneralMetadata,
  MiscellaneousData,
} from "../../types/extractors.types";
import type {
  CachedFont,
  FontMetadata,
  NamedVariation,
  VariableAxis,
} from "../../types/font.types";
import { getFontFormat, validateFontFile } from "../../utils/fontUtils";
import { decompressFont } from "../../utils/woffDecompressor";
import { parseWithMemoryLimit } from "../FontParser";
import { parseFontkit } from "../parsers/FontkitParser";
import { parseOpentype } from "../parsers/OpentypeParser";
import { hashFile } from "../utils/HashUtils";
import {
  getDB,
  getFontFile,
  getMetadataByFileHash,
  hasFontFile,
  storeFontFile,
  storeFontMetadata,
} from "./FontCacheDB";

const CACHE_VERSION = 1; // Increment when extraction logic changes

/**
 * Convert FontExtractionSuite to FontMetadata
 * Helper to transform extraction results into the metadata format
 * Exported for use by FontLoader
 */
export function suiteToMetadata(suite: FontExtractionSuite): FontMetadata {
  const familyName =
    suite.metadata.success && suite.metadata.data
      ? suite.metadata.data.familyName || "Unknown"
      : "Unknown";
  const styleName =
    suite.metadata.success && suite.metadata.data
      ? suite.metadata.data.subfamilyName || "Regular"
      : "Regular";

  // Convert AxisData[] to VariableAxis[]
  const axesData = suite.axes.success ? suite.axes.data : undefined;
  const axes: VariableAxis[] | undefined = axesData?.map((axis: AxisData) => ({
    tag: axis.tag,
    name: typeof axis.name === "string" ? axis.name : axis.name?.en || axis.tag,
    min: axis.min,
    max: axis.max,
    default: axis.default,
    current: axis.default,
  }));
  const isVariable = (axes?.length ?? 0) > 0;

  // Get features
  const features = suite.features.success ? suite.features.data || [] : [];
  const featureTags = features.map((f) => f.tag);

  // Get instances: only use items that have a name (NamedVariation); exclude raw InstanceSnapshot
  const rawInstances = isVariable && suite.instances.success ? suite.instances.data : undefined;
  const namedVariations: NamedVariation[] | undefined = rawInstances?.filter(
    (n): n is NamedVariation => "name" in n && typeof (n as NamedVariation).name === "string"
  );

  // Get glyph count
  const glyphCount = suite.misc.success ? (suite.misc.data?.glyphCount ?? 0) : 0;

  return {
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
}

/**
 * Convert FontExtractionSuite + FontMetadata to CachedFont
 * Maps the extraction suite and metadata to the CachedFont format
 * Exported for use by FontLoader
 */
export function suiteToCachedFont(
  suite: FontExtractionSuite,
  metadata: FontMetadata,
  fileHash: string,
  fileName: string,
  fileData: ArrayBuffer,
  originalFileData: ArrayBuffer | undefined,
  format: CachedFont["format"]
): CachedFont {
  return {
    id: fileHash, // Use fileHash as ID for deduplication
    name: `${metadata.familyName} ${metadata.styleName}`,
    fileName,
    fileData,
    originalFileData,
    format,
    isVariable: metadata.isVariable,
    axes: metadata.axes,
    features: metadata.features,
    featureDetails: metadata.featureDetails,
    namedVariations: metadata.namedVariations,
    timestamp: Date.now(),
    lastAccessed: Date.now(),
    cacheVersion: CACHE_VERSION,
    // Phase 4: Store full extraction suite data
    metadata: suite.metadata.success ? suite.metadata.data : undefined,
    metrics: suite.metrics.success ? suite.metrics.data : undefined,
    misc: suite.misc.success ? suite.misc.data : undefined,
  };
}

/**
 * Build a minimal FontExtractionSuite from FontMetadata (e.g. from worker).
 * Used when storing Phase 2 full extraction result.
 */
export function metadataToSuite(metadata: FontMetadata): FontExtractionSuite {
  const generalMetadata: GeneralMetadata = metadata.metadata ?? {
    familyName: metadata.familyName,
    subfamilyName: metadata.styleName,
    fullName: `${metadata.familyName} ${metadata.styleName}`,
    version: "",
    postscriptName: "",
    uniqueIdentifier: undefined,
    copyright: "",
    manufacturer: "",
    designer: "",
    description: "",
    manufacturerURL: "",
    designerURL: "",
    license: "",
    licenseURL: "",
    preferredFamily: undefined,
    preferredSubfamily: undefined,
  };
  const misc: MiscellaneousData = metadata.misc ?? {
    glyphCount: metadata.glyphCount,
    weightClass: null,
    widthClass: null,
    italicAngle: null,
    underlinePosition: null,
    underlineThickness: null,
    fsSelection: {
      isItalic: false,
      isBold: false,
      isRegular: true,
      useTypoMetrics: true,
    },
    fsType: null,
    fsTypeInterpreted: "",
    isFixedPitch: false,
    availableTables: [],
  };
  return {
    nameTable: { success: false },
    metadata: { success: true, data: generalMetadata },
    metrics: metadata.metrics ? { success: true, data: metadata.metrics } : { success: false },
    misc: { success: true, data: misc },
    features: metadata.featureDetails
      ? { success: true, data: metadata.featureDetails }
      : { success: true, data: [] },
    axes: metadata.axes
      ? {
          success: true,
          data: metadata.axes.map(
            (a): AxisData => ({
              tag: a.tag,
              name: a.name,
              min: a.min,
              max: a.max,
              default: a.default,
            })
          ),
        }
      : { success: true, data: [] },
    instances: metadata.namedVariations
      ? {
          success: true,
          data: metadata.namedVariations.map((n) => ({
            name: n.name,
            coordinates: n.coordinates,
            subfamilyNameID: null,
            sources: ["worker"],
          })),
        }
      : { success: true, data: [] },
  };
}

/**
 * Store full font from Phase 2 worker result (metadata only).
 * Decompresses file data if WOFF/WOFF2, stores file + metadata, returns CachedFont.
 * Used when two-phase loading completes in background.
 */
export async function storeFullFontFromMetadata(
  fileHash: string,
  fileData: ArrayBuffer,
  format: CachedFont["format"],
  fileName: string,
  metadata: FontMetadata
): Promise<CachedFont> {
  let decompressedBuffer = fileData;
  const originalFileData = format === "woff" || format === "woff2" ? fileData : undefined;
  if (format === "woff" || format === "woff2") {
    const decompressed = await decompressFont(fileData);
    if (decompressed) decompressedBuffer = decompressed;
  }
  const fileExists = await hasFontFile(fileHash);
  if (!fileExists) {
    await storeFontFile(fileHash, decompressedBuffer, originalFileData, format);
    console.log("[FontCache] Stored font file from Phase 2:", `${fileHash.slice(0, 8)}...`);
  }
  const suite = metadataToSuite(metadata);
  const metadataId = uuidv4();
  await storeFontMetadata(metadataId, fileHash, fileName, suite, metadata, CACHE_VERSION);
  console.log(
    "[FontCache] Stored font metadata from Phase 2:",
    metadata.familyName,
    metadata.styleName
  );
  return suiteToCachedFont(
    suite,
    metadata,
    fileHash,
    fileName,
    decompressedBuffer,
    originalFileData,
    format
  );
}

/**
 * Get or parse a font file
 *
 * Flow:
 * 1. Hash the file
 * 2. Check cache for existing metadata
 * 3. If found, return cached font (fire-and-forget lastAccessed update)
 * 4. If not found, parse, store, and return new font
 *
 * @param file - Font file to load
 * @param onProgress - Optional progress callback for hashing
 * @returns Promise resolving to CachedFont
 */
export async function getOrParseFont(
  file: File,
  onProgress?: (processed: number, total: number) => void
): Promise<CachedFont> {
  // Validate file
  if (!validateFontFile(file)) {
    throw new Error(`Invalid font file: ${file.name}`);
  }

  // Step 1: Hash the file
  const fileHash = await hashFile(file, onProgress);
  console.log(`[FontCache] File hash: ${fileHash.slice(0, 8)}...`);

  // Step 2: Check cache for existing metadata
  const existingMetadata = await getMetadataByFileHash(fileHash);

  if (existingMetadata) {
    // Step 3: Cache Hit - Return cached font
    const cachedMeta = existingMetadata;
    const cachedFile = await getFontFile(fileHash);

    if (!cachedFile) {
      throw new Error(`Cache inconsistency: metadata exists but file missing for hash ${fileHash}`);
    }

    // Fire-and-forget: Update lastAccessed (don't await)
    cachedFile.lastAccessed = Date.now();
    getDB()
      .then((db) => db.put("fontFiles", cachedFile))
      .catch(console.error);

    cachedMeta.lastAccessed = Date.now();
    getDB()
      .then((db) => db.put("fontMetadata", cachedMeta))
      .catch(console.error);

    // Construct CachedFont from cached data
    const metadata = suiteToMetadata(cachedMeta.extractionSuite);
    const cachedFont = suiteToCachedFont(
      cachedMeta.extractionSuite,
      metadata,
      fileHash,
      cachedMeta.fileName,
      cachedFile.fileData,
      cachedFile.originalFileData,
      cachedFile.format
    );

    console.log(`[FontCache] Cache HIT for ${cachedFont.name}`);
    return cachedFont;
  }

  // Step 4: Cache Miss - Parse and store
  console.log(`[FontCache] Cache MISS - parsing font: ${file.name}`);

  // Read original file buffer
  const originalBuffer = await file.arrayBuffer();
  const format = getFontFormat(file.name);

  // Decompress if needed (WOFF/WOFF2 -> TTF/OTF)
  const decompressedBuffer = await decompressFont(originalBuffer);
  console.log(
    `[FontCache] Decompressed: ${originalBuffer.byteLength} -> ${decompressedBuffer.byteLength} bytes`
  );

  // Parse font using parallel extraction pipeline
  const opentypeParsed = parseOpentype(decompressedBuffer);
  const fontkitParsed = parseFontkit(decompressedBuffer);

  if (!opentypeParsed) {
    throw new Error("Failed to parse font with opentype.js");
  }

  // Run parallel extraction with memory-aware batching
  const suite = await parseWithMemoryLimit(opentypeParsed, fontkitParsed, decompressedBuffer);

  // Convert to metadata
  const metadata = suiteToMetadata(suite);

  // Step 5: Store in cache
  // Check if file already exists (shouldn't happen, but handle gracefully)
  const fileExists = await hasFontFile(fileHash);
  if (!fileExists) {
    await storeFontFile(
      fileHash,
      decompressedBuffer,
      format === "woff" || format === "woff2" ? originalBuffer : undefined,
      format
    );
    console.log(`[FontCache] Stored font file: ${fileHash.slice(0, 8)}...`);
  }

  // Store metadata (create new UUID for metadata entry)
  const metadataId = uuidv4();
  await storeFontMetadata(metadataId, fileHash, file.name, suite, metadata, CACHE_VERSION);
  console.log(`[FontCache] Stored font metadata: ${metadataId}`);

  // Construct and return CachedFont
  const cachedFont = suiteToCachedFont(
    suite,
    metadata,
    fileHash,
    file.name,
    decompressedBuffer,
    format === "woff" || format === "woff2" ? originalBuffer : undefined,
    format
  );

  console.log(`[FontCache] Successfully parsed and cached: ${cachedFont.name}`);
  return cachedFont;
}

/**
 * Add multiple fonts (batch processing)
 * Uses BatchProcessor pattern with progress callbacks
 *
 * @param files - Array of font files to process
 * @param onProgress - Progress callback: (current: number, total: number) => void
 * @param concurrency - Maximum concurrent processing (default: 5)
 * @returns Promise resolving to array of CachedFont results
 */
export async function addFonts(
  files: File[],
  onProgress?: (current: number, total: number) => void,
  concurrency: number = 5
): Promise<Array<{ success: boolean; data?: CachedFont; error?: string }>> {
  const results: Array<{
    success: boolean;
    data?: CachedFont;
    error?: string;
  }> = [];
  const total = files.length;

  // Process files in batches
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);

    // Process batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map(async (file, batchIndex) => {
        const globalIndex = i + batchIndex;
        try {
          // Hash progress callback (for individual file)
          const hashProgress = (processed: number, total: number) => {
            // Calculate overall progress including hash phase
            // Assume hashing is ~10% of total work, parsing is ~90%
            const hashWeight = 0.1;
            const overallProgress = globalIndex + hashWeight * (processed / total);
            if (onProgress) {
              onProgress(Math.floor(overallProgress), total);
            }
          };

          const cachedFont = await getOrParseFont(file, hashProgress);

          // Report completion (parsing phase done)
          if (onProgress) {
            onProgress(globalIndex + 1, total);
          }

          return {
            success: true,
            data: cachedFont,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    // Process batch results
    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        results.push({
          success: false,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    // Yield to event loop between batches
    if (i + concurrency < files.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return results;
}

/**
 * Get cached font by file hash
 * Useful for retrieving fonts that were previously cached
 *
 * @param fileHash - SHA-256 hash of the font file
 * @returns Promise resolving to CachedFont or null if not found
 */
export async function getCachedFontByHash(fileHash: string): Promise<CachedFont | null> {
  const cachedMeta = await getMetadataByFileHash(fileHash);

  if (!cachedMeta) {
    return null;
  }

  const cachedFile = await getFontFile(fileHash);

  if (!cachedFile) {
    return null;
  }

  // Update lastAccessed (fire-and-forget)
  cachedFile.lastAccessed = Date.now();
  getDB()
    .then((db) => db.put("fontFiles", cachedFile))
    .catch(console.error);

  cachedMeta.lastAccessed = Date.now();
  getDB()
    .then((db) => db.put("fontMetadata", cachedMeta))
    .catch(console.error);

  const metadata = suiteToMetadata(cachedMeta.extractionSuite);
  return suiteToCachedFont(
    cachedMeta.extractionSuite,
    metadata,
    fileHash,
    cachedMeta.fileName,
    cachedFile.fileData,
    cachedFile.originalFileData,
    cachedFile.format
  );
}
