/**
 * Adobe NotDef fallback font loader (OFL-1.1).
 * Registers the NotDef font so missing glyphs render as a consistent .notdef
 * square instead of the browser's default fallback glyph.
 *
 * This version loads the font from GitHub at runtime so we don't have to
 * bundle the binary in this app.
 */

export const NOTDEF_FAMILY = "Adobe NotDef";

const NOTDEF_URL =
  "https://raw.githubusercontent.com/andrewsipe/Fontrapunkt-2/main/src/assets/fonts/AND-Regular.otf";

let loadPromise: Promise<void> | null = null;

/**
 * Load Adobe NotDef into document.fonts. Idempotent.
 */
export async function loadNotDefFallback(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;

  const alreadyLoaded = Array.from(document.fonts).some(
    (f) => f.family === NOTDEF_FAMILY && f.status === "loaded"
  );
  if (alreadyLoaded) return;

  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const fontFace = new FontFace(NOTDEF_FAMILY, `url(${NOTDEF_URL}) format("opentype")`, {
      display: "block",
    });
    await fontFace.load();
    document.fonts.add(fontFace);
  })();

  return loadPromise;
}

/**
 * Build CSS font-family stack: current font, then Adobe NotDef, then sans-serif.
 * Quote font name when it contains spaces.
 */
export function getCanvasFontStack(fontName: string): string {
  const trimmed = fontName.trim();
  if (!trimmed) return `"${NOTDEF_FAMILY}", sans-serif`;
  const quoted = trimmed.includes(" ") ? `"${trimmed}"` : trimmed;
  return `${quoted}, "${NOTDEF_FAMILY}", sans-serif`;
}

