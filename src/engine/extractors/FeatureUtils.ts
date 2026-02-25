// @ts-nocheck — Untyped third-party APIs (opentype.js / fontkit); type checking disabled for this file.
/**
 * Feature utility functions
 * Helper functions for OpenType feature processing
 * Migrated from fontParserHelpers.ts
 */

// OpenType feature friendly names from Microsoft OpenType spec
// Source: https://learn.microsoft.com/en-us/typography/opentype/spec/featurelist
const FEATURE_NAMES: Record<string, string> = {
  aalt: "Access All Alternates",
  abvf: "Above-base Forms",
  abvm: "Above-base Mark Positioning",
  abvs: "Above-base Substitutions",
  afrc: "Alternative Fractions",
  akhn: "Akhand",
  apkn: "Kerning for Alternate Proportional Widths",
  blwf: "Below-base Forms",
  blwm: "Below-base Mark Positioning",
  blws: "Below-base Substitutions",
  calt: "Contextual Alternates",
  case: "Case-sensitive Forms",
  ccmp: "Glyph Composition / Decomposition",
  cfar: "Conjunct Form After Ro",
  chws: "Contextual Half-width Spacing",
  cjct: "Conjunct Forms",
  clig: "Contextual Ligatures",
  cpct: "Centered CJK Punctuation",
  cpsp: "Capital Spacing",
  cswh: "Contextual Swash",
  curs: "Cursive Positioning",
  c2pc: "Petite Capitals From Capitals",
  c2sc: "Small Capitals From Capitals",
  dist: "Distances",
  dlig: "Discretionary Ligatures",
  dnom: "Denominators",
  dtls: "Dotless Forms",
  expt: "Expert Forms",
  falt: "Final Glyph on Line Alternates",
  fin2: "Terminal Forms #2",
  fin3: "Terminal Forms #3",
  fina: "Terminal Forms",
  flac: "Flattened Accent Forms",
  frac: "Fractions",
  fwid: "Full Widths",
  half: "Half Forms",
  haln: "Halant Forms",
  halt: "Alternate Half Widths",
  hist: "Historical Forms",
  hkna: "Horizontal Kana Alternates",
  hlig: "Historical Ligatures",
  hngl: "Hangul",
  hojo: "Hojo Kanji Forms (JIS X 0212-1990 Kanji Forms)",
  hwid: "Half Widths",
  init: "Initial Forms",
  isol: "Isolated Forms",
  ital: "Italics",
  jalt: "Justification Alternates",
  jp78: "JIS78 Forms",
  jp83: "JIS83 Forms",
  jp90: "JIS90 Forms",
  jp04: "JIS2004 Forms",
  kern: "Kerning",
  lfbd: "Left Bounds",
  liga: "Standard Ligatures",
  ljmo: "Leading Jamo Forms",
  lnum: "Lining Figures",
  locl: "Localized Forms",
  ltra: "Left-to-right Alternates",
  ltrm: "Left-to-right Mirrored Forms",
  mark: "Mark Positioning",
  med2: "Medial Forms #2",
  medi: "Medial Forms",
  mgrk: "Mathematical Greek",
  mkmk: "Mark to Mark Positioning",
  mset: "Mark Positioning via Substitution",
  nalt: "Alternate Annotation Forms",
  nlck: "NLC Kanji Forms",
  nukt: "Nukta Forms",
  numr: "Numerators",
  onum: "Oldstyle Figures",
  opbd: "Optical Bounds",
  ordn: "Ordinals",
  ornm: "Ornaments",
  palt: "Proportional Alternate Widths",
  pcap: "Petite Capitals",
  pkna: "Proportional Kana",
  pnum: "Proportional Figures",
  pref: "Pre-base Forms",
  pres: "Pre-base Substitutions",
  pstf: "Post-base Forms",
  psts: "Post-base Substitutions",
  pwid: "Proportional Widths",
  qwid: "Quarter Widths",
  rand: "Randomize",
  rclt: "Required Contextual Alternates",
  rkrf: "Rakar Forms",
  rlig: "Required Ligatures",
  rphf: "Reph Form",
  rtbd: "Right Bounds",
  rtla: "Right-to-left Alternates",
  rtlm: "Right-to-left Mirrored Forms",
  ruby: "Ruby Notation Forms",
  rvrn: "Required Variation Alternates",
  salt: "Stylistic Alternates",
  sinf: "Scientific Inferiors",
  size: "Optical size",
  smcp: "Small Capitals",
  smpl: "Simplified Forms",
  // Stylistic Sets (ss01-ss20) are generated dynamically - see getFeatureName()
  ssty: "Math Script-style Alternates",
  stch: "Stretching Glyph Decomposition",
  subs: "Subscript",
  sups: "Superscript",
  swsh: "Swash",
  titl: "Titling",
  tjmo: "Trailing Jamo Forms",
  tnam: "Traditional Name Forms",
  tnum: "Tabular Figures",
  trad: "Traditional Forms",
  twid: "Third Widths",
  unic: "Unicase",
  valt: "Alternate Vertical Metrics",
  vapk: "Kerning for Alternate Proportional Vertical Metrics",
  vatu: "Vattu Variants",
  vchw: "Vertical Contextual Half-width Spacing",
  vert: "Vertical Alternates",
  vhal: "Alternate Vertical Half Metrics",
  vjmo: "Vowel Jamo Forms",
  vkna: "Vertical Kana Alternates",
  vkrn: "Vertical Kerning",
  vpal: "Proportional Alternate Vertical Metrics",
  vrt2: "Vertical Alternates and Rotation",
  vrtr: "Vertical Alternates for Rotation",
  zero: "Slashed Zero",
  // Character Variants (cv01-cv99) are generated dynamically - see getFeatureName()
};

