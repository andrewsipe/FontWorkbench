/**
 * Glyph Renderer Utility
 * Renders font glyphs to PNG/DataURL using offscreen canvas
 * Phase 6: Performance & Rendering - Font previews without @font-face registration
 *
 * This allows showing font previews in the sidebar without registering
 * every single font in the user's library as a CSS @font-face.
 */

import type { CachedFont } from "../../types/font.types";

export interface GlyphRenderOptions {
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  padding?: number;
  width?: number;
  height?: number;
  antialiasing?: boolean;
}

const DEFAULT_OPTIONS: Required<GlyphRenderOptions> = {
  fontSize: 48,
  fontColor: "#000000",
  backgroundColor: "#ffffff",
  padding: 8,
  width: 64,
  height: 64,
  antialiasing: true,
};

/**
 * Render a character from a font to a DataURL (PNG)
 * Uses an offscreen canvas to avoid polluting the DOM
 *
 * @param font - CachedFont to render from
 * @param character - Character to render
 * @param options - Rendering options
 * @returns Promise resolving to DataURL string
 */
export async function renderGlyphToDataURL(
  font: CachedFont,
  character: string,
  options: GlyphRenderOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Create offscreen canvas
  const canvas = document.createElement("canvas");
  canvas.width = opts.width;
  canvas.height = opts.height;

  const ctx = canvas.getContext("2d", {
    alpha: opts.backgroundColor === "transparent",
    antialias: opts.antialiasing,
  }) as CanvasRenderingContext2D | null;

  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  // Set up font loading
  const fontData = font.originalFileData || font.fileData;
  const format = font.format || "ttf";
  const base64 = arrayBufferToBase64(fontData);
  const dataUrl = `data:font/${format};base64,${base64}`;

  // Create a temporary FontFace to measure and render
  const fontFamilyName = `preview-${font.id}-${Date.now()}`;
  const fontFace = new FontFace(fontFamilyName, `url(${dataUrl}) format('${format}')`);

  try {
    await fontFace.load();
    // Add to document.fonts temporarily
    document.fonts.add(fontFace);
  } catch (error) {
    throw new Error(
      `Failed to load font for rendering: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Cleanup function
  const cleanup = () => {
    try {
      document.fonts.delete(fontFace);
    } catch {
      // Ignore cleanup errors
    }
  };

  // Set background
  if (opts.backgroundColor !== "transparent") {
    ctx.fillStyle = opts.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Set font properties
  const fontString = `${opts.fontSize}px "${fontFamilyName}"`;

  // Apply variable font axis values if present
  if (font.isVariable && font.axes && font.axes.length > 0) {
    const variationSettings: string[] = [];
    font.axes.forEach((axis) => {
      const value = axis.current ?? axis.default;
      variationSettings.push(`"${axis.tag}" ${value}`);
    });
    if (variationSettings.length > 0) {
      ctx.fontVariationSettings = variationSettings.join(", ");
    }
  }

  ctx.font = fontString;
  ctx.fillStyle = opts.fontColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Render character
  const x = canvas.width / 2;
  const y = canvas.height / 2;

  ctx.fillText(character, x, y);

  // Cleanup
  cleanup();

  // Convert to DataURL
  return canvas.toDataURL("image/png");
}

/**
 * Render multiple characters to a single DataURL
 * Useful for rendering preview text like "Aa" or "Sample"
 *
 * @param font - CachedFont to render from
 * @param text - Text to render
 * @param options - Rendering options
 * @returns Promise resolving to DataURL string
 */
export async function renderTextToDataURL(
  font: CachedFont,
  text: string,
  options: GlyphRenderOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Calculate width based on text length
  const estimatedWidth = Math.max(opts.width, text.length * opts.fontSize * 0.6 + opts.padding * 2);

  // Create offscreen canvas
  const canvas = document.createElement("canvas");
  canvas.width = estimatedWidth;
  canvas.height = opts.height;

  const ctx = canvas.getContext("2d", {
    alpha: opts.backgroundColor === "transparent",
    antialias: opts.antialiasing,
  }) as CanvasRenderingContext2D | null;

  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  // Set up font loading
  const fontData = font.originalFileData || font.fileData;
  const format = font.format || "ttf";
  const base64 = arrayBufferToBase64(fontData);
  const dataUrl = `data:font/${format};base64,${base64}`;

  // Create a temporary FontFace
  const fontFamilyName = `preview-${font.id}-${Date.now()}`;
  const fontFace = new FontFace(fontFamilyName, `url(${dataUrl}) format('${format}')`);

  try {
    await fontFace.load();
    // Add to document.fonts temporarily
    document.fonts.add(fontFace);
  } catch (error) {
    throw new Error(
      `Failed to load font for rendering: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Cleanup function
  const cleanup = () => {
    try {
      document.fonts.delete(fontFace);
    } catch {
      // Ignore cleanup errors
    }
  };

  // Set background
  if (opts.backgroundColor !== "transparent") {
    ctx.fillStyle = opts.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Set font properties
  const fontString = `${opts.fontSize}px "${fontFamilyName}"`;

  // Apply variable font axis values if present
  if (font.isVariable && font.axes && font.axes.length > 0) {
    const variationSettings: string[] = [];
    font.axes.forEach((axis) => {
      const value = axis.current ?? axis.default;
      variationSettings.push(`"${axis.tag}" ${value}`);
    });
    if (variationSettings.length > 0) {
      ctx.fontVariationSettings = variationSettings.join(", ");
    }
  }

  ctx.font = fontString;
  ctx.fillStyle = opts.fontColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Render text
  const x = canvas.width / 2;
  const y = canvas.height / 2;

  ctx.fillText(text, x, y);

  // Cleanup
  cleanup();

  // Convert to DataURL
  return canvas.toDataURL("image/png");
}

/**
 * Convert ArrayBuffer to Base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Cache for rendered glyphs to avoid re-rendering
 */
const glyphCache = new Map<string, string>();

/**
 * Get cached glyph or render new one
 *
 * @param font - CachedFont to render from
 * @param character - Character to render
 * @param options - Rendering options
 * @returns Promise resolving to DataURL string
 */
export async function getCachedGlyph(
  font: CachedFont,
  character: string,
  options: GlyphRenderOptions = {}
): Promise<string> {
  const cacheKey = `${font.id}-${character}-${JSON.stringify(options)}`;

  if (glyphCache.has(cacheKey)) {
    return glyphCache.get(cacheKey)!;
  }

  const dataUrl = await renderGlyphToDataURL(font, character, options);
  glyphCache.set(cacheKey, dataUrl);

  // Limit cache size to prevent memory issues
  if (glyphCache.size > 1000) {
    const firstKey = glyphCache.keys().next().value;
    if (firstKey !== undefined) {
      glyphCache.delete(firstKey);
    }
  }

  return dataUrl;
}

/**
 * Clear the glyph cache
 */
export function clearGlyphCache(): void {
  glyphCache.clear();
}
