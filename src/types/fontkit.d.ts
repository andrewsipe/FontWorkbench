/**
 * Type declarations for fontkit
 */

declare module "fontkit" {
  export interface VariationAxis {
    tag: string;
    name?: { en?: string } | string;
    min?: number;
    minValue?: number;
    max?: number;
    maxValue?: number;
    default?: number;
    defaultValue?: number;
  }

  export interface Font {
    familyName?: string;
    subfamilyName?: string;
    postscriptName?: string;
    fullName?: string;
    version?: number;
    uniqueSubfamily?: string;
    typographicFamilyName?: string;
    typographicSubfamilyName?: string;
    manufacturer?: string;
    copyright?: string;

    // Metrics
    unitsPerEm?: number;
    capHeight?: number;
    xHeight?: number;
    ascent?: number;
    descent?: number;
    lineGap?: number;
    hheaAscender?: number;
    hheaDescender?: number;
    hheaLineGap?: number;
    numGlyphs?: number;

    // Variable font support
    variationAxes?: Record<string, VariationAxis>;
    namedVariations?: Record<string, Record<string, number>>;

    // OpenType tables
    os2?: {
      usWeightClass?: number;
      usWidthClass?: number;
      fsSelection?: number;
      fsType?: number;
      usWinAscent?: number;
      usWinDescent?: number;
    };
    post?: {
      italicAngle?: number;
      underlinePosition?: number;
      underlineThickness?: number;
    };

    // Name table for lookups
    name?: {
      records?: Record<string, unknown>;
      names?: Array<{
        nameID: number;
        platformID: number;
        encodingID: number;
        languageID?: number;
        string?: string;
        text?: string;
        toUnicode?: () => string;
      }>;
    };

    // Feature tables (for UINameID extraction)
    GSUB?: {
      featureList?: Record<string, unknown> | unknown[];
    };
    GPOS?: {
      featureList?: Record<string, unknown> | unknown[];
    };

    // fvar table access
    fvar?: {
      instance?: Array<{
        nameID: number;
        name?: unknown;
        coord?: Record<string, number>;
      }>;
    };

    // Legacy layout features (may still exist)
    layoutFeatures?: Array<{
      tag: string;
      name?: string;
    }>;
  }

  export function create(buffer: ArrayBuffer): Font;

  const fontkit: {
    create: (buffer: ArrayBuffer) => Font;
  };

  export default fontkit;
}
