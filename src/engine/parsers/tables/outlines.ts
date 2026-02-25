/**
 * Outline table parsers: loca, glyf, CFF , cvt , prep, fpgm.
 */

import { findTableOffset } from "../RawTableParser";
import { parseStub } from "./stub";

export type ParseOutlinesResult = { parsed: unknown; status: string };

function result(
  parsed: unknown,
  status: "complete" | "partial" | "not_implemented" | "error"
): ParseOutlinesResult {
  return { parsed, status };
}

export function parseOutlines(
  tag: string,
  buffer: ArrayBuffer,
  offset: number,
  length: number
): ParseOutlinesResult {
  const view = new DataView(buffer, offset, length);
  try {
    switch (tag) {
      case "loca": {
        const head = findTableOffset(buffer, "head");
        const maxp = findTableOffset(buffer, "maxp");
        if (!head || !maxp || head.length < 52 || maxp.length < 6) {
          return result(
            { _: "loca (needs head + maxp)", size: length, numEntries: Math.floor(length / 2) },
            "partial"
          );
        }
        const h = new DataView(buffer, head.offset, head.length);
        const m = new DataView(buffer, maxp.offset, maxp.length);
        const indexToLocFormat = h.getInt16(50, false);
        const numGlyphs = m.getUint16(4, false);
        const numEntries = numGlyphs + 1;
        const fmt = indexToLocFormat === 0 ? "short" : "long";
        if (numEntries === 0) {
          return result({ format: fmt, numEntries: 0, offsets: [] }, "complete");
        }
        const offsets: number[] = [];
        let _note: string | undefined;
        let status: "complete" | "partial" = "complete";
        if (indexToLocFormat === 0) {
          for (let i = 0; i < numEntries; i++) {
            if ((i + 1) * 2 <= length) {
              offsets.push(view.getUint16(i * 2, false) * 2);
            } else {
              if (!_note) {
                _note = "Table truncated";
                status = "partial";
              }
              break;
            }
          }
        } else {
          for (let i = 0; i < numEntries; i++) {
            if ((i + 1) * 4 <= length) {
              offsets.push(view.getUint32(i * 4, false));
            } else {
              if (!_note) {
                _note = "Table truncated";
                status = "partial";
              }
              break;
            }
          }
        }
        const out: Record<string, unknown> = { format: fmt, numEntries, offsets };
        if (_note) out._note = _note;
        return result(out, status);
      }

      case "glyf": {
        const head = findTableOffset(buffer, "head");
        const maxp = findTableOffset(buffer, "maxp");
        const loca = findTableOffset(buffer, "loca");
        const glyf = findTableOffset(buffer, "glyf");
        if (!head || !maxp || !loca || !glyf) {
          return result({ _: "glyf (needs head, maxp, loca)", size: length }, "partial");
        }
        const hv = new DataView(buffer, head.offset, head.length);
        const mv = new DataView(buffer, maxp.offset, maxp.length);
        const lv = new DataView(buffer, loca.offset, loca.length);
        const idxFmt = hv.getInt16(50, false);
        const numGlyphs = mv.getUint16(4, false);
        if (numGlyphs === 0) {
          return result({ numGlyphs: 0, glyphs: [] }, "complete");
        }
        const glyphs: Array<{
          index: number;
          numberOfContours: number;
          xMin: number;
          yMin: number;
          xMax: number;
          yMax: number;
        }> = [];
        let _note: string | undefined;
        let status: "complete" | "partial" = "complete";
        for (let i = 0; i < numGlyphs; i++) {
          let start: number, end: number;
          if (idxFmt === 0) {
            if ((i + 1) * 2 + 2 > loca.length) {
              glyphs.push({ index: i, numberOfContours: 0, xMin: 0, yMin: 0, xMax: 0, yMax: 0 });
              if (!_note) {
                _note = "loca truncated";
                status = "partial";
              }
              continue;
            }
            start = lv.getUint16(i * 2, false) * 2;
            end = lv.getUint16((i + 1) * 2, false) * 2;
          } else {
            if ((i + 1) * 4 + 4 > loca.length) {
              glyphs.push({ index: i, numberOfContours: 0, xMin: 0, yMin: 0, xMax: 0, yMax: 0 });
              if (!_note) {
                _note = "loca truncated";
                status = "partial";
              }
              continue;
            }
            start = lv.getUint32(i * 4, false);
            end = lv.getUint32((i + 1) * 4, false);
          }
          if (start === end) {
            glyphs.push({ index: i, numberOfContours: 0, xMin: 0, yMin: 0, xMax: 0, yMax: 0 });
          } else {
            const go = glyf.offset + start;
            if (go + 10 <= buffer.byteLength) {
              const gv = new DataView(buffer, go, 10);
              glyphs.push({
                index: i,
                numberOfContours: gv.getInt16(0, false),
                xMin: gv.getInt16(2, false),
                yMin: gv.getInt16(4, false),
                xMax: gv.getInt16(6, false),
                yMax: gv.getInt16(8, false),
              });
            } else {
              glyphs.push({ index: i, numberOfContours: 0, xMin: 0, yMin: 0, xMax: 0, yMax: 0 });
              if (!_note) {
                _note = "glyf truncated";
                status = "partial";
              }
            }
          }
        }
        const out: Record<string, unknown> = { numGlyphs, glyphs };
        if (_note) out._note = _note;
        return result(out, status);
      }

      case "CFF ": {
        if (length < 4) return result(parseStub(tag, length), "not_implemented");
        const major = view.getUint8(0);
        const minor = view.getUint8(1);
        const hdrSize = view.getUint8(2);
        const offSize = view.getUint8(3);
        return result(
          {
            version: `${major}.${minor}`,
            headerSize: hdrSize,
            offSize,
            size: length,
            _: "PostScript CFF font program",
          },
          "partial"
        );
      }

      case "cvt ": {
        const n = Math.floor(length / 2);
        const values: number[] = [];
        for (let i = 0; i < n && i * 2 + 2 <= length; i++) values.push(view.getInt16(i * 2, false));
        return result({ numValues: n, values }, "complete");
      }

      case "prep":
        return result(
          {
            size: length,
            _note: "TrueType control value program (prep). Bytecode; not disassembled.",
          },
          "partial"
        );
      case "fpgm":
        return result(
          { size: length, _note: "TrueType font program (fpgm). Bytecode; not disassembled." },
          "partial"
        );

      default:
        return result(parseStub(tag, length), "not_implemented");
    }
  } catch {
    return result(parseStub(tag, length), "error");
  }
}
