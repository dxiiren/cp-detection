import { describe, expect, it } from 'vitest'
import { ICO_HEADER_BYTES, icoFromPng } from './ico'

/** Not a real PNG — icoFromPng wraps the bytes, it does not decode them. */
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6])

const view = (ico: Uint8Array) =>
  new DataView(ico.buffer, ico.byteOffset, ico.byteLength)

describe('icoFromPng', () => {
  const ico = icoFromPng(png, 32)

  it('writes the 22-byte header ahead of the payload', () => {
    expect(ICO_HEADER_BYTES).toBe(22)
    expect(ico).toHaveLength(ICO_HEADER_BYTES + png.length)
  })

  it('declares itself an icon holding exactly one image', () => {
    const dv = view(ico)

    expect(dv.getUint16(0, true)).toBe(0) // reserved
    expect(dv.getUint16(2, true)).toBe(1) // type: icon, not cursor
    expect(dv.getUint16(4, true)).toBe(1) // image count
  })

  it('records the dimensions and colour depth', () => {
    const dv = view(ico)

    expect(ico[6]).toBe(32) // width
    expect(ico[7]).toBe(32) // height
    expect(ico[8]).toBe(0) // palette size: none, it is truecolour
    expect(dv.getUint16(10, true)).toBe(1) // colour planes
    expect(dv.getUint16(12, true)).toBe(32) // bits per pixel
  })

  it('points at the payload with the right size and offset', () => {
    const dv = view(ico)

    expect(dv.getUint32(14, true)).toBe(png.length)
    expect(dv.getUint32(18, true)).toBe(ICO_HEADER_BYTES)
  })

  it('leaves the png bytes untouched', () => {
    expect(Array.from(ico.slice(ICO_HEADER_BYTES))).toEqual(Array.from(png))
  })

  it('encodes 256 as zero, the way the format requires', () => {
    // The width and height fields are single bytes, so 256 is stored as 0.
    const large = icoFromPng(png, 256)

    expect(large[6]).toBe(0)
    expect(large[7]).toBe(0)
  })

  it('refuses a size the format cannot express', () => {
    expect(() => icoFromPng(png, 257)).toThrow(/256/)
    expect(() => icoFromPng(png, 0)).toThrow(/256/)
  })
})
