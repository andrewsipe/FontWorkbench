/**
 * Bitmap table parsers (stubs): EBDT, ebdt, EBLC, eblc, EBSC, CBDT, cbdt, CBLC, cblc, sbix.
 */

export type ParseBitmapResult = { parsed: unknown; status: string };

const STUBS: Record<string, string> = {
  EBDT: "Embedded bitmap data",
  ebdt: "Embedded bitmap data",
  EBLC: "Embedded bitmap location",
  eblc: "Embedded bitmap location",
  EBSC: "Embedded bitmap scaling",
  CBDT: "Color bitmap data",
  cbdt: "Color bitmap data",
  CBLC: "Color bitmap location",
  cblc: "Color bitmap location",
  sbix: "Apple sbix (standard bitmap graphics)",
};

export function parseBitmap(
  tag: string,
  buffer: ArrayBuffer,
  offset: number,
  length: number
): ParseBitmapResult {
  if ((tag === "EBLC" || tag === "eblc") && length >= 8) {
    const view = new DataView(buffer, offset, length);
    const majorVersion = view.getUint16(0, false);
    const minorVersion = view.getUint16(2, false);
    const numSizes = view.getUint32(4, false);
    return {
      parsed: {
        version: `${majorVersion}.${minorVersion}`,
        numSizes,
        _: "BitmapSize records not parsed",
        size: length,
      },
      status: "partial",
    };
  }
  const _ = STUBS[tag] ?? "Bitmap table";
  return { parsed: { _, tag, size: length }, status: "not_implemented" };
}
