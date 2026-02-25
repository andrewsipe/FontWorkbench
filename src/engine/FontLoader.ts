/**
 * Font loading and caching system
 * Phase 4: Thin wrapper around FontCache service
 * Phase 6: Single-file hot reload watcher
 * Performance: Two-phase loading (quick display, full extraction in background)
 *
 * This module maintains backward compatibility with existing code while
 * delegating all operations to the new FontCache service.
 *
 * Now includes live file watching for the most recently added font.
 */

import type { CachedFont } from "../types/font.types";
import {
  addFonts,
  getCachedFontByHash,
  getOrParseFont,
  storeFullFontFromMetadata,
} from "./cache/FontCache";
import { clearCache, getCacheStats } from "./cache/FontCacheDB";
import { fullExtractFont, quickLoadFont } from "./TwoPhaseLoader";

// Single-file watcher state
let currentFileHandle: FileSystemFileHandle | null = null;
let watchInterval: number | null = null;
let lastModified: number = 0;
let currentFileName: string | null = null;
let onReloadCallback: ((font: CachedFont) => void) | null = null;
let syncError: string | null = null;

/**
 * Load a single font file (two-phase: quick display, full extraction in background)
 *
 * Phase 1: Quick parse (~50–100ms) → return CachedFont for immediate display.
 * Phase 2: Full extraction in worker → store in cache, dispatch font-enhanced.
 *
 * @param file - Font file to load
 * @param fileHandle - Optional FileSystemFileHandle for live watching
 * @param onFullLoad - Optional callback when Phase 2 completes (full CachedFont)
 * @returns Promise resolving to CachedFont (display-ready; may have _quickLoad: true)
 */
/**
 * Load a single font file with full extraction so CachedFont has features and metadata.
 * Workbench needs features/featureDetails and metadata (e.g. preferredFamily) for grouping.
 */
export async function loadFontFile(
  file: File,
  fileHandle?: FileSystemFileHandle,
  onFullLoad?: (cachedFont: CachedFont) => void
): Promise<CachedFont> {
  const quickFont = await quickLoadFont(file);

  const enhancement = await fullExtractFont(quickFont);
  const fullFont = await storeFullFontFromMetadata(
    quickFont.id,
    quickFont.originalFileData ?? quickFont.fileData,
    quickFont.format,
    file.name,
    enhancement.metadata
  );

  if (fileHandle) {
    setWatchedFile(fileHandle, file.name);
  }
  if (onFullLoad) onFullLoad(fullFont);
  window.dispatchEvent(new CustomEvent("font-enhanced", { detail: { fontId: fullFont.id } }));

  return fullFont;
}

/**
 * Verify permission for a file handle
 */
async function verifyPermission(handle: FileSystemFileHandle): Promise<boolean> {
  try {
    if ("requestPermission" in handle && typeof handle.requestPermission === "function") {
      const permission = await handle.requestPermission({ mode: "read" });
      return permission === "granted";
    }
    // If requestPermission doesn't exist, assume we have permission
    return true;
  } catch (error) {
    console.warn("[FontLoader] Permission check failed:", error);
    return false;
  }
}

/**
 * Set the file to watch for live reload
 *
 * @param handle - FileSystemFileHandle to watch
 * @param fileName - Name of the file (used as key for smart overwrite)
 */
export function setWatchedFile(handle: FileSystemFileHandle, fileName: string): void {
  // Stop existing watcher before starting a new one
  stopLiveWatch();

  currentFileHandle = handle;
  currentFileName = fileName;
  lastModified = 0; // Will be set on first check
  syncError = null; // Clear any previous errors

  console.log(`[FontLoader] Watching file for live reload: ${fileName}`);
}

/**
 * Start live watching the current file
 * Polls every 1000ms and reloads if file changes
 *
 * @param onReload - Callback when file is reloaded
 */
