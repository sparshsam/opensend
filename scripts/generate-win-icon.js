const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const REPO_DIR = path.resolve(__dirname, '..');
const SVG = fs.readFileSync(path.join(REPO_DIR, 'public', 'opensend-icon.svg'), 'utf-8');
const DEST = path.join(REPO_DIR, 'apps', 'desktop', 'resources', 'icon.ico');

// ICO file format
// ICONDIR: reserved(2) + type(2) + count(2)
// ICONDIRENTRY: w(1) + h(1) + colors(1) + reserved(1) + planes(2) + bpp(2) + size(4) + offset(4)
// ... then PNG data for each entry

async function generateIco() {
  const sizes = [16, 32, 48, 64, 128, 256];
  const entries = [];

  // Encode all PNGs first
  for (const size of sizes) {
    const png = await sharp(Buffer.from(SVG))
      .resize(size, size)
      .png()
      .toBuffer();
    entries.push({ size, data: png });
  }

  // Build ICO
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);     // reserved
  header.writeUInt16LE(1, 2);     // type: 1 = icon
  header.writeUInt16LE(entries.length, 4); // count

  let offset = 6 + entries.length * 16;
  const chunks = [header];

  for (const entry of entries) {
    const e = Buffer.alloc(16);
    const s = entry.size >= 256 ? 0 : entry.size; // 0 = 256 for 256+ sizes
    e.writeUInt8(s, 0);          // width
    e.writeUInt8(s, 1);          // height
    e.writeUInt8(0, 2);          // colors
    e.writeUInt8(0, 3);          // reserved
    e.writeUInt16LE(1, 4);       // planes
    e.writeUInt16LE(32, 6);      // bpp
    e.writeUInt32LE(entry.data.length, 8);  // image size
    e.writeUInt32LE(offset, 12); // offset
    offset += entry.data.length;
    chunks.push(e);
  }

  for (const entry of entries) {
    chunks.push(entry.data);
  }

  const ico = Buffer.concat(chunks);
  fs.writeFileSync(DEST, ico);
  console.log(`Generated icon.ico (${sizes.join(', ')}) — ${ico.length} bytes`);
}

generateIco().catch(console.error);
