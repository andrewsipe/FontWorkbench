/**
 * Core table parsers: head, maxp, hhea, vhea, name, OS/2, post, cmap.
 * FontDataExplorer-style refinements (_flagsDecoded, _panoseDecoded, etc.).
 */

import { readOS2TableFields, readPostTableFields } from "../RawTableParser";
import {
  decodeCodePageRanges,
  decodeFsSelection,
  decodeFsType,
  decodePanose,
  decodeSFamilyClass,
  decodeUnicodeRanges,
  formatBinary32,
  getEncodingLabel,
  getLanguageLabel,
  getNameIDKey,
  getNameIDLabel,
  MAC_GLYPH_ORDER,
  PLATFORM_LABELS,
} from "./decoders";
import { fixed16ToDecimal, macTimeToAsctime, u16ToBinary, u32ToHex } from "./formatters";
import { parseMetrics } from "./metrics";
import { parseStub } from "./stub";

export type ParseResult = {
  parsed: unknown;
  status: "complete" | "partial" | "not_implemented" | "error";
};

function result(parsed: unknown, status: ParseResult["status"]): ParseResult {
  return { parsed, status };
}

export function parseHead(buffer: ArrayBuffer, offset: number, length: number): ParseResult {
  try {
    if (length < 54) return result(parseStub("head", length), "not_implemented");
    const view = new DataView(buffer, offset, length);
    const flags = view.getUint16(16, false);
    const macStyle = view.getUint16(44, false);
    return result(
      {
        version: `${view.getUint16(0, false)}.${view.getUint16(2, false)}`,
        fontRevision: fixed16ToDecimal(view.getUint32(4, false)),
        checkSumAdjustment: u32ToHex(view.getUint32(8, false)),
        magicNumber: u32ToHex(view.getUint32(12, false)),
        flags: u16ToBinary(flags),
        _flagsDecoded: {
          indic: !!(flags & 0x0400),
          strongRTL: !!(flags & 0x0200),
          metamorphosis: !!(flags & 0x0100),
          linguisticRendering: !!(flags & 0x0080),
          vertical: !!(flags & 0x0020),
          instructionsAlterAdvanceWidth: !!(flags & 0x0010),
          forcePpemToInteger: !!(flags & 0x0008),
          instructionsDependOnPointSize: !!(flags & 0x0004),
          leftSidebearingAtX0: !!(flags & 0x0002),
          baselineAtY0: !!(flags & 0x0001),
          lossless: !!(flags & 0x0800),
          fontConverted: !!(flags & 0x1000),
          clearType: !!(flags & 0x2000),
          lastResort: !!(flags & 0x4000),
        },
        unitsPerEm: view.getUint16(18, false),
        created: macTimeToAsctime(view, 20),
        modified: macTimeToAsctime(view, 28),
        xMin: view.getInt16(36, false),
        yMin: view.getInt16(38, false),
        xMax: view.getInt16(40, false),
        yMax: view.getInt16(42, false),
        macStyle: u16ToBinary(macStyle),
        _macStyleDecoded: {
          extended: !!(macStyle & 0x0040),
          condensed: !!(macStyle & 0x0020),
          shadow: !!(macStyle & 0x0010),
          outline: !!(macStyle & 0x0008),
          underline: !!(macStyle & 0x0004),
          italic: !!(macStyle & 0x0002),
          bold: !!(macStyle & 0x0001),
        },
        lowestRecPPEM: view.getUint16(46, false),
        fontDirectionHint: view.getInt16(48, false),
        indexToLocFormat: view.getInt16(50, false),
        glyphDataFormat: view.getInt16(52, false),
      },
      "complete"
    );
  } catch (error) {
    console.warn("[parseHead] Parse failed:", error);
    return result(parseStub("head", length), "error");
  }
}

export function parseMaxp(buffer: ArrayBuffer, offset: number, length: number): ParseResult {
  try {
    if (length < 6) return result(parseStub("maxp", length), "not_implemented");
    const view = new DataView(buffer, offset, length);
    const version = view.getUint32(0, false);
    const versionStr =
      version === 0x00005000 ? "0.5" : version === 0x00010000 ? "1.0" : `0x${version.toString(16)}`;
    const out: Record<string, unknown> = {
      version: versionStr,
      numGlyphs: view.getUint16(4, false),
    };
    if (version === 0x0001_0000 && length >= 32) {
      out.maxPoints = view.getUint16(6, false);
      out.maxContours = view.getUint16(8, false);
      out.maxCompositePoints = view.getUint16(10, false);
      out.maxCompositeContours = view.getUint16(12, false);
      out.maxZones = view.getUint16(14, false);
      out.maxTwilightPoints = view.getUint16(16, false);
      out.maxStorage = view.getUint16(18, false);
      out.maxFunctionDefs = view.getUint16(20, false);
      out.maxInstructionDefs = view.getUint16(22, false);
      out.maxStackElements = view.getUint16(24, false);
      out.maxSizeOfInstructions = view.getUint16(26, false);
      out.maxComponentElements = view.getUint16(28, false);
      out.maxComponentDepth = view.getUint16(30, false);
    }
    return result(out, "complete");
  } catch {
    return result(parseStub("maxp", length), "error");
  }
}

