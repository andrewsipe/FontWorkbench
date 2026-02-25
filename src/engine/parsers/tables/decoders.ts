/**
 * Spec-based bit and label decoders for OpenType tables.
 * FontDataExplorer-style decoded helpers (_fsTypeDecoded, _panoseDecoded, etc.).
 */

import { findTableOffset } from "../RawTableParser";

export function formatBinary32(n: number): string {
  const s = ((n >>> 0) & 0xffff_ffff).toString(2).padStart(32, "0");
  return `${s.slice(0, 8)} ${s.slice(8, 16)} ${s.slice(16, 24)} ${s.slice(24)}`;
}

/**
 * Decoded fsType field – embedding permissions (OS/2).
 * @property unrestricted - No restrictions (fsType = 0); installable embedding.
 * @property bitmapEmbeddingOnly - Bitmap embedding only.
 * @property noEmbedding - No embedding permitted.
 * @property editableEmbedding - Editable embedding allowed.
 * @property previewAndPrintEmbedding - Preview & print embedding allowed.
 * @property restrictedLicense - Restricted license embedding.
 */
export function decodeFsType(fsType: number): {
  unrestricted: boolean;
  bitmapEmbeddingOnly: boolean;
  noEmbedding: boolean;
  editableEmbedding: boolean;
  previewAndPrintEmbedding: boolean;
  restrictedLicense: boolean;
} {
  return {
    unrestricted: fsType === 0,
    bitmapEmbeddingOnly: !!(fsType & 0x0200),
    noEmbedding: !!(fsType & 0x0100),
    editableEmbedding: !!(fsType & 0x0008),
    previewAndPrintEmbedding: !!(fsType & 0x0004),
    restrictedLicense: !!(fsType & 0x0002),
  };
}

export function decodeFsSelection(fsSelection: number): {
  oblique: boolean;
  wws: boolean;
  useTypoMetrics: boolean;
  regular: boolean;
  bold: boolean;
  strikeout: boolean;
  outlined: boolean;
  negative: boolean;
  underscore: boolean;
  italic: boolean;
} {
  return {
    oblique: !!(fsSelection & 0x0200),
    wws: !!(fsSelection & 0x0100),
    useTypoMetrics: !!(fsSelection & 0x0080),
    regular: !!(fsSelection & 0x0040),
    bold: !!(fsSelection & 0x0020),
    strikeout: !!(fsSelection & 0x0010),
    outlined: !!(fsSelection & 0x0008),
    negative: !!(fsSelection & 0x0004),
    underscore: !!(fsSelection & 0x0002),
    italic: !!(fsSelection & 0x0001),
  };
}

/**
 * Decoded sFamilyClass (OS/2): high byte = class, low byte = subclass.
 */
export function decodeSFamilyClass(sFamilyClass: number): { class: number; subclass: number } {
  return {
    class: (sFamilyClass >> 8) & 0xff,
    subclass: sFamilyClass & 0xff,
  };
}

/** OS/2 ulCodePageRange1/2 bit-to-name map (bits 0–63). */
const CODE_PAGE_RANGE_NAMES: Record<number, string> = {
  0: "Latin 1 (1252)",
  1: "Latin 2 Eastern Europe (1250)",
  2: "Cyrillic (1251)",
  3: "Greek (1253)",
  4: "Turkish (1254)",
  5: "Hebrew (1255)",
  6: "Arabic (1256)",
  7: "Windows Baltic (1257)",
  8: "Vietnamese (1258)",
  16: "Thai (874)",
  17: "JIS/Japan (932)",
  18: "Chinese Simplified (936)",
  19: "Korean Wansung (949)",
  20: "Chinese Traditional (950)",
  21: "Korean Johab (1361)",
  29: "Macintosh",
  30: "OEM",
  31: "Symbol",
  48: "IBM Greek (869)",
  49: "MS-DOS Russian (866)",
  50: "MS-DOS Nordic (865)",
  51: "Arabic (864)",
  52: "MS-DOS Canadian French (863)",
  53: "Hebrew (862)",
  54: "MS-DOS Icelandic (861)",
  55: "MS-DOS Portuguese (860)",
  56: "IBM Turkish (857)",
  57: "IBM Cyrillic (855)",
  58: "Latin 2 (852)",
  59: "MS-DOS Baltic (775)",
  60: "Greek (737)",
  61: "Arabic ASMO 708",
  62: "WE/Latin 1 (850)",
  63: "US (437)",
};

