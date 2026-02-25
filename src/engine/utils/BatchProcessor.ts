/**
 * Batch processor for multiple font files
 * Handles concurrent processing with memory management
 * Phase 2: Parallel extraction support
 */

import type { FontMetadata } from "../../types/font.types";
import { parseFont } from "../FontParser";

export interface BatchProcessorOptions {
  /**
   * Maximum number of fonts to process concurrently
   * Default: 5
   */
  concurrency?: number;

  /**
   * Progress callback: (current: number, total: number) => void
   * Called after each font is processed
   */
  onProgress?: (current: number, total: number) => void;
}

export interface BatchProcessorResult<T> {
  results: Array<{ success: boolean; data?: T; error?: string; index: number }>;
  total: number;
  successful: number;
  failed: number;
}

/**
 * Process multiple fonts in batches with concurrency control
 *
 * @param fonts - Array of font files (File objects or ArrayBuffers with metadata)
 * @param options - Processing options (concurrency, progress callback)
 * @returns Batch processing results
 */
export async function processFontBatch(
  fonts: Array<{ file: File; buffer?: ArrayBuffer }>,
  options: BatchProcessorOptions = {}
): Promise<BatchProcessorResult<FontMetadata>> {
  const concurrency = options.concurrency ?? 5;
  const onProgress = options.onProgress;
  const total = fonts.length;

  const results: Array<{ success: boolean; data?: FontMetadata; error?: string; index: number }> =
    [];
  let successful = 0;
  let failed = 0;

  // Process fonts in batches
  for (let i = 0; i < fonts.length; i += concurrency) {
    const batch = fonts.slice(i, i + concurrency);

    // Process batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map(async (fontItem, batchIndex) => {
        const globalIndex = i + batchIndex;
        try {
          // Get buffer if not provided
          let buffer: ArrayBuffer;
          if (fontItem.buffer) {
            buffer = fontItem.buffer;
          } else {
            buffer = await fontItem.file.arrayBuffer();
          }

          // Parse font
          const metadata = await parseFont(buffer, fontItem.file.size);

          return {
            success: true,
            data: metadata,
            index: globalIndex,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            index: globalIndex,
          };
        }
      })
    );

    // Process batch results
    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
        if (result.value.success) {
          successful++;
        } else {
          failed++;
        }
      } else {
        // Promise.allSettled shouldn't reject, but handle it just in case
        results.push({
          success: false,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          index: results.length,
        });
        failed++;
      }

      // Report progress
      if (onProgress) {
        onProgress(results.length, total);
      }
    }

    // Allow garbage collection between batches
    // Yield to event loop to prevent UI blocking
    if (i + concurrency < fonts.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Sort results by original index to maintain order
  results.sort((a, b) => a.index - b.index);

  return {
    results,
    total,
    successful,
    failed,
  };
}

/**
 * Process multiple fonts with ArrayBuffer inputs
 * Convenience wrapper for when you already have buffers
 */
export async function processFontBatchFromBuffers(
  fonts: Array<{ buffer: ArrayBuffer; fileName: string; fileSize: number }>,
  options: BatchProcessorOptions = {}
): Promise<BatchProcessorResult<FontMetadata>> {
  const concurrency = options.concurrency ?? 5;
  const onProgress = options.onProgress;
  const total = fonts.length;

  const results: Array<{ success: boolean; data?: FontMetadata; error?: string; index: number }> =
    [];
  let successful = 0;
  let failed = 0;

  // Process fonts in batches
  for (let i = 0; i < fonts.length; i += concurrency) {
    const batch = fonts.slice(i, i + concurrency);

    // Process batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map(async (fontItem, batchIndex) => {
        const globalIndex = i + batchIndex;
        try {
          // Parse font
          const metadata = await parseFont(fontItem.buffer, fontItem.fileSize);

          return {
            success: true,
            data: metadata,
            index: globalIndex,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            index: globalIndex,
          };
        }
      })
    );

    // Process batch results
    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
        if (result.value.success) {
          successful++;
        } else {
          failed++;
        }
      } else {
        results.push({
          success: false,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          index: results.length,
        });
        failed++;
      }

      // Report progress
      if (onProgress) {
        onProgress(results.length, total);
      }
    }

    // Allow garbage collection between batches
    if (i + concurrency < fonts.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Sort results by original index to maintain order
  results.sort((a, b) => a.index - b.index);

  return {
    results,
    total,
    successful,
    failed,
  };
}
