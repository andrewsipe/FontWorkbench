/**
 * Two-phase font loading for instant display
 * Phase 1: Quick parse (50-100ms) - show font immediately
 * Phase 2: Full extraction (worker) - enhance with metadata
 */

import type { CachedFont, FontMetadata } from "../types/font.types";
import { debug } from "../utils/debug";
import { getFontFormat } from "../utils/fontUtils";
import { decompressFont } from "../utils/woffDecompressor";
import { parseFontInWorker } from "./FontParser";
import { parseOpentypeQuick } from "./parsers/OpentypeParser";
import { hashFontFile } from "./utils/HashUtils";

export interface QuickFontDisplay {
  id: string;
  name: string;
  format: CachedFont["format"];
  familyName: string;
  styleName: string;
  numGlyphs: number;
  fileData: ArrayBuffer; // Always decompressed
  originalFileData?: ArrayBuffer; // Original compressed (WOFF/WOFF2 only)
  isQuickLoad: true;
}

export interface FullFontEnhancement {
  id: string;
  metadata: FontMetadata;
  isVariable: boolean;
  axes?: FontMetadata["axes"];
  features?: FontMetadata["featureDetails"];
}

/**
 * Phase 1: Quick parse for immediate display
 */
export async function quickLoadFont(file: File): Promise<QuickFontDisplay> {
  debug.log("[TwoPhaseLoader] Phase 1: Quick load", file.name);
  const startTime = performance.now();

  const buffer = await file.arrayBuffer();
  const format = getFontFormat(file.name);

  // Decompress if needed - cleanBuffer must ALWAYS be decompressed
  let cleanBuffer = buffer;
  let originalBuffer: ArrayBuffer | undefined;

  if (format === "woff" || format === "woff2") {
    debug.log(`[TwoPhaseLoader] Decompressing ${format.toUpperCase()}...`);
    cleanBuffer = await decompressFont(buffer);
    originalBuffer = buffer;
    debug.log("[TwoPhaseLoader] Decompression complete", {
      originalSize: buffer.byteLength,
      decompressedSize: cleanBuffer.byteLength,
    });
  }

  const quickParse = parseOpentypeQuick(cleanBuffer);

  if (!quickParse.success) {
    throw new Error(quickParse.error ?? "Failed to parse font");
  }

  const fileHash = await hashFontFile(buffer);

  const duration = performance.now() - startTime;
  debug.log(`[TwoPhaseLoader] Phase 1 complete in ${duration.toFixed(0)}ms`, {
    format,
    hasOriginalBuffer: !!originalBuffer,
    cleanBufferSize: cleanBuffer.byteLength,
  });

  return {
    id: fileHash,
    name: `${quickParse.familyName} ${quickParse.styleName}`,
    format,
    familyName: quickParse.familyName,
    styleName: quickParse.styleName,
    numGlyphs: quickParse.numGlyphs,
    fileData: cleanBuffer, // Always decompressed
    originalFileData: originalBuffer, // Compressed original (WOFF/WOFF2 only)
    isQuickLoad: true,
  };
}

/**
 * Phase 2: Full extraction in worker (non-blocking).
 * CRITICAL: Worker receives decompressed buffer (fileData), NOT original compressed.
 */
export async function fullExtractFont(quickFont: QuickFontDisplay): Promise<FullFontEnhancement> {
  debug.log("[TwoPhaseLoader] Phase 2: Full extraction", quickFont.name, {
    format: quickFont.format,
    fileDataSize: quickFont.fileData.byteLength,
    hasOriginalData: !!quickFont.originalFileData,
  });
  const startTime = performance.now();

  // CRITICAL: Pass decompressed buffer to worker
  // Worker's opentype.js cannot handle compressed WOFF/WOFF2
  const bufferCopy = quickFont.fileData.slice(0);
  const metadata = await parseFontInWorker(bufferCopy);

  const duration = performance.now() - startTime;
  debug.log(`[TwoPhaseLoader] Phase 2 complete in ${duration.toFixed(0)}ms`);

  return {
    id: quickFont.id,
    metadata,
    isVariable: metadata.isVariable,
    axes: metadata.axes,
    features: metadata.featureDetails,
  };
}