export function decodeCodePageRanges(r1: number, r2: number): string[] {
  const out: string[] = [];
  for (let bit = 0; bit < 32; bit++) {
    if (r1 & (1 << bit)) out.push(CODE_PAGE_RANGE_NAMES[bit] ?? `Bit ${bit}`);
    if (r2 & (1 << bit)) out.push(CODE_PAGE_RANGE_NAMES[32 + bit] ?? `Bit ${32 + bit}`);
  }
  return out;
}

/** Standard Macintosh TrueType glyph order (258 names). Index 0–257 for post format 2 glyphNameIndex. */
export const MAC_GLYPH_ORDER: readonly string[] = [
  ".notdef",
  ".null",
  "nonmarkingreturn",
  "space",
  "exclam",
  "quotedbl",
  "numbersign",
  "dollar",
  "percent",
  "ampersand",
  "quotesingle",
  "parenleft",
  "parenright",
  "asterisk",
  "plus",
  "comma",
  "hyphen",
  "period",
  "slash",
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "colon",
  "semicolon",
  "less",
  "equal",
  "greater",
  "question",
  "at",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "bracketleft",
  "backslash",
  "bracketright",
  "asciicircum",
  "underscore",
  "grave",
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  "braceleft",
  "bar",
  "braceright",
  "asciitilde",
  "Adieresis",
  "Aring",
  "Ccedilla",
  "Eacute",
  "Ntilde",
  "Odieresis",
  "Udieresis",
  "aacute",
  "agrave",
  "acircumflex",
  "adieresis",
  "atilde",
  "aring",
  "ccedilla",
  "eacute",
  "egrave",
  "ecircumflex",
  "edieresis",
  "iacute",
  "igrave",
  "icircumflex",
  "idieresis",
  "ntilde",
  "oacute",
  "ograve",
  "ocircumflex",
  "odieresis",
  "otilde",
  "uacute",
  "ugrave",
  "ucircumflex",
  "udieresis",
  "dagger",
  "degree",
  "cent",
  "sterling",
  "section",
  "bullet",
  "paragraph",
  "germandbls",
  "registered",
  "copyright",
  "trademark",
  "acute",
  "dieresis",
  "notequal",
  "AE",
  "Oslash",
  "infinity",
  "plusminus",
  "lessequal",
  "greaterequal",
  "yen",
  "mu",
  "partialdiff",
  "summation",
  "product",
  "pi",
  "integral",
  "ordfeminine",
  "ordmasculine",
  "Omega",
  "ae",
  "oslash",
  "questiondown",
  "exclamdown",
  "logicalnot",
  "radical",
  "florin",
  "approxequal",
  "Delta",
  "guillemotleft",
  "guillemotright",
  "ellipsis",
  "nonbreakingspace",
  "Agrave",
  "Atilde",
  "Otilde",
  "OE",
  "oe",
  "endash",
  "emdash",
  "quotedblleft",
  "quotedblright",
  "quoteleft",
  "quoteright",
  "divide",
  "lozenge",
  "ydieresis",
  "Ydieresis",
  "fraction",
  "currency",
  "guilsinglleft",
  "guilsinglright",
  "fi",
  "fl",
  "daggerdbl",
  "periodcentered",
  "quotesinglbase",
  "quotedblbase",
  "perthousand",
  "Acircumflex",
  "Ecircumflex",
  "Aacute",
  "Edieresis",
  "Egrave",
  "Iacute",
  "Icircumflex",
  "Idieresis",
  "Igrave",
  "Oacute",
  "Ocircumflex",
  "apple",
  "Ograve",
  "Uacute",
  "Ucircumflex",
  "Ugrave",
  "dotlessi",
  "circumflex",
  "tilde",
  "macron",
  "breve",
  "dotaccent",
  "ring",
  "cedilla",
  "hungarumlaut",
  "ogonek",
  "caron",
  "Lslash",
  "lslash",
  "Scaron",
  "scaron",
  "Zcaron",
  "zcaron",
  "brokenbar",
  "Eth",
  "eth",
  "Yacute",
  "yacute",
  "Thorn",
  "thorn",
  "minus",
  "multiply",
  "onesuperior",
  "twosuperior",
  "threesuperior",
  "onehalf",
  "onequarter",
  "threequarters",
  "franc",
  "Gbreve",
  "gbreve",
  "Idotaccent",
  "Scedilla",
  "scedilla",
  "Cacute",
  "cacute",
  "Ccaron",
  "ccaron",
  "dcroat",
];