export function startLiveWatch(onReload?: (font: CachedFont) => void): void {
  if (!currentFileHandle || !currentFileName) {
    console.warn("[FontLoader] No file handle set for live watching");
    return;
  }

  // Ensure any existing watcher is stopped before starting a new one
  stopLiveWatch();

  onReloadCallback = onReload || null;

  console.log(`[FontLoader] Starting live watch for: ${currentFileName}`);

  watchInterval = window.setInterval(async () => {
    try {
      // Verify permission before attempting to access file
      const hasPermission = await verifyPermission(currentFileHandle!);
      if (!hasPermission) {
        // Permission denied - set error state but don't stop watching
        syncError = "Permission denied";
        console.debug(`[Watcher] Permission check failed for ${currentFileName}, will retry`);
        return;
      } else {
        // Clear error if permission is granted
        syncError = null;
      }

      // Get file - handle cases where file is temporarily locked (e.g., during export)
      let file: File;
      try {
        file = await currentFileHandle!.getFile();
      } catch (error) {
        // Handle NotFoundError or SecurityError gracefully - don't stop watching
        // Font editors often temporarily delete/recreate files during export
        if (error instanceof DOMException) {
          if (error.name === "NotFoundError" || error.name === "SecurityError") {
            console.debug(
              `[Watcher] File temporarily unavailable (${error.name}): ${currentFileName} - will retry`
            );
            return; // Skip this check, will retry on next interval
          }
          // For other errors (like file locked), log but continue watching
          console.debug(`[Watcher] File temporarily unavailable: ${error.name} - will retry`);
          return; // Skip this check, will retry on next interval
        }
        // For unexpected errors, log but don't stop - might be temporary
        console.warn(`[Watcher] Unexpected error accessing file:`, error);
        return; // Will retry on next interval
      }

      const newModified = file.lastModified;

      // First check - just store the timestamp
      if (lastModified === 0) {
        lastModified = newModified;
        return;
      }

      // File has changed
      if (newModified !== lastModified) {
        console.log(`[Watcher] Change detected in ${currentFileName}, reloading...`);
        lastModified = newModified;

        // Reload the font
        await reloadWatchedFile();
      }
    } catch (error) {
      // Never stop watching due to errors - they're likely temporary
      // Only the user removing the font should stop the watch
      if (error instanceof DOMException) {
        if (error.name === "NotFoundError" || error.name === "SecurityError") {
          console.debug(
            `[Watcher] Temporary error (${error.name}): ${currentFileName} - will retry`
          );
        } else {
          console.warn(`[Watcher] Error checking file: ${error.name} - will retry`);
        }
      } else {
        console.warn("[Watcher] Unexpected error checking file:", error);
      }
      // Continue watching - will retry on next interval
    }
  }, 1000);
}

/**
 * Stop live watching
 */
export function stopLiveWatch(): void {
  if (watchInterval !== null) {
    clearInterval(watchInterval);
    watchInterval = null;
    console.log("[FontLoader] Stopped live watch");
  }
  onReloadCallback = null;
}

/**
 * Reload the currently watched file
 * Uses filename as key for smart overwrite
 * Preserves axis values from the current font
 */