export function parseHhea(buffer: ArrayBuffer, offset: number, length: number): ParseResult {
  try {
    if (length < 36) return result(parseStub("hhea", length), "not_implemented");
    const view = new DataView(buffer, offset, length);
    return result(
      {
        version: fixed16ToDecimal(view.getUint32(0, false)),
        ascent: view.getInt16(4, false),
        descent: view.getInt16(6, false),
        lineGap: view.getInt16(8, false),
        advanceWidthMax: view.getUint16(10, false),
        minLeftSideBearing: view.getInt16(12, false),
        minRightSideBearing: view.getInt16(14, false),
        xMaxExtent: view.getInt16(16, false),
        caretSlopeRise: view.getInt16(18, false),
        caretSlopeRun: view.getInt16(20, false),
        caretOffset: view.getInt16(22, false),
        metricDataFormat: view.getInt16(32, false),
        numberOfHMetrics: view.getUint16(34, false),
      },
      "complete"
    );
  } catch (error) {
    console.warn("[parseHhea] Parse failed:", error);
    return result(parseStub("hhea", length), "error");
  }
}

export function parseVhea(buffer: ArrayBuffer, offset: number, length: number): ParseResult {
  try {
    if (length < 36) return result(parseStub("vhea", length), "not_implemented");
    const view = new DataView(buffer, offset, length);
    return result(
      {
        version: fixed16ToDecimal(view.getUint32(0, false)),
        ascent: view.getInt16(4, false),
        descent: view.getInt16(6, false),
        lineGap: view.getInt16(8, false),
        advanceHeightMax: view.getUint16(10, false),
        minTopSideBearing: view.getInt16(12, false),
        minBottomSideBearing: view.getInt16(14, false),
        yMaxExtent: view.getInt16(16, false),
        caretSlopeRise: view.getInt16(18, false),
        caretSlopeRun: view.getInt16(20, false),
        caretOffset: view.getInt16(22, false),
        metricDataFormat: view.getInt16(32, false),
        numOfLongVerMetrics: view.getUint16(34, false),
      },
      "complete"
    );
  } catch {
    return result(parseStub("vhea", length), "error");
  }
}

export function parseOS2(buffer: ArrayBuffer, offset: number, length: number): ParseResult {
  try {
    const view = new DataView(buffer, offset, length);
    const base = readOS2TableFields(buffer, offset, length);
    const obj: Record<string, unknown> = { version: view.getUint16(0, false), ...base };
    if (base.fsType !== undefined) {
      obj.fsType = u16ToBinary(base.fsType);
      obj._fsTypeDecoded = decodeFsType(base.fsType);
    }
    if (base.fsSelection !== undefined) {
      obj.fsSelection = u16ToBinary(base.fsSelection);
      obj._fsSelectionDecoded = decodeFsSelection(base.fsSelection);
    }
    if (base.sFamilyClass !== undefined) {
      obj._sFamilyClassDecoded = decodeSFamilyClass(base.sFamilyClass);
    }
    if (base.ulCodePageRange1 !== undefined || base.ulCodePageRange2 !== undefined) {
      obj._codePageRangesDecoded = decodeCodePageRanges(
        base.ulCodePageRange1 ?? 0,
        base.ulCodePageRange2 ?? 0
      );
    }
    if (length >= 42) {
      const panose: number[] = [];
      for (let i = 0; i < 10; i++) panose.push(view.getUint8(32 + i));
      obj.panose = panose;
      obj._panoseDecoded = decodePanose(panose);
    }
    if (length >= 58) {
      obj.ulUnicodeRange1 = formatBinary32(view.getUint32(42, false));
      obj.ulUnicodeRange2 = formatBinary32(view.getUint32(46, false));
      obj.ulUnicodeRange3 = formatBinary32(view.getUint32(50, false));
      obj.ulUnicodeRange4 = formatBinary32(view.getUint32(54, false));
      obj._unicodeRangesDecoded = decodeUnicodeRanges(
        view.getUint32(42, false),
        view.getUint32(46, false),
        view.getUint32(50, false),
        view.getUint32(54, false)
      );
    }
    return result(obj, "complete");
  } catch (error) {
    console.warn("[parseOS2] Parse failed:", error);
    return result(parseStub("OS/2", length), "error");
  }
}