const PANOSE_FAMILY_TYPES = [
  "Any",
  "No Fit",
  "Text and Display",
  "Script",
  "Decorative",
  "Pictorial",
];
const PANOSE_WEIGHTS = [
  "Any",
  "No Fit",
  "Very Light",
  "Light",
  "Thin",
  "Book",
  "Medium",
  "Demi",
  "Bold",
  "Heavy",
  "Black",
  "Nord",
];

export function decodePanose(panose: number[]): {
  familyType: string;
  serifStyle: number;
  weight: string;
  proportion: number;
  contrast: number;
  strokeVariation: number;
  armStyle: number;
  letterform: number;
  midline: number;
  xHeight: number;
} {
  const familyType = PANOSE_FAMILY_TYPES[panose[0]] ?? `Unknown (${panose[0]})`;
  const weight = PANOSE_WEIGHTS[panose[2]] ?? `Unknown (${panose[2]})`;
  return {
    familyType,
    serifStyle: panose[1],
    weight,
    proportion: panose[3],
    contrast: panose[4],
    strokeVariation: panose[5],
    armStyle: panose[6],
    letterform: panose[7],
    midline: panose[8],
    xHeight: panose[9],
  };
}

const UNICODE_RANGE_NAMES: Record<number, string> = {
  0: "Basic Latin",
  1: "Latin-1 Supplement",
  2: "Latin Extended-A",
  3: "Latin Extended-B",
  4: "IPA Extensions",
  5: "Spacing Modifier Letters",
  6: "Combining Diacritical Marks",
  7: "Greek and Coptic",
  9: "Cyrillic",
  11: "Armenian",
  12: "Hebrew",
  13: "Arabic",
  17: "Devanagari",
  48: "CJK Symbols and Punctuation",
  49: "Hiragana",
  50: "Katakana",
  51: "Bopomofo",
  59: "CJK Unified Ideographs",
};

export function decodeUnicodeRanges(r1: number, r2: number, r3: number, r4: number): string[] {
  const out: string[] = [];
  for (let bit = 0; bit < 32; bit++) {
    if (r1 & (1 << bit)) out.push(UNICODE_RANGE_NAMES[bit] ?? `Bit ${bit}`);
    if (r2 & (1 << bit)) out.push(UNICODE_RANGE_NAMES[32 + bit] ?? `Bit ${32 + bit}`);
    if (r3 & (1 << bit)) out.push(UNICODE_RANGE_NAMES[64 + bit] ?? `Bit ${64 + bit}`);
    if (r4 & (1 << bit)) out.push(UNICODE_RANGE_NAMES[96 + bit] ?? `Bit ${96 + bit}`);
  }
  return out;
}

export function getEncodingLabel(platformID: number, encodingID: number): string {
  if (platformID === 0) {
    const m: Record<number, string> = {
      0: "Unicode 1.0",
      1: "Unicode 1.1",
      2: "ISO/IEC 10646",
      3: "Unicode 2.0 BMP",
      4: "Unicode 2.0 full",
      5: "Unicode Variation",
      6: "Unicode full",
    };
    return m[encodingID] ?? `Encoding ${encodingID}`;
  }
  if (platformID === 1) {
    const m: Record<number, string> = {
      0: "Roman",
      1: "Japanese",
      2: "Chinese Traditional",
      3: "Korean",
      4: "Arabic",
      5: "Hebrew",
      6: "Greek",
    };
    return m[encodingID] ?? `Encoding ${encodingID}`;
  }
  if (platformID === 3) {
    const m: Record<number, string> = {
      0: "Symbol",
      1: "Unicode BMP",
      2: "ShiftJIS",
      3: "PRC",
      4: "Big5",
      5: "Wansung",
      6: "Johab",
      10: "Unicode full",
    };
    return m[encodingID] ?? `Encoding ${encodingID}`;
  }
  return `Encoding ${encodingID}`;
}

