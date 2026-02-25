/**
 * Shared formatters for table parsing (TTX-like output).
 * Used by tables/core and other table modules.
 */

export function fixed16ToDecimal(raw: number): string {
  const val = raw / 65536;
  return Number.isInteger(val) ? val.toFixed(1) : val.toFixed(3).replace(/0+$/, "");
}

export function u16ToBinary(n: number): string {
  const s = ((n >>> 0) & 0xffff).toString(2).padStart(16, "0");
  return `${s.slice(0, 8)} ${s.slice(8)}`;
}

export function u32ToHex(n: number): string {
  return `0x${(n >>> 0).toString(16).toLowerCase()}`;
}

export function macTimeToAsctime(view: DataView, offset: number): string {
  try {
    const hi = view.getUint32(offset, false);
    const lo = view.getUint32(offset + 4, false);
    const secs = hi * 0x1_0000_0000 + lo;
    const d = new Date(Date.UTC(1904, 0, 1) + secs * 1000);
    const w = d.toLocaleString("en-US", { weekday: "short" });
    const M = d.toLocaleString("en-US", { month: "short" });
    const day = d.getUTCDate();
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    const s = d.getUTCSeconds();
    const Y = d.getUTCFullYear();
    return `${w} ${M} ${day} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} ${Y}`;
  } catch {
    return "";
  }
}

export function tag4(b0: number, b1: number, b2: number, b3: number): string {
  return String.fromCharCode(b0, b1, b2, b3);
}
