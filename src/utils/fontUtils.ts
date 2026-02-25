/**
 * Font utility functions
 */

import type { CachedFont } from "../types/font.types";

/**
 * Check if file is a valid font format
 */
export function isValidFontFile(file: File): boolean {
  const validExtensions = [".ttf", ".otf", ".woff", ".woff2"];
  const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  return validExtensions.includes(extension);
}

/**
 * Get font format from file extension
 */
export function getFontFormat(fileName: string): CachedFont["format"] {
  const extension = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  switch (extension) {
    case ".ttf":
      return "ttf";
    case ".otf":
      return "otf";
    case ".woff":
      return "woff";
    case ".woff2":
      return "woff2";
    default:
      return "ttf";
  }
}

/**
 * Check file magic numbers to validate font format
 */
export async function validateFontFile(file: File): Promise<boolean> {
  const buffer = await file.slice(0, 4).arrayBuffer();
  const view = new Uint8Array(buffer);

  // TTF/OTF: 0x00 0x01 0x00 0x00 or 'OTTO' or 'ttcf'
  // WOFF: 'wOFF'
  // WOFF2: 'wOF2'
  const magic = String.fromCharCode(...view);
  return (
    magic === "\x00\x01\x00\x00" ||
    magic === "OTTO" ||
    magic.startsWith("ttcf") ||
    magic === "wOFF" ||
    magic === "wOF2"
  );
}

/**
 * Generate content hash for font file (for caching)
 */
export async function generateFontHash(arrayBuffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Load font into browser's font system globally
 * This ensures the font is available to all components
 * Enhanced with comprehensive diagnostics
 */
export async function loadFontGlobally(font: CachedFont): Promise<void> {
  console.group(`[fontUtils] Loading font: ${font.name}`);

  const fontFamilyName = font.name.includes(" ") ? `"${font.name}"` : font.name;

  console.log("Step 1: Checking existing fonts");
  await document.fonts.ready;
  const existingFonts = Array.from(document.fonts);
  console.log(
    "Document fonts:",
    existingFonts.map((f) => ({
      family: f.family,
      status: f.status,
      style: f.style,
      weight: f.weight,
    }))
  );

  const alreadyLoaded = existingFonts.some(
    (f) => (f.family === fontFamilyName || f.family === `"${font.name}"`) && f.status === "loaded"
  );

  if (alreadyLoaded) {
    console.log(`✓ Font already loaded`);
    console.groupEnd();
    return;
  }

  try {
    console.log("Step 2: Creating blob and Object URL");
    // Use original compressed format if available (smaller, browser-native)
    // Otherwise use decompressed data (works fine for TTF/OTF)
    const fontData = font.originalFileData || font.fileData;
    const usingOriginal = !!font.originalFileData;
    console.log("Font data source:", {
      usingOriginal,
      format: font.format,
      originalSize: font.originalFileData?.byteLength || "N/A",
      decompressedSize: font.fileData.byteLength,
      isVariable: font.isVariable,
    });

    const blob = new Blob([fontData], {
      type:
        font.format === "woff2"
          ? "font/woff2"
          : font.format === "woff"
            ? "font/woff"
            : font.format === "otf"
              ? "font/otf"
              : "font/ttf",
    });
    const fontUrl = URL.createObjectURL(blob);
    console.log("Object URL created:", fontUrl);
    console.log("Blob size:", blob.size, "bytes");
    console.log("Blob type:", blob.type);

    console.log("Step 3: Creating FontFace");
    const fontFace = new FontFace(font.name, `url(${fontUrl})`, {
      display: "block", // Changed from 'swap' to ensure font loads before display
      weight: "normal",
      style: "normal",
      unicodeRange: "U+0-10FFFF", // Ensure full Unicode range
    });

    console.log("Step 4: Adding to document.fonts");
    document.fonts.add(fontFace);

    console.log("Step 5: Loading font");
    await fontFace.load();

    console.log("Step 6: Verifying load status");
    console.log("FontFace status:", fontFace.status);
    console.log("FontFace family:", fontFace.family);

    // Verify load was successful - check FontFace status directly
    // This is more reliable than document.fonts lookup which can have timing issues
    if (fontFace.status !== "loaded") {
      console.warn(`⚠️ FontFace status is "${fontFace.status}" instead of "loaded"`);
      throw new Error(`Font failed to load: ${fontFace.status}`);
    }

    // Wait for font to be ready (allows browser to fully register it)
    await document.fonts.ready;

    // Optional: Try to find in document.fonts (may not always be immediately available)
    const loadedFont = Array.from(document.fonts).find(
      (f) => (f.family === fontFamilyName || f.family === `"${font.name}"`) && f.status === "loaded"
    );

    if (loadedFont) {
      console.log("✓ Font verified in document.fonts");
    } else {
      // Not a critical error - FontFace.status is the authoritative source
      // document.fonts lookup can have timing issues but font still works
      console.log(
        "ℹ️ Font loaded (FontFace.status confirmed), may not appear in document.fonts immediately"
      );
    }

    console.log(`✓ Font loaded successfully`);
    console.groupEnd();

    // Store URL reference for cleanup (don't revoke immediately)
    // @ts-expect-error - add objectUrl to font object for later cleanup
    font._objectUrl = fontUrl;
  } catch (error) {
    console.error(`✗ Font load failed:`, error);
    console.error("Error details:", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    console.groupEnd();
    throw error;
  }
}

/**
 * Cleanup font Object URL (call when font is removed)
 */
export function cleanupFontUrl(font: CachedFont): void {
  // @ts-expect-error - accessing private property
  if (font._objectUrl) {
    // @ts-expect-error - accessing private property
    URL.revokeObjectURL(font._objectUrl);
    // @ts-expect-error - accessing private property
    delete font._objectUrl;
    console.log(`[fontUtils] Cleaned up Object URL for ${font.name}`);
  }
}