export function getLanguageLabel(platformID: number, languageID: number): string {
  if (platformID === 3) {
    const m: Record<number, string> = {
      1033: "English (US)",
      1031: "German (Germany)",
      1036: "French (France)",
      1040: "Italian (Italy)",
      1034: "Spanish (Spain)",
      1041: "Japanese (Japan)",
      1042: "Korean (Korea)",
      2052: "Chinese (PRC)",
      1028: "Chinese (Taiwan)",
      1049: "Russian (Russia)",
      1043: "Dutch (Netherlands)",
      1046: "Portuguese (Brazil)",
      2070: "Portuguese (Portugal)",
    };
    return m[languageID] ?? `Language ${languageID}`;
  }
  if (platformID === 1) {
    const m: Record<number, string> = { 0: "English" };
    return m[languageID] ?? `Language ${languageID}`;
  }
  return `Language ${languageID}`;
}

/**
 * Name ID labels per OpenType name table spec.
 * @see https://learn.microsoft.com/en-us/typography/opentype/spec/name#name-ids
 */
export const NAME_ID_LABELS: Record<number, string> = {
  0: "Copyright notice",
  1: "Font Family name",
  2: "Font Subfamily name",
  3: "Unique font identifier",
  4: "Full font name",
  5: "Version string",
  6: "PostScript name",
  7: "Trademark",
  8: "Manufacturer Name",
  9: "Designer",
  10: "Description",
  11: "URL of Vendor",
  12: "URL of Designer",
  13: "License Description",
  14: "License Info URL",
  15: "Reserved",
  16: "Typographic Family name",
  17: "Typographic Subfamily name",
  18: "Compatible Full (Macintosh only)",
  19: "Sample text",
  20: "PostScript CID findfont name",
  21: "WWS Family Name",
  22: "WWS Subfamily Name",
  23: "Light Background Palette",
  24: "Dark Background Palette",
  25: "Variations PostScript Name Prefix",
};

export function getNameIDLabel(nameID: number): string {
  return NAME_ID_LABELS[nameID] ?? `Name ID ${nameID}`;
}

/**
 * CamelCase keys for primaryNames (nameIDs 0–25). No spaces; JSON-friendly.
 * @see https://learn.microsoft.com/en-us/typography/opentype/spec/name#name-ids
 */
export const NAME_ID_KEYS: Record<number, string> = {
  0: "copyrightNotice",
  1: "fontFamilyName",
  2: "fontSubfamilyName",
  3: "uniqueFontIdentifier",
  4: "fullFontName",
  5: "versionString",
  6: "postScriptName",
  7: "trademark",
  8: "manufacturerName",
  9: "designer",
  10: "description",
  11: "urlOfVendor",
  12: "urlOfDesigner",
  13: "licenseDescription",
  14: "licenseInfoUrl",
  15: "reserved",
  16: "typographicFamilyName",
  17: "typographicSubfamilyName",
  18: "compatibleFullMacintoshOnly",
  19: "sampleText",
  20: "postScriptCidFindfontName",
  21: "wwsFamilyName",
  22: "wwsSubfamilyName",
  23: "lightBackgroundPalette",
  24: "darkBackgroundPalette",
  25: "variationsPostScriptNamePrefix",
};

export function getNameIDKey(nameID: number): string {
  return NAME_ID_KEYS[nameID] ?? `nameID_${nameID}`;
}

export const PLATFORM_LABELS: Record<number, string> = {
  0: "Unicode",
  1: "Mac",
  2: "ISO",
  3: "Windows",
};

export const GSUB_LOOKUP_TYPES: Record<number, string> = {
  1: "Single Substitution",
  2: "Multiple Substitution",
  3: "Alternate Substitution",
  4: "Ligature Substitution",
  5: "Contextual Substitution",
  6: "Chaining Contextual Substitution",
  7: "Extension Substitution",
  8: "Reverse Chaining Contextual Single Substitution",
};

export const GPOS_LOOKUP_TYPES: Record<number, string> = {
  1: "Single Adjustment",
  2: "Pair Adjustment",
  3: "Cursive Attachment",
  4: "MarkToBase Attachment",
  5: "MarkToLigature Attachment",
  6: "MarkToMark Attachment",
  7: "Contextual Positioning",
  8: "Chaining Contextual Positioning",
  9: "Extension Positioning",
};

/**
 * Resolve nameID to actual string from name table.
 * Prefers Windows Unicode (platform 3, encoding 1, language 0x0409); else first available.
 */