/**
 * Robustly resolve any nameID-like value into a number.
 * Handles numbers, numeric strings, and nested objects
 * like { value }, { id }, { nameID }, { subfamilyNameID }, etc.
 */
export function resolveNameId(value: any): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const n = parseInt(value.trim().replace(/\D.*$/, ""), 10);
    return Number.isFinite(n) ? n : null;
  }

  if (typeof value === "object") {
    const keys = [
      "value",
      "id",
      "nameID",
      "nameId",
      "subfamilyNameID",
      "subfamilyNameId",
      "UINameID",
      "uiNameID",
      "uinameid",
    ];

    for (const k of keys) {
      if (k in value) {
        const resolved = resolveNameId((value as any)[k]);
        if (resolved !== null) return resolved;
      }
    }
  }

  return null;
}

/**
 * Get friendly name for an OpenType feature tag
 * Handles stylistic sets (ss01-ss20) and character variants (cv01-cv99) dynamically
 */
export function getFeatureName(tag: string): string {
  if (!tag) return `OpenType feature: ${tag}`;

  // Check static FEATURE_NAMES first
  if (FEATURE_NAMES[tag]) return FEATURE_NAMES[tag];

  // Generate stylistic set names (ss01-ss20)
  const ssMatch = tag.match(/^ss(\d{2})$/);
  if (ssMatch) {
    const ssNum = parseInt(ssMatch[1], 10);
    if (ssNum >= 1 && ssNum <= 20) return `Stylistic Set ${ssNum}`;
  }

  // Generate character variant names (cv01-cv99)
  const cvMatch = tag.match(/^cv(\d{2})$/);
  if (cvMatch) {
    const cvNum = parseInt(cvMatch[1], 10);
    if (cvNum >= 1 && cvNum <= 99) return `Character Variant ${cvNum}`;
  }

  // Fallback
  return `OpenType feature: ${tag}`;
}

/**
 * Map feature tag to category
 * Expanded grouping system:
 * - stylistic: Stylistic sets, character variants, stylistic alternates
 * - ligature: All ligature features
 * - script: Script/decorative features (swash, contextual, forms)
 * - figure: Figures and math-related features
 * - capital: All capital-related features
 * - positional: Positioning features (kerning, marks, superscript, subscript)
 * - other: Everything else
 */
