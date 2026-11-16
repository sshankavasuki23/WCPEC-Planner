// Encode tall calendars from strips. PNG packs them into one image with one
// zlib stream, avoiding a full-appointment-day canvas on mobile.
const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const ascii = new TextEncoder();

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});

function chunk(type, data) {
  const result = new Uint8Array(12 + data.length);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  result.set(ascii.encode(type), 4);
  result.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < result.length - 4; i++) crc = crcTable[(crc ^ result[i]) & 255] ^ (crc >>> 8);
  view.setUint32(result.length - 4, (crc ^ 0xffffffff) >>> 0);
  return result;
}

function scanlines(tiles, width) {
  const { height } = tiles[0];
  const stride = 1 + width * 3;
  const rows = new Uint8Array(stride * height);
  const prior = new Uint8Array(height * 3);
  let left = 0;

  for (const canvas of tiles) {
    const tileWidth = canvas.width;
    const pixels = canvas.getContext('2d').getImageData(0, 0, tileWidth, height).data;
    for (let y = 0; y < height; y++) {
      const row = y * stride;
      rows[row] = 1; // PNG Sub filter
      const previous = y * 3;
      let red = prior[previous];
      let green = prior[previous + 1];
      let blue = prior[previous + 2];
      let out = row + 1 + left * 3;
      for (let x = 0, i = y * tileWidth * 4; x < tileWidth; x++, i += 4, out += 3) {
        rows[out] = pixels[i] - red;
        rows[out + 1] = pixels[i + 1] - green;
        rows[out + 2] = pixels[i + 2] - blue;
        red = pixels[i];
        green = pixels[i + 1];
        blue = pixels[i + 2];
      }
      prior[previous] = red;
      prior[previous + 1] = green;
      prior[previous + 2] = blue;
    }
    left += tileWidth;
    canvas.width = 0;
  }
  return rows;
}

export async function encodeCalendarPng(width, height, strips) {
  const header = new Uint8Array(13);
  const dimensions = new DataView(header.buffer);
  dimensions.setUint32(0, width);
  dimensions.setUint32(4, height);
  header[8] = 8;
  header[9] = 2; // RGB, opaque
  const parts = [signature, chunk('IHDR', header)];
  const compressor = new CompressionStream('deflate');
  const output = compressor.readable.pipeTo(new WritableStream({
    write(data) { parts.push(chunk('IDAT', data)); },
  }));
  const writer = compressor.writable.getWriter();
  try {
    for (const tiles of strips) await writer.write(scanlines(tiles, width));
    await writer.close();
    await output;
  } catch (error) {
    await writer.abort(error).catch(() => {});
    await output.catch(() => {});
    throw error;
  }
  parts.push(chunk('IEND', new Uint8Array()));
  return new Blob(parts, { type: 'image/png' });
}