export function parsePost(buffer: ArrayBuffer, offset: number, length: number): ParseResult {
  try {
    const view = new DataView(buffer, offset, length);
    const base = readPostTableFields(buffer, offset, length);
    const format = view.getUint32(0, false);
    const formatMajor = format >>> 16;
    const out: Record<string, unknown> = {
      format: formatMajor,
      italicAngle: fixed16ToDecimal(view.getInt32(4, false)),
      ...base,
    };
    if (length >= 32) {
      out.isFixedPitch = view.getUint32(12, false);
      out.minMemType42 = view.getUint32(16, false);
      out.maxMemType42 = view.getUint32(20, false);
      out.minMemType1 = view.getUint32(24, false);
      out.maxMemType1 = view.getUint32(28, false);
    }
    if (formatMajor === 2 && length >= 34) {
      const numGlyphs = view.getUint16(32, false);
      const indexBase = 34;
      const indexEnd = indexBase + numGlyphs * 2;
      if (indexEnd <= length) {
        const glyphNameIndex: number[] = [];
        for (let i = 0; i < numGlyphs; i++) {
          glyphNameIndex.push(view.getUint16(indexBase + i * 2, false));
        }
        out.numGlyphs = numGlyphs;
        out.glyphNameIndex = glyphNameIndex;

        const stringTable: string[] = [];
        let pos = indexEnd;
        while (pos < length) {
          const len = view.getUint8(pos);
          if (pos + 1 + len > length) break;
          let str = "";
          for (let j = 0; j < len; j++) str += String.fromCharCode(view.getUint8(pos + 1 + j));
          stringTable.push(str);
          pos += 1 + len;
        }
        out.numCustomStrings = stringTable.length;

        const glyphNames: string[] = [];
        for (let i = 0; i < numGlyphs; i++) {
          const idx = glyphNameIndex[i];
          const name =
            idx <= 257
              ? (MAC_GLYPH_ORDER[idx] ?? ".notdef")
              : (stringTable[idx - 258] ?? ".notdef");
          glyphNames.push(name);
        }
        out.glyphNames = glyphNames;
        out.extraNames = stringTable;
        const first = glyphNames.slice(0, 5);
        const last = numGlyphs > 5 ? glyphNames.slice(-5) : [];
        out.glyphNamesSample = { first, last };
      } else {
        out._note = "Glyph name index extends beyond table";
      }
    } else if (formatMajor === 2) {
      out._note = "Table too short for format 2";
    }
    return result(
      out,
      formatMajor === 2 && out.glyphNameIndex != null
        ? "complete"
        : formatMajor === 2
          ? "partial"
          : "complete"
    );
  } catch (error) {
    console.warn("[parsePost] Parse failed:", error);
    return result(parseStub("post", length), "error");
  }
}