export function resolveNameID(buffer: ArrayBuffer, nameID: number): string | null {
  try {
    const nameTable = findTableOffset(buffer, "name");
    if (!nameTable) return null;
    const view = new DataView(buffer, nameTable.offset, nameTable.length);
    const count = view.getUint16(2, false);
    const stringOffset = view.getUint16(4, false);
    let fallbackValue: string | null = null;
    for (let i = 0; i < count; i++) {
      const recordOffset = 6 + i * 12;
      if (recordOffset + 12 > nameTable.length) break;
      const platformID = view.getUint16(recordOffset, false);
      const encodingID = view.getUint16(recordOffset + 2, false);
      const languageID = view.getUint16(recordOffset + 4, false);
      const currentNameID = view.getUint16(recordOffset + 6, false);
      const len = view.getUint16(recordOffset + 8, false);
      const strOff = view.getUint16(recordOffset + 10, false);
      if (currentNameID !== nameID) continue;
      const stringDataOffset = nameTable.offset + stringOffset + strOff;
      if (stringDataOffset + len > buffer.byteLength) continue;
      try {
        const bytes = new Uint8Array(buffer, stringDataOffset, len);
        let decoded = "";
        if (platformID === 3 || platformID === 0) {
          decoded = new TextDecoder("utf-16be").decode(bytes).replace(/\0/g, "").trim();
        } else if (platformID === 1) {
          decoded = new TextDecoder("macintosh").decode(bytes).replace(/\0/g, "").trim();
        } else {
          decoded = new TextDecoder("utf-8", { fatal: false })
            .decode(bytes)
            .replace(/\0/g, "")
            .trim();
        }
        if (platformID === 3 && encodingID === 1 && languageID === 0x0409 && decoded)
          return decoded;
        if (decoded && !fallbackValue) fallbackValue = decoded;
      } catch {}
    }
    return fallbackValue;
  } catch (error) {
    console.warn(`[resolveNameID] Failed to resolve nameID ${nameID}:`, error);
    return null;
  }
}

/**
 * Resolve multiple nameIDs in one pass over the name table.
 */
export function resolveNameIDs(buffer: ArrayBuffer, nameIDs: number[]): Map<number, string> {
  const result = new Map<number, string>();
  const nameIDSet = new Set(nameIDs);
  try {
    const nameTable = findTableOffset(buffer, "name");
    if (!nameTable) return result;
    const view = new DataView(buffer, nameTable.offset, nameTable.length);
    const count = view.getUint16(2, false);
    const stringOffset = view.getUint16(4, false);
    const preferred = new Map<number, string>();
    const fallback = new Map<number, string>();
    for (let i = 0; i < count; i++) {
      const recordOffset = 6 + i * 12;
      if (recordOffset + 12 > nameTable.length) break;
      const platformID = view.getUint16(recordOffset, false);
      const encodingID = view.getUint16(recordOffset + 2, false);
      const languageID = view.getUint16(recordOffset + 4, false);
      const currentNameID = view.getUint16(recordOffset + 6, false);
      const len = view.getUint16(recordOffset + 8, false);
      const strOff = view.getUint16(recordOffset + 10, false);
      if (!nameIDSet.has(currentNameID)) continue;
      const stringDataOffset = nameTable.offset + stringOffset + strOff;
      if (stringDataOffset + len > buffer.byteLength) continue;
      try {
        const bytes = new Uint8Array(buffer, stringDataOffset, len);
        let decoded = "";
        if (platformID === 3 || platformID === 0) {
          decoded = new TextDecoder("utf-16be").decode(bytes).replace(/\0/g, "").trim();
        } else if (platformID === 1) {
          decoded = new TextDecoder("macintosh").decode(bytes).replace(/\0/g, "").trim();
        } else {
          decoded = new TextDecoder("utf-8", { fatal: false })
            .decode(bytes)
            .replace(/\0/g, "")
            .trim();
        }
        if (!decoded) continue;
        if (platformID === 3 && encodingID === 1 && languageID === 0x0409) {
          preferred.set(currentNameID, decoded);
        } else if (!fallback.has(currentNameID)) {
          fallback.set(currentNameID, decoded);
        }
      } catch {}
    }
    for (const id of nameIDs) {
      const value = preferred.get(id) ?? fallback.get(id);
      if (value != null) result.set(id, value);
    }
  } catch (error) {
    console.warn("[resolveNameIDs] Failed to resolve nameIDs:", error);
  }
  return result;
}