async function reloadWatchedFile(): Promise<void> {
  if (!currentFileHandle || !currentFileName) {
    return;
  }

  try {
    // Get current font to preserve axis values
    const { useFontStore } = await import("../stores/fontStore");
    const state = useFontStore.getState();
    const existingFontId = state.fontsByFileName.get(currentFileName);
    const existingFont = existingFontId ? state.fonts.get(existingFontId) : null;

    // Preserve current axis values
    const preservedAxisValues: Record<string, number> = {};
    if (existingFont?.isVariable && existingFont.axes) {
      existingFont.axes.forEach((axis) => {
        preservedAxisValues[axis.tag] = axis.current ?? axis.default;
      });
    }

    const file = await currentFileHandle.getFile();

    // Load the font (FontCache will handle deduplication by hash)
    let cachedFont = await getOrParseFont(file);

    // Re-map preserved axis values to new font axes
    if (cachedFont.isVariable && cachedFont.axes && Object.keys(preservedAxisValues).length > 0) {
      const updatedAxes = cachedFont.axes.map((axis) => {
        const preservedValue = preservedAxisValues[axis.tag];
        // Use preserved value if it's within the axis range, otherwise use default
        const value =
          preservedValue !== undefined && preservedValue >= axis.min && preservedValue <= axis.max
            ? preservedValue
            : axis.default;

        return {
          ...axis,
          current: value,
        };
      });

      cachedFont = {
        ...cachedFont,
        axes: updatedAxes,
      };

      console.log(`[FontLoader] Preserved axis values:`, preservedAxisValues);
    }

    console.log(`[FontLoader] Reloaded font: ${cachedFont.name}`);

    // Update tabs with preserved axis values
    const { useUIStore } = await import("../stores/uiStore");
    const uiState = useUIStore.getState();
    const tabsForFont = uiState.tabs.filter((tab) => tab.fontId === existingFontId);

    // Update each tab's axis values to match preserved values
    for (const tab of tabsForFont) {
      const updatedAxisValues: Record<string, number> = {};
      if (cachedFont.isVariable && cachedFont.axes) {
        cachedFont.axes.forEach((axis) => {
          // Use preserved value if available and valid, otherwise use current tab value, otherwise default
          const preservedValue = preservedAxisValues[axis.tag];
          const tabValue = tab.settings.axisValues[axis.tag];

          let value = axis.default;
          if (
            preservedValue !== undefined &&
            preservedValue >= axis.min &&
            preservedValue <= axis.max
          ) {
            value = preservedValue;
          } else if (tabValue !== undefined && tabValue >= axis.min && tabValue <= axis.max) {
            value = tabValue;
          }

          updatedAxisValues[axis.tag] = value;
        });

        // Update tab with preserved axis values
        uiState.updateTabSettings(tab.id, { axisValues: updatedAxisValues });
      }
    }

    // Trigger reload callback if set
    if (onReloadCallback) {
      onReloadCallback(cachedFont);
    }

    // Force font re-registration with fresh data
    // Remove old FontFace if it exists, then add new one with same name
    const fontFamilyName = cachedFont.name.includes(" ") ? `"${cachedFont.name}"` : cachedFont.name;

    // Remove existing FontFace entries for this font family
    const existingFonts = Array.from(document.fonts);
    for (const fontFace of existingFonts) {
      if (fontFace.family === fontFamilyName || fontFace.family === `"${cachedFont.name}"`) {
        try {
          document.fonts.delete(fontFace);
        } catch (_e) {
          // Ignore errors when deleting
        }
      }
    }

    // Create new FontFace with fresh data
    const fontData = cachedFont.originalFileData || cachedFont.fileData;
    const format = cachedFont.format || "ttf";
    const blob = new Blob([fontData], {
      type:
        format === "woff2"
          ? "font/woff2"
          : format === "woff"
            ? "font/woff"
            : format === "otf"
              ? "font/otf"
              : "font/ttf",
    });
    const fontUrl = URL.createObjectURL(blob);

    const newFontFace = new FontFace(cachedFont.name, `url(${fontUrl})`, {
      display: "block",
      weight: "normal",
      style: "normal",
      unicodeRange: "U+0-10FFFF",
    });

    // Add to document.fonts
    document.fonts.add(newFontFace);

    // Load the font
    await newFontFace.load();
    await document.fonts.ready;

    console.log(`[FontLoader] Font re-registered: ${cachedFont.name}`);

    // Store URL for cleanup (will be cleaned up when font is removed)
    // @ts-expect-error - add objectUrl to font object for later cleanup
    cachedFont._objectUrl = fontUrl;

    // Dispatch custom event for UI updates (ensure it's on window for global access)
    // Use a small delay to ensure DOM updates are complete
    setTimeout(() => {
      const event = new CustomEvent("font-reloaded", {
        detail: {
          font: cachedFont,
          fileName: currentFileName,
          fontId: cachedFont.id,
        },
        bubbles: true,
        cancelable: false,
      });
      window.dispatchEvent(event);
      console.log(`[FontLoader] Dispatched font-reloaded event for: ${currentFileName}`);
    }, 0);
  } catch (error) {
    console.error("[FontLoader] Failed to reload file:", error);
  }
}

/**
 * Get current watch status
 */
export function getWatchStatus(): {
  isWatching: boolean;
  fileName: string | null;
  hasHandle: boolean;
  syncError: string | null;
} {
  return {
    isWatching: watchInterval !== null,
    fileName: currentFileName,
    hasHandle: currentFileHandle !== null,
    syncError,
  };
}

/**
 * Cache font (legacy function - now handled by FontCache)
 * This function is kept for backward compatibility but is essentially a no-op
 * since FontCache.getOrParseFont() already handles caching.
 *
 * @deprecated Use getOrParseFont() directly from FontCache
 */
export async function cacheFont(file: File): Promise<CachedFont> {
  // FontCache already handles caching in getOrParseFont()
  // This is just for backward compatibility
  console.warn("[FontLoader] cacheFont() is deprecated. FontCache handles caching automatically.");
  return getOrParseFont(file);
}

/**
 * Get cached font by hash
 * Delegates to FontCache.getCachedFontByHash()
 *
 * @param hash - SHA-256 hash of the font file
 * @returns Promise resolving to CachedFont or null
 */
export async function getCachedFont(hash: string): Promise<CachedFont | null> {
  return getCachedFontByHash(hash);
}

/**
 * Load multiple fonts (batch processing)
 * Delegates to FontCache.addFonts()
 *
 * @param files - Array of font files to load
 * @param onProgress - Optional progress callback
 * @returns Promise resolving to array of CachedFont results
 */
export async function loadFonts(
  files: File[],
  onProgress?: (current: number, total: number) => void
): Promise<CachedFont[]> {
  const results = await addFonts(files, onProgress);

  // Filter out failed results and return only successful CachedFont objects
  const successful: CachedFont[] = [];
  for (const result of results) {
    if (result.success && result.data) {
      successful.push(result.data);
    } else if (result.error) {
      console.error(`[FontLoader] Failed to load font: ${result.error}`);
    }
  }

  return successful;
}

