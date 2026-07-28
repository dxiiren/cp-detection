/**
 * Minimal ICO writer — build-time only, used by `scripts/generate-assets.mjs`.
 *
 * ICO is a container format, and since Vista an entry may hold a PNG verbatim
 * rather than a BMP. That means a favicon.ico is a 22-byte header in front of
 * a PNG we already have, which is far less machinery than pulling in an image
 * encoder for one file.
 *
 * It lives in `src/lib` rather than next to the script because Vitest is
 * configured to look at `src/**` only, so anything under `scripts/` cannot be
 * unit-tested. Nothing in the app imports it, so it never reaches the bundle.
 */

/** Reserved + type + count, then one 16-byte directory entry. */
export const ICO_HEADER_BYTES = 22

export function icoFromPng(png: Uint8Array, size: number): Uint8Array {
  if (!Number.isInteger(size) || size < 1 || size > 256) {
    throw new Error(
      `ICO dimensions must be an integer from 1 to 256, got ${size}`,
    )
  }

  const out = new Uint8Array(ICO_HEADER_BYTES + png.length)
  const view = new DataView(out.buffer)

  // ICONDIR
  view.setUint16(0, 0, true) // reserved
  view.setUint16(2, 1, true) // 1 = icon (2 would be cursor)
  view.setUint16(4, 1, true) // one image in this file

  // ICONDIRENTRY. Width and height are single bytes, so the format spells
  // 256 as 0 — the one size that cannot be written literally.
  out[6] = size === 256 ? 0 : size
  out[7] = size === 256 ? 0 : size
  out[8] = 0 // palette entries: none, this is truecolour
  out[9] = 0 // reserved
  view.setUint16(10, 1, true) // colour planes
  view.setUint16(12, 32, true) // bits per pixel
  view.setUint32(14, png.length, true)
  view.setUint32(18, ICO_HEADER_BYTES, true)

  out.set(png, ICO_HEADER_BYTES)

  return out
}