export function parseName(buffer: ArrayBuffer, offset: number, length: number): ParseResult {
  try {
    const view = new DataView(buffer, offset, length);
    if (length < 6) return result({ format: 0, count: 0, records: [] }, "complete");
    const format = view.getUint16(0, false);
    const count = view.getUint16(2, false);
    const stringOffset = view.getUint16(4, false);

    let langTags: string[] | undefined;
    let langTagCount: number | undefined;
    if (format === 1 && length >= 8 + count * 12) {
      langTagCount = view.getUint16(6 + count * 12, false);
      langTags = [];
      for (let i = 0; i < langTagCount; i++) {
        const recOff = 8 + count * 12 + i * 4;
        if (recOff + 4 > length) break;
        const len = view.getUint16(recOff, false);
        const langTagOffset = view.getUint16(recOff + 2, false);
        const stringDataOffset = offset + stringOffset + langTagOffset;
        if (stringDataOffset + len > buffer.byteLength) break;
        try {
          const bytes = new Uint8Array(buffer, stringDataOffset, len);
          langTags.push(new TextDecoder("utf-16be").decode(bytes).replace(/\0/g, "").trim());
        } catch {
          langTags.push("[decode error]");
        }
      }
    }

    const records: Array<{
      nameID: number;
      nameIDLabel: string;
      platformID: number;
      platformLabel: string;
      encodingID: number;
      encodingLabel: string;
      languageID: number;
      languageLabel: string;
      languageTag?: string;
      length: number;
      offset: number;
      value: string;
    }> = [];
    for (let i = 0; i < count; i++) {
      const ro = 6 + i * 12;
      if (ro + 12 > length) break;
      const platformID = view.getUint16(ro, false);
      const encodingID = view.getUint16(ro + 2, false);
      const languageID = view.getUint16(ro + 4, false);
      const nameID = view.getUint16(ro + 6, false);
      const len = view.getUint16(ro + 8, false);
      const strOff = view.getUint16(ro + 10, false);
      const stringDataOffset = offset + stringOffset + strOff;
      if (stringDataOffset + len > buffer.byteLength) continue;
      let value = "";
      try {
        const bytes = new Uint8Array(buffer, stringDataOffset, len);
        if (platformID === 3 || platformID === 0) {
          value = new TextDecoder("utf-16be").decode(bytes).replace(/\0/g, "").trim();
        } else if (platformID === 1) {
          value = new TextDecoder("macintosh").decode(bytes).replace(/\0/g, "").trim();
        } else if (platformID === 2) {
          value = new TextDecoder("iso-8859-1").decode(bytes).replace(/\0/g, "").trim();
        } else {
          value =
            new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\0/g, "").trim() ||
            "[binary]";
        }
      } catch {
        value = "[decode error]";
      }
      const tagIndex = languageID >= 0x8000 ? languageID - 0x8000 : -1;
      const languageTag =
        langTags && tagIndex >= 0 && tagIndex < langTags.length ? langTags[tagIndex] : undefined;
      const languageLabel =
        languageTag != null
          ? `Language-tag: ${languageTag}`
          : getLanguageLabel(platformID, languageID);
      records.push({
        nameID,
        nameIDLabel: getNameIDLabel(nameID),
        platformID,
        platformLabel: PLATFORM_LABELS[platformID] ?? `platform ${platformID}`,
        encodingID,
        encodingLabel: getEncodingLabel(platformID, encodingID),
        languageID,
        languageLabel,
        ...(languageTag != null && { languageTag }),
        length: len,
        offset: strOff,
        value: value || "[empty]",
      });
    }
    // primaryNames: nameIDs 0–25 if they exist (prefer Windows Unicode English)
    const primaryNames: Record<string, string> = {};
    for (let id = 0; id <= 25; id++) {
      const preferred = records.find(
        (r) =>
          r.nameID === id &&
          r.platformID === 3 &&
          r.languageID === 1033 &&
          r.value &&
          r.value !== "[empty]"
      );
      const fallback =
        preferred ?? records.find((r) => r.nameID === id && r.value && r.value !== "[empty]");
      if (fallback?.value) {
        primaryNames[getNameIDKey(id)] = fallback.value;
      }
    }

    const out: Record<string, unknown> = { format, count, primaryNames, records };
    if (langTagCount != null) out.langTagCount = langTagCount;
    if (langTags != null) out.langTags = langTags;
    out._note =
      "primaryNames: camelCase keys for nameIDs 0–25 if present (prefer Windows Unicode English); see records for all platforms";
    return result(out, "complete");
  } catch {
    return result(parseStub("name", length), "error");
  }
}

