/**
 * Other table parsers: gasp, VORG, DSIG, LTSH, VDMX, HDMX, COLR, CPAL, meta, SVG, BASE, MATH.
 */

import { tag4, u16ToBinary } from "./formatters";
import { parseStub } from "./stub";

export type ParseOtherResult = { parsed: unknown; status: string };

function result(
  parsed: unknown,
  status: "complete" | "partial" | "not_implemented" | "error"
): ParseOtherResult {
  return { parsed, status };
}

export function parseOther(
  tag: string,
  buffer: ArrayBuffer,
  offset: number,
  length: number
): ParseOtherResult {
  const view = new DataView(buffer, offset, length);
  try {
    switch (tag) {
      case "gasp": {
        if (length < 4) return result(parseStub(tag, length), "not_implemented");
        const numRanges = view.getUint16(2, false);
        const ranges: { rangeMaxPPEM: number; rangeGaspBehavior: string }[] = [];
        const need = 4 + numRanges * 4;
        if (length >= need) {
          for (let i = 0; i < numRanges; i++) {
            const o = 4 + i * 4;
            ranges.push({
              rangeMaxPPEM: view.getUint16(o, false),
              rangeGaspBehavior: u16ToBinary(view.getUint16(o + 2, false)),
            });
          }
        }
        return result({ version: view.getUint16(0, false), numRanges, ranges }, "complete");
      }

      case "VORG": {
        if (length < 6) return result(parseStub(tag, length), "not_implemented");
        const num = view.getUint16(4, false);
        const vertOriginYMetrics: { glyphIndex: number; vertOriginY: number }[] = [];
        const need = 6 + num * 4;
        if (length >= need) {
          for (let i = 0; i < num; i++) {
            const o = 6 + i * 4;
            vertOriginYMetrics.push({
              glyphIndex: view.getUint16(o, false),
              vertOriginY: view.getInt16(o + 2, false),
            });
          }
        }
        return result(
          {
            version: view.getUint16(0, false),
            defaultVertOriginY: view.getInt16(2, false),
            numVertOriginYMetrics: num,
            vertOriginYMetrics,
          },
          "complete"
        );
      }

      case "DSIG":
        if (length < 8) return result(parseStub(tag, length), "not_implemented");
        return result(
          {
            version: view.getUint32(0, false),
            flags: view.getUint16(4, false),
            numSignatures: view.getUint16(6, false),
          },
          "complete"
        );

      case "LTSH": {
        if (length < 4) return result(parseStub(tag, length), "not_implemented");
        const numGlyphs = view.getUint16(2, false);
        const base = { version: view.getUint16(0, false), numGlyphs };
        if (length < 4 + numGlyphs) return result(base, "complete");
        const first = Math.min(20, numGlyphs);
        const firstYPels: number[] = [];
        for (let i = 0; i < first; i++) firstYPels.push(view.getUint8(4 + i));
        const out: Record<string, unknown> = { ...base, firstYPels };
        if (numGlyphs > 20) {
          out._ = `… and ${numGlyphs - 20} more`;
          const lastStart = 4 + Math.max(0, numGlyphs - 5);
          const lastYPels: number[] = [];
          for (let i = 0; i < 5 && lastStart + i < length; i++)
            lastYPels.push(view.getUint8(lastStart + i));
          if (lastYPels.length) out.lastYPels = lastYPels;
          return result(out, "partial");
        }
        return result(out, first < numGlyphs ? "partial" : "complete");
      }

      case "vdmx":
      case "VDMX": {
        if (length < 4) return result(parseStub(tag, length), "not_implemented");
        const numRecs = view.getUint16(2, false);
        const out: Record<string, unknown> = { version: view.getUint16(0, false), numRecs };
        if (length >= 12) {
          out.firstGroup = {
            yPel: view.getUint16(4, false),
            yMax: view.getUint16(6, false),
            yMin: view.getUint16(8, false),
            nRecs: view.getUint16(10, false),
          };
          if (numRecs > 1) out._note = "Only first group; run records not parsed";
          return result(out, "partial");
        }
        return result(out, "complete");
      }

      case "hdmx":
      case "HDMX": {
        if (length < 6) return result(parseStub(tag, length), "not_implemented");
        const numRecs = view.getUint16(2, false);
        const sizeDeviceRecord = view.getUint16(4, false);
        const out: Record<string, unknown> = {
          version: view.getUint16(0, false),
          numRecs,
          sizeDeviceRecord,
        };
        if (length >= 7) {
          const n = Math.min(10, Math.max(0, sizeDeviceRecord - 1));
          const firstWidths: number[] = [];
          for (let i = 0; i < n && 7 + i < length; i++) firstWidths.push(view.getUint8(7 + i));
          out.firstRecord = { ppem: view.getUint8(6), firstWidths };
          if (numRecs > 1 || sizeDeviceRecord - 1 > 10)
            out._note = "Only first record; sample of widths";
          return result(out, "partial");
        }
        return result(out, "complete");
      }

      case "COLR":
        if (length < 6) return result(parseStub(tag, length), "not_implemented");
        return result(
          {
            version: view.getUint16(0, false),
            numBaseGlyphs: view.getUint16(2, false),
            numLayers: view.getUint16(4, false),
          },
          "complete"
        );

      case "CPAL":
        if (length < 8) return result(parseStub(tag, length), "not_implemented");
        return result(
          {
            version: view.getUint16(0, false),
            numPaletteEntries: view.getUint16(2, false),
            numPalettes: view.getUint16(4, false),
            numColors: view.getUint16(6, false),
          },
          "complete"
        );

      case "meta": {
        if (length < 12) return result(parseStub(tag, length), "not_implemented");
        const version = view.getUint32(0, false);
        const flags = view.getUint32(4, false);
        const dataOffset = view.getUint32(8, false);
        const doff = offset + dataOffset;
        if (doff + 4 > buffer.byteLength) return result({ version, flags, dataOffset }, "partial");
        const n = new DataView(buffer, doff, 4).getUint32(0, false);
        const maps: { tag: string; length: number }[] = [];
        for (let i = 0; i < n && doff + 4 + (i + 1) * 12 <= buffer.byteLength; i++) {
          const b = new Uint8Array(buffer, doff + 4 + i * 12, 4);
          const dlen = new DataView(buffer, doff + 4 + i * 12 + 8, 4).getUint32(0, false);
          maps.push({ tag: tag4(b[0], b[1], b[2], b[3]), length: dlen });
        }
        return result({ version, flags, dataMapCount: n, dataMaps: maps }, "partial");
      }

      case "SVG ":
        if (length < 6) return result(parseStub(tag, length), "not_implemented");
        return result(
          { version: view.getUint16(0, false), numDocList: view.getUint16(2, false), size: length },
          "partial"
        );

      case "BASE": {
        if (length < 4) return result(parseStub(tag, length), "not_implemented");
        const out: Record<string, unknown> = { version: view.getUint16(0, false), size: length };
        if (length >= 6) {
          out.horizAxisOffset = view.getUint16(2, false);
          out.vertAxisOffset = view.getUint16(4, false);
          out._note = "Axis Tables and Min/Max not parsed";
        }
        return result(out, "partial");
      }

      case "MATH":
        if (length >= 4)
          return result(
            { version: view.getUint32(0, false), _: "MATH table", size: length },
            "partial"
          );
        return result({ _: "MATH table", size: length }, "partial");

      case "MERG":
        return result(parseStub(tag, length), "not_implemented");

      case "ltag": {
        if (length < 4) return result(parseStub(tag, length), "not_implemented");
        const out: Record<string, unknown> = { version: view.getUint32(0, false) };
        if (length >= 8) out.flag = view.getUint32(4, false);
        if (length >= 12) out.numTags = view.getUint32(8, false);
        if (length >= 16) out.tagLength = view.getUint32(12, false);
        out._note = "Tags not decoded";
        return result(out, "partial");
      }

      case "ankr": {
        if (length < 4) return result(parseStub(tag, length), "not_implemented");
        return result(
          {
            version: view.getUint32(0, false),
            size: length,
            _note: "Anchors used by GPOS; structure not enumerated",
          },
          "partial"
        );
      }

      case "PfEd": {
        if (length < 8) return result(parseStub(tag, length), "not_implemented");
        return result(
          {
            version: view.getUint32(0, false),
            count: view.getUint32(4, false),
            _note: "FontForge extensions; subtables (colr, cmnt, fcmt, etc.) not parsed.",
            size: length,
          },
          "partial"
        );
      }

      case "FFTM": {
        if (length < 4) return result(parseStub(tag, length), "not_implemented");
        return result(
          {
            version: view.getUint32(0, false),
            _note: "FontForge timestamps (font/source creation and modification).",
            size: length,
          },
          "partial"
        );
      }

      case "TeX ": {
        if (length < 8) return result(parseStub(tag, length), "not_implemented");
        return result(
          {
            version: view.getUint32(0, false),
            count: view.getUint32(4, false),
            _note: "TeX metrics; subtables (ftpm, htdp, sbsp) not parsed.",
            size: length,
          },
          "partial"
        );
      }

      case "BDF ": {
        if (length < 8) return result(parseStub(tag, length), "not_implemented");
        return result(
          {
            version: view.getUint16(0, false),
            strikeCount: view.getUint16(2, false),
            stringTableOffset: view.getUint32(4, false),
            _note: "BDF properties; property records not parsed.",
            size: length,
          },
          "partial"
        );
      }

      default:
        return result(parseStub(tag, length), "not_implemented");
    }
  } catch {
    return result(parseStub(tag, length), "error");
  }
}