/**
 * Get all cached fonts
 * @deprecated Use getLastCachedFont() for single-font model
 * Kept for backward compatibility but returns array with single font
 */
export async function getAllCachedFonts(): Promise<CachedFont[]> {
  const { getLastCachedFont: getLastCached } = await import("./cache/FontCacheDB");
  const { suiteToMetadata, suiteToCachedFont } = await import("./cache/FontCache");

  const lastCached = await getLastCached();
  if (!lastCached) {
    return [];
  }

  const metadata = suiteToMetadata(lastCached.metadata.extractionSuite);
  const cachedFont = suiteToCachedFont(
    lastCached.metadata.extractionSuite,
    metadata,
    lastCached.metadata.fileHash,
    lastCached.metadata.fileName,
    lastCached.file.fileData,
    lastCached.file.originalFileData,
    lastCached.file.format
  );

  return [cachedFont];
}

/**
 * Get the last cached font (most recently accessed)
 * Single-font model: Returns the single most recent font
 *
 * @returns Promise resolving to CachedFont or null if no cached font exists
 */
export async function getLastCachedFont(): Promise<CachedFont | null> {
  const { getLastCachedFont: getLastCached } = await import("./cache/FontCacheDB");
  const { suiteToMetadata, suiteToCachedFont } = await import("./cache/FontCache");

  const lastCached = await getLastCached();
  if (!lastCached) {
    return null;
  }

  const metadata = suiteToMetadata(lastCached.metadata.extractionSuite);
  const cachedFont = suiteToCachedFont(
    lastCached.metadata.extractionSuite,
    metadata,
    lastCached.metadata.fileHash,
    lastCached.metadata.fileName,
    lastCached.file.fileData,
    lastCached.file.originalFileData,
    lastCached.file.format
  );

  return cachedFont;
}

/**
 * Clear all cached fonts
 * Delegates to FontCacheDB.clearCache()
 */
export async function clearFontCache(): Promise<void> {
  const countBefore = (await getCacheStats()).metadataCount;
  await clearCache();
  const countAfter = (await getCacheStats()).metadataCount;

  console.log(
    `[FontLoader] Font cache cleared: ${countBefore} fonts removed, ${countAfter} remaining`
  );

  if (countAfter > 0) {
    console.warn("[FontLoader] WARNING: Cache clear may have failed - some fonts still in cache");
  } else {
    console.log("[FontLoader] ✓ Cache successfully cleared - all fonts removed");
  }
}

/**
 * Get cache status
 * Delegates to FontCacheDB.getCacheStats()
 *
 * @returns Promise resolving to cache statistics
 */
export async function getCacheStatus(): Promise<{
  count: number;
  fonts: CachedFont[];
}> {
  const stats = await getCacheStats();
  const allFonts = await getAllCachedFonts();

  return {
    count: stats.metadataCount,
    fonts: allFonts,
  };
}

// Expose cache clearing and status functions globally for debugging
if (typeof window !== "undefined") {
  window.__clearFontCache = async () => {
    const statusBefore = await getCacheStatus();
    console.log(`[FontLoader] Cache status before clear: ${statusBefore.count} fonts`);

    await clearFontCache();

    const statusAfter = await getCacheStatus();
    console.log(`[FontLoader] Cache status after clear: ${statusAfter.count} fonts`);

    if (statusAfter.count === 0) {
      console.log(
        "[FontLoader] ✓ Cache successfully cleared! Reload the page and re-upload your font to see the fix."
      );
      console.log(
        `Cache cleared! ${statusBefore.count} fonts removed. Reload and re-upload your font.`
      );
    } else {
      console.error("[FontLoader] ✗ Cache clear failed!", statusAfter);
      console.error(`Cache clear may have failed. ${statusAfter.count} fonts still in cache.`);
    }
  };

  window.__getCacheStatus = async () => {
    const status = await getCacheStatus();
    const stats = await getCacheStats();
    console.log(`[FontLoader] Cache status: ${status.count} fonts cached`);
    if (status.count > 0) {
      console.log(
        "[FontLoader] Cached fonts:",
        status.fonts.map((f) => ({
          id: `${f.id.slice(0, 8)}...`,
          name: f.name,
          isVariable: f.isVariable,
          namedVariations: f.namedVariations?.length || 0,
          firstVariationName: f.namedVariations?.[0]?.name || "N/A",
        }))
      );
    }
    return {
      count: status.count,
      size: stats.totalFileSize,
    };
  };

  console.log("[FontLoader] Debug commands available:");
  console.log("  - __clearFontCache() - Clear all cached fonts");
  console.log("  - __getCacheStatus() - Check cache status and see cached fonts");
}