export function mapFeatureToCategory(
  tag: string
): "stylistic" | "ligature" | "script" | "figure" | "capital" | "positional" | "other" {
  const lowerTag = tag.toLowerCase();

  // Stylistic Sets and Character Variants (first priority)
  if (lowerTag.startsWith("ss") || lowerTag.startsWith("cv")) return "stylistic";
  if (lowerTag === "salt") return "stylistic";

  // Ligatures (all ligature features grouped)
  if (
    lowerTag.includes("liga") ||
    lowerTag === "dlig" ||
    lowerTag === "clig" ||
    lowerTag === "hlig" ||
    lowerTag === "rlig"
  )
    return "ligature";

  // Script features (swash, contextual, forms)
  if (
    lowerTag === "swsh" ||
    lowerTag === "cswh" ||
    lowerTag === "calt" ||
    lowerTag === "init" ||
    lowerTag === "medi" ||
    lowerTag === "fina" ||
    lowerTag === "isol" ||
    lowerTag === "fin2" ||
    lowerTag === "fin3"
  )
    return "script";

  // Figures and Math (expanded)
  if (
    lowerTag.includes("num") ||
    lowerTag.includes("frac") ||
    lowerTag === "onum" ||
    lowerTag === "lnum" ||
    lowerTag === "tnum" ||
    lowerTag === "pnum" ||
    lowerTag === "numr" ||
    lowerTag === "dnom" ||
    lowerTag === "sinf" ||
    lowerTag === "ordn" ||
    lowerTag === "afrc" ||
    lowerTag === "mgrk" ||
    lowerTag === "ssty"
  )
    return "figure";

  // Capital forms (all cap-related)
  if (
    lowerTag === "smcp" ||
    lowerTag === "c2sc" ||
    lowerTag === "pcap" ||
    lowerTag === "c2pc" ||
    lowerTag === "case" ||
    lowerTag === "cpsp" ||
    lowerTag === "titl" ||
    lowerTag === "unic"
  )
    return "capital";

  // Positional (kerning, marks, superscript, subscript)
  if (
    lowerTag.includes("kern") ||
    lowerTag.includes("mark") ||
    lowerTag === "sups" ||
    lowerTag === "subs" ||
    lowerTag === "mkmk" ||
    lowerTag === "mset"
  )
    return "positional";

  return "other";
}

/**
 * Sort OpenType features
 * Prioritizes stylistic sets first, then other categories
 */
export function sortFeatures(
  features: Array<{
    category: string;
    name: string;
    tag: string;
    [key: string]: any;
  }>
): Array<any> {
  if (!features?.length) return [];
  const categoryOrder: Record<string, number> = {
    stylistic: 0, // First priority - stylistic sets
    ligature: 1,
    script: 2,
    figure: 3,
    capital: 4,
    positional: 5,
    other: 6,
  };
  return [...features].sort((a, b) => {
    const orderA = categoryOrder[a.category as string] ?? 99;
    const orderB = categoryOrder[b.category as string] ?? 99;
    if (orderA !== orderB) return orderA - orderB;

    // Within stylistic category, sort SS01-SS20 first, then CV01-CV99, then alphabetical
    if (a.category === "stylistic" && b.category === "stylistic") {
      const aIsSS = /^ss\d{2}$/i.test(a.tag);
      const bIsSS = /^ss\d{2}$/i.test(b.tag);
      if (aIsSS && !bIsSS) return -1;
      if (!aIsSS && bIsSS) return 1;
      if (aIsSS && bIsSS) {
        const aNum = parseInt(a.tag.slice(2), 10);
        const bNum = parseInt(b.tag.slice(2), 10);
        return aNum - bNum;
      }

      const aIsCV = /^cv\d{2}$/i.test(a.tag);
      const bIsCV = /^cv\d{2}$/i.test(b.tag);
      if (aIsCV && !bIsCV) return -1;
      if (!aIsCV && bIsCV) return 1;
      if (aIsCV && bIsCV) {
        const aNum = parseInt(a.tag.slice(2), 10);
        const bNum = parseInt(b.tag.slice(2), 10);
        return aNum - bNum;
      }
    }

    return a.name.localeCompare(b.name);
  });
}
