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

function scanlines(canvas) {
  const { width, height } = canvas;
  const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const stride = 1 + width * 3;
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    rows[row] = 1; // PNG Sub filter
    let red = 0;
    let green = 0;
    let blue = 0;
    for (let x = 0, i = y * width * 4; x < width; x++, i += 4) {
      const out = row + 1 + x * 3;
      rows[out] = pixels[i] - red;
      rows[out + 1] = pixels[i + 1] - green;
      rows[out + 2] = pixels[i + 2] - blue;
      red = pixels[i];
      green = pixels[i + 1];
      blue = pixels[i + 2];
    }
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
    for (const canvas of strips) {
      const rows = scanlines(canvas);
      canvas.width = 0;
      await writer.write(rows);
    }
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
