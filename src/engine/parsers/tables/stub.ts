/**
 * Fallback for tables with no dedicated decoder.
 */

export function parseStub(tag: string, length: number): { _: string; tag: string; size: number } {
  return { _: "No decoder for this table", tag, size: length };
}
