/**
 * Table definitions and reference flags for Font Source.
 * Used for the definition popover and the reference-table clarifier.
 */

export type TableDefinition = {
  definition: string;
  reference?: boolean;
  /** Primary spec: OpenType, TrueType, AAT, Graphite, or FontForge. */
  spec?: string;
};

export const TABLE_DEFINITIONS: Record<string, TableDefinition> = {
  // Core
  head: {
    definition:
      "Font header: version, units per em, global bbox, index-to-loc format, and other font-wide settings.",
    spec: "OpenType",
  },
  maxp: {
    definition:
      "Maximum profile: glyph count and limits for points, contours, and composite depth. Used for safe allocation.",
    spec: "OpenType",
  },
  hhea: {
    definition:
      "Horizontal metrics header: ascender, descender, line gap, advance width max, and number of h metric entries.",
    spec: "OpenType",
  },
  vhea: {
    definition:
      "Vertical metrics header: vertical typographic ascender, descender, and related values for vertical layout.",
    spec: "OpenType",
  },
  name: {
    definition:
      "Naming table: font family, subfamily, typographic names, license, and other name IDs.",
    spec: "OpenType",
  },
  "OS/2": {
    definition:
      "OS/2 and Windows metrics: weight and width classes, Unicode ranges, embedding, Panose, and typo ascender/descender.",
    spec: "OpenType",
  },
  post: {
    definition:
      "PostScript information: italic angle, underline metrics, and glyph name format or index.",
    spec: "OpenType",
  },
  cmap: {
    definition:
      "Character to glyph index maps. Encodings from Unicode or other encodings to glyph IDs for text shaping.",
    spec: "OpenType",
  },

  // Outlines
  loca: {
    definition:
      "Index to locations of glyph data in the 'glyf' table. Enables random access to each glyph.",
    spec: "TrueType",
  },
  glyf: {
    definition:
      "Glyph outlines and composite definitions for TrueType. Contour and component data per glyph.",
    spec: "TrueType",
  },
  "CFF ": {
    definition:
      "Compact Font Format: PostScript-style outlines. Used in OpenType CFF and CFF2 fonts.",
    spec: "OpenType",
  },
  CFF2: {
    definition:
      "CFF2: variable-font CFF. Outlines expressed as a variation-aware charstring program.",
    spec: "OpenType",
  },
  "cvt ": {
    definition:
      "Control Value Table. Predefined values used by TrueType instructions (prep, fpgm, and glyph programs).",
    spec: "TrueType",
  },
  prep: {
    definition:
      "Font program. TrueType bytecode run once when the font is loaded. Used to tune the interpreter.",
    spec: "TrueType",
  },
  fpgm: {
    definition:
      "Font program. TrueType bytecode run once when the font is loaded. Defines functions for glyph programs.",
    spec: "TrueType",
  },

  // Metrics
  hmtx: {
    definition:
      "Horizontal metrics: advance width and left side bearing per glyph. Used for layout and placement.",
    spec: "OpenType",
  },
  vmtx: {
    definition:
      "Vertical metrics: advance height and top side bearing per glyph for vertical layout.",
    spec: "OpenType",
  },

  // Layout
  GSUB: {
    definition:
      "Glyph Substitution: lookups for ligatures, context and chained context substitution, and related features.",
    spec: "OpenType",
  },
  GPOS: {
    definition:
      "Glyph Positioning: lookups for kerning, mark-to-base, mark-to-ligature, and other positioning.",
    spec: "OpenType",
  },
  GDEF: {
    definition:
      "Glyph Definition: glyph classes, attachment lists, ligature carets, and mark attachment used by GSUB/GPOS.",
    spec: "OpenType",
  },
  JSTF: {
    definition:
      "Justification: optional justification-related data. Often not present in OpenType fonts.",
    spec: "OpenType",
  },
  kern: {
    definition:
      "Kerning: pairs or classes of kerning values. Legacy; GPOS is preferred in OpenType.",
    spec: "OpenType",
  },
  morx: {
    definition:
      "AAT (Apple Advanced Typography) metamorphosis: non-Contextual substitution and positioning.",
    spec: "AAT",
  },
  mort: {
    definition: "AAT mort: older metamorphosis table. morx is the recommended replacement.",
    spec: "AAT",
  },
  feat: { definition: "AAT feature: name and settings for AAT layout features.", spec: "AAT" },

  // Variable
  fvar: {
    definition:
      "Font variations: axis definitions (tag, min, default, max) and named instances with coordinates and subfamily name IDs.",
    spec: "OpenType",
  },
  avar: {
    definition:
      "Axis variations. Maps normalized axis coordinates to a modified design space. Used to adjust how axis positions are distributed.",
    reference: true,
    spec: "OpenType",
  },
  MVAR: {
    definition:
      "Metrics variations. Per-region deltas for tagged metrics (ascender, descender, caret slope, etc.) across the variation space.",
    reference: true,
    spec: "OpenType",
  },
  STAT: {
    definition:
      "Style attributes: design axes, axis value tables (labels and ranges), and elided fallback. Used for UI and legacy family models.",
    spec: "OpenType",
  },
  HVAR: {
    definition:
      "Horizontal metrics variations. Per-region deltas for advance width, LSB, and RSB across the variation space.",
    reference: true,
    spec: "OpenType",
  },
  VVAR: {
    definition:
      "Vertical metrics variations. Per-region deltas for advance height, TSB, BSB, and VOrg across the variation space.",
    reference: true,
    spec: "OpenType",
  },
  cvar: {
    definition:
      "CVT variations. TrueType Control Value Table deltas per variation region. Used by the TrueType interpreter.",
    reference: true,
    spec: "TrueType",
  },
  gvar: {
    definition:
      "Glyph variations. Per-glyph outline deltas across the variation space. Drives interpolation of contours in variable fonts.",
    reference: true,
    spec: "TrueType",
  },

  // Bitmap
  EBDT: {
    definition: "Embedded bitmap data: glyph bitmaps for the embedded bitmap locator (EBLC).",
  },
  ebdt: {
    definition: "Embedded bitmap data (lowercase): glyph bitmaps for the embedded bitmap locator.",
  },
  EBLC: { definition: "Embedded bitmap location: indices and metrics for glyphs in the EBDT." },
  eblc: {
    definition: "Embedded bitmap location (lowercase): indices and metrics for glyphs in the EBDT.",
  },
  EBSC: { definition: "Embedded bitmap scaling: scaling and alignment for embedded bitmaps." },
  CBDT: {
    definition: "Color bitmap data: color glyph bitmaps for the color bitmap locator (CBLC).",
  },
  cbdt: {
    definition: "Color bitmap data (lowercase): color glyph bitmaps for the color bitmap locator.",
  },
  CBLC: { definition: "Color bitmap location: indices and metrics for color glyphs in the CBDT." },
  cblc: {
    definition:
      "Color bitmap location (lowercase): indices and metrics for color glyphs in the CBDT.",
  },
  sbix: { definition: "Standard bitmap graphics: optional bitmap or image data for glyphs." },

  // Other
  gasp: {
    definition:
      "Grid-fitting and scan-conversion: recommended rendering mode (e.g. grayscale, gridfit) at specific sizes.",
    spec: "OpenType",
  },
  VORG: {
    definition: "Vertical origin: vertical origin of glyphs for vertical layout.",
    spec: "OpenType",
  },
  DSIG: {
    definition: "Digital signature: cryptographic signature for the font.",
    spec: "OpenType",
  },
  LTSH: {
    definition: "Linear threshold: per-glyph data used in some rasterizers.",
    spec: "OpenType",
  },
  vdmx: {
    definition: "Vertical device metrics: precomputed vertical metrics at particular sizes.",
    spec: "OpenType",
  },
  VDMX: {
    definition: "Vertical device metrics: precomputed vertical metrics at particular sizes.",
    spec: "OpenType",
  },
  hdmx: {
    definition: "Horizontal device metrics: precomputed horizontal metrics at particular sizes.",
    spec: "OpenType",
  },
  HDMX: {
    definition: "Horizontal device metrics: precomputed horizontal metrics at particular sizes.",
    spec: "OpenType",
  },
  COLR: {
    definition: "Color: layered color glyphs (fill and clip) for multi-color glyphs.",
    spec: "OpenType",
  },
  CPAL: {
    definition: "Color palette: palette entries used by COLR and other color tables.",
    spec: "OpenType",
  },
  meta: {
    definition: "Metadata: optional metadata (e.g. design-language tags) in a defined format.",
    spec: "OpenType",
  },
  "SVG ": {
    definition: "SVG: optional Scalable Vector Graphics for glyphs or other art.",
    spec: "OpenType",
  },
  BASE: {
    definition: "Baseline: baseline and script data for complex scripts and alignment.",
    spec: "OpenType",
  },
  MATH: { definition: "Math: math formula layout and construction.", spec: "OpenType" },
  PCLT: { definition: "PCL 5: PCL 5 data including symbol set and spacing." },
  MERG: { definition: "Merge: AAT merge table for combining glyphs.", spec: "AAT" },
  bsln: { definition: "Baseline: AAT baseline table.", spec: "AAT" },
  acnt: { definition: "Attachment: AAT glyph attachment.", spec: "AAT" },
  ankr: { definition: "Anchor: AAT anchor points.", spec: "AAT" },
  trak: { definition: "Track: AAT track data for line spacing.", spec: "AAT" },
  ltag: { definition: "Language: language tags used in OpenType.", spec: "OpenType" },
  Zapf: { definition: "Zapf: AAT table (Zapf Dingbats or related).", spec: "AAT" },
  Silf: { definition: "Silf: Graphite smart substitution/positioning.", spec: "Graphite" },
  Glat: { definition: "Glat: Graphite glyph attributes.", spec: "Graphite" },
  Gloc: { definition: "Gloc: Graphite glyph to pass location.", spec: "Graphite" },
  Feat: { definition: "Feat: Graphite feature specification.", spec: "Graphite" },
  Sill: { definition: "Sill: Graphite feature and language names.", spec: "Graphite" },
  // FontForge
  PfEd: {
    definition:
      "FontForge extensions: per-glyph colors, comments, font log, cvt comments, GPOS/GSUB names, guidelines, layers.",
    spec: "FontForge",
  },
  FFTM: {
    definition: "FontForge timestamps: font and source creation and modification.",
    spec: "FontForge",
  },
  "TeX ": { definition: "TeX metrics: ftpm, htdp, sbsp subtables.", spec: "FontForge" },
  "BDF ": {
    definition: "BDF properties: property records for bitmap strike metadata.",
    spec: "FontForge",
  },
};

export function getTableDefinition(tag: string): TableDefinition {
  return (
    TABLE_DEFINITIONS[tag] ?? {
      definition:
        "Table present in the font. See the OpenType specification or fonttools (ttx) for structure and semantics.",
      reference: false,
    }
  );
}

export const REFERENCE_TABLE_CLARIFIER =
  "This table contains low-level data (coordinates, deltas, variation regions) used by the rasterizer. We show only quantities and a short description. For full inspection, use fonttools (ttx) or a font-creation tool (e.g. Glyphs, FontForge).";