export function parseCmap(buffer: ArrayBuffer, offset: number, length: number): ParseResult {
  try {
    if (length < 4) return result(parseStub("cmap", length), "not_implemented");
    const view = new DataView(buffer, offset, length);
    const version = view.getUint16(0, false);
    const numTables = view.getUint16(2, false);
    const subtables: Array<{
      platformID: number;
      platformLabel: string;
      encodingID: number;
      encodingLabel: string;
      format: number;
      length: number;
      language?: number;
      summary: Record<string, unknown>;
    }> = [];
    for (let i = 0; i < numTables; i++) {
      const o = 4 + i * 8;
      if (o + 8 > length) break;
      const platformID = view.getUint16(o, false);
      const encodingID = view.getUint16(o + 2, false);
      const subtableOffset = view.getUint32(o + 4, false);
      const so = offset + subtableOffset;
      if (so + 8 > buffer.byteLength) continue;
      const v = new DataView(buffer, so, 8);
      const fmt = v.getUint16(0, false);
      const subLen =
        fmt === 12 || fmt === 8 || fmt === 10 || fmt === 13 || fmt === 14
          ? v.getUint32(4, false)
          : v.getUint16(2, false);
      const subView = new DataView(buffer, so, Math.min(subLen, buffer.byteLength - so));
      let language: number | undefined;
      let summary: Record<string, unknown> = {};

      switch (fmt) {
        case 0:
          if (subView.byteLength >= 8) {
            language = subView.getUint16(4, false);
            summary = {
              type: "byte",
              sample:
                subView.byteLength >= 12
                  ? [
                      subView.getUint8(8),
                      subView.getUint8(9),
                      subView.getUint8(10),
                      subView.getUint8(11),
                    ]
                  : [],
            };
          }
          break;
        case 2:
          if (subView.byteLength >= 6) language = subView.getUint16(4, false);
          summary = { type: "format2", format: 2 };
          break;
        case 4: {
          if (subView.byteLength >= 8) language = subView.getUint16(4, false);
          if (subView.byteLength >= 14) {
            const segCount = subView.getUint16(6, false) >>> 1;
            const codeRanges: Array<{ start: number; end: number }> = [];
            const endCodeBase = 14;
            const startCodeBase = 14 + segCount * 2 + 2;
            for (let k = 0; k < Math.min(4, segCount); k++) {
              if (
                endCodeBase + (k + 1) * 2 <= subView.byteLength &&
                startCodeBase + (k + 1) * 2 <= subView.byteLength
              ) {
                const endC = subView.getUint16(endCodeBase + k * 2, false);
                if (endC !== 0xffff)
                  codeRanges.push({
                    start: subView.getUint16(startCodeBase + k * 2, false),
                    end: endC,
                  });
              }
            }
            summary = { type: "segment", segCount, codeRanges };
          } else summary = { type: "segment", format: 4 };
          break;
        }
        case 6:
          if (subView.byteLength >= 10) {
            language = subView.getUint16(4, false);
            summary = {
              type: "trimmed",
              firstCode: subView.getUint16(6, false),
              entryCount: subView.getUint16(8, false),
            };
          } else summary = { type: "trimmed", format: 6 };
          break;
        case 8:
          if (subView.byteLength >= 12) language = subView.getUint32(8, false);
          summary = { type: "format8", format: 8 };
          break;
        case 10:
          if (subView.byteLength >= 12) language = subView.getUint32(8, false);
          summary = { type: "format10", format: 10 };
          break;
        case 12:
          if (subView.byteLength >= 16) {
            language = subView.getUint32(8, false);
            const numGroups = subView.getUint32(12, false);
            const sample: Array<{
              startCharCode: number;
              endCharCode: number;
              startGlyphID: number;
            }> = [];
            for (let k = 0; k < Math.min(3, numGroups); k++) {
              const g = 16 + k * 12;
              if (g + 12 <= subView.byteLength)
                sample.push({
                  startCharCode: subView.getUint32(g, false),
                  endCharCode: subView.getUint32(g + 4, false),
                  startGlyphID: subView.getUint32(g + 8, false),
                });
            }
            summary = { type: "segment32", numGroups, sample };
          } else summary = { type: "segment32", format: 12 };
          break;
        case 13:
          if (subView.byteLength >= 12) language = subView.getUint32(8, false);
          summary = { type: "format13", format: 13 };
          break;
        case 14:
          if (subView.byteLength >= 12)
            summary = { type: "uvs", numVarSelectorRecords: subView.getUint32(8, false) };
          else summary = { type: "uvs", format: 14 };
          break;
        default:
          summary = { type: "unknown", format: fmt };
      }

      const entry: (typeof subtables)[0] = {
        platformID,
        platformLabel: PLATFORM_LABELS[platformID] ?? `Platform ${platformID}`,
        encodingID,
        encodingLabel: getEncodingLabel(platformID, encodingID),
        format: fmt,
        length: subLen,
        summary,
      };
      if (language !== undefined) entry.language = language;
      subtables.push(entry);
    }
    return result(
      {
        version,
        numTables,
        subtables,
        _note: "Encoding records and subtable summaries; full mappings not enumerated",
      },
      "complete"
    );
  } catch (error) {
    console.warn("[parseCmap] Parse failed:", error);
    return result(parseStub("cmap", length), "error");
  }
}

export function parseCore(
  tag: string,
  buffer: ArrayBuffer,
  offset: number,
  length: number
): ParseResult {
  switch (tag) {
    case "head":
      return parseHead(buffer, offset, length);
    case "maxp":
      return parseMaxp(buffer, offset, length);
    case "hhea":
      return parseHhea(buffer, offset, length);
    case "vhea":
      return parseVhea(buffer, offset, length);
    case "OS/2":
      return parseOS2(buffer, offset, length);
    case "post":
      return parsePost(buffer, offset, length);
    case "name":
      return parseName(buffer, offset, length);
    case "cmap":
      return parseCmap(buffer, offset, length);
    case "hmtx":
    case "vmtx":
      return parseMetrics(tag, buffer, offset, length);
    default:
      return result(parseStub(tag, length), "not_implemented");
  }
}
