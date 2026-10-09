import QRCode from 'qrcode';
import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';
/** Browser QR encoder plus a synchronous PNG writer supported by Workers.
 * @param {string} value @param {{width:number,margin?:number}} options */
export async function qrPng(value, { width, margin = 4 }) {
  const modules = QRCode.create(value).modules;
  const scale = Math.max(1, Math.floor(width / (modules.size + margin * 2)));
  const offset = Math.floor((width - modules.size * scale) / 2);
  const pixels = Buffer.alloc((width + 1) * width, 255);
  for (let y = 0; y < width; y++) {
    pixels[y * (width + 1)] = 0;
    const moduleY = Math.floor((y - offset) / scale);
    if (moduleY < 0 || moduleY >= modules.size) continue;
    for (let x = 0; x < width; x++) {
      const moduleX = Math.floor((x - offset) / scale);
      if (moduleX >= 0 && moduleX < modules.size && modules.get(moduleY, moduleX))
        pixels[y * (width + 1) + x + 1] = 0;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(width, 4);
  header[8] = 8;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
/** @param {string} name @param {Buffer} bytes */
function chunk(name, bytes) {
  const result = Buffer.alloc(bytes.length + 12);
  result.writeUInt32BE(bytes.length, 0);
  result.write(name, 4, 4, 'ascii');
  bytes.copy(result, 8);
  let crc = 0xffffffff;
  for (const value of result.subarray(4, -4)) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
