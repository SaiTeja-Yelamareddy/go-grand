const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Create a valid minimalist PNG buffer for PWA icons
function createPngBuffer(width, height) {
  // A minimal valid PNG file structure
  // Signature: 8 bytes
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: RGBA (6)
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT Chunk (Dark #111111 background image)
  // Each line starts with 0 (no filter) followed by width * 4 bytes (R, G, B, A)
  const lineSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * lineSize);
  for (let y = 0; y < height; y++) {
    const offset = y * lineSize;
    rawData[offset] = 0; // No filter
    for (let x = 0; x < width; x++) {
      const px = offset + 1 + x * 4;
      rawData[px] = 0x11;     // Red
      rawData[px + 1] = 0x11; // Green
      rawData[px + 2] = 0x11; // Blue
      rawData[px + 3] = 0xFF; // Alpha
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);

  // IEND Chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  
  const typeBuf = Buffer.from(type, 'ascii');
  const bodyBuf = Buffer.concat([typeBuf, data]);
  
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(bodyBuf), 0);
  
  return Buffer.concat([len, bodyBuf, crcBuf]);
}

// Standard CRC32 calculation for PNG chunk validation
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    let byte = buf[i];
    crc = crc ^ byte;
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xEDB88320 & mask);
    }
  }
  return (crc ^ -1) >>> 0;
}

const publicDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPngBuffer(192, 192));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPngBuffer(512, 512));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPngBuffer(180, 180));

console.log('PWA icons created successfully in /public');
