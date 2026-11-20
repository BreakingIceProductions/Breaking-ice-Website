import 'server-only'

/**
 * A streaming zip writer: "stored" entries (no compression; photos don't shrink anyway), CRC
 * worked out as the bytes pass through, sizes written after each file (data descriptors).
 * Nothing is buffered beyond one chunk, so a 2 GB part streams straight from R2 to the client.
 * Parts stay under 4 GB (ZIP_PART_BYTES), so the classic format is enough: no ZIP64.
 */

const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(crc: number, buf: Uint8Array) {
  let c = crc ^ 0xffffffff
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

export type ZipEntry = { name: string; open: () => Promise<ReadableStream<Uint8Array>> }

/** Makes names unique inside the zip ("a.jpg", "a (2).jpg"). */
export function uniqueNames(names: string[]) {
  const seen = new Map<string, number>()
  return names.map((n) => {
    const lower = n.toLowerCase()
    const c = (seen.get(lower) ?? 0) + 1
    seen.set(lower, c)
    return c === 1 ? n : n.replace(/(\.[^./]+)?$/, ` (${c})$1`)
  })
}

export function zipStream(entries: ZipEntry[], onError?: (e: unknown) => void): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  const central: Uint8Array[] = []
  let offset = 0
  const { time, date } = dosTime(new Date())

  // Pulled one chunk at a time, so a slow download never piles photos up in memory.
  async function* chunks(): AsyncGenerator<Uint8Array> {
    const out: Uint8Array[] = []
    const push = (b: Uint8Array) => {
      out.push(b)
      offset += b.length
    }
    const flush = function* () {
      while (out.length) yield out.shift()!
    }
    {
      {
        for (const e of entries) {
          const name = enc.encode(e.name)
          const start = offset
          // Local header: flag 0x0808 = sizes in a data descriptor + UTF-8 names.
          const lh = new DataView(new ArrayBuffer(30))
          lh.setUint32(0, 0x04034b50, true)
          lh.setUint16(4, 20, true)
          lh.setUint16(6, 0x0808, true)
          lh.setUint16(8, 0, true)
          lh.setUint16(10, time, true)
          lh.setUint16(12, date, true)
          lh.setUint16(26, name.length, true)
          push(new Uint8Array(lh.buffer))
          push(name)
          yield* flush()

          let crc = 0
          let size = 0
          const reader = (await e.open()).getReader()
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            crc = crc32(crc, value)
            size += value.length
            push(value)
            yield* flush()
          }

          const dd = new DataView(new ArrayBuffer(16))
          dd.setUint32(0, 0x08074b50, true)
          dd.setUint32(4, crc, true)
          dd.setUint32(8, size, true)
          dd.setUint32(12, size, true)
          push(new Uint8Array(dd.buffer))

          const ch = new DataView(new ArrayBuffer(46))
          ch.setUint32(0, 0x02014b50, true)
          ch.setUint16(4, 20, true)
          ch.setUint16(6, 20, true)
          ch.setUint16(8, 0x0808, true)
          ch.setUint16(10, 0, true)
          ch.setUint16(12, time, true)
          ch.setUint16(14, date, true)
          ch.setUint32(16, crc, true)
          ch.setUint32(20, size, true)
          ch.setUint32(24, size, true)
          ch.setUint16(28, name.length, true)
          ch.setUint32(42, start, true)
          const rec = new Uint8Array(46 + name.length)
          rec.set(new Uint8Array(ch.buffer), 0)
          rec.set(name, 46)
          central.push(rec)
          yield* flush()
        }

        const cdStart = offset
        let cdSize = 0
        for (const c of central) {
          push(c)
          cdSize += c.length
        }
        const end = new DataView(new ArrayBuffer(22))
        end.setUint32(0, 0x06054b50, true)
        end.setUint16(8, central.length, true)
        end.setUint16(10, central.length, true)
        end.setUint32(12, cdSize, true)
        end.setUint32(16, cdStart, true)
        push(new Uint8Array(end.buffer))
        yield* flush()
      }
    }
  }

  const it = chunks()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await it.next()
        if (done) controller.close()
        else controller.enqueue(value)
      } catch (e) {
        onError?.(e)
        controller.error(e)
      }
    },
    async cancel() {
      await it.return(undefined)
    },
  })
}
