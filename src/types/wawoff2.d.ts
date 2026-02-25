declare module "wawoff2" {
  export function decompress(buffer: Uint8Array): Promise<Uint8Array>;
}
