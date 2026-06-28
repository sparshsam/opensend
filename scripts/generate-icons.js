#!/usr/bin/env node
/**
 * OpenSend Icon Generation Script
 *
 * Reads source icon (1024x1024 PNG) and generates all required
 * icon sizes for PWA, Android, iOS, favicon, and social assets.
 *
 * Usage: node scripts/generate-icons.js
 *
 * Source: /mnt/c/Users/spars/Downloads/App Icons/opensend.png
 * Output: Project's public/ and android/ directories
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// ─── Configuration ──────────────────────────────────────────────────────────

const SOURCE = '/mnt/c/Users/spars/Downloads/App Icons/opensend.png';
const PUBLIC = path.resolve(__dirname, '..', 'public');
const ANDROID_RES = path.resolve(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

const BRAND_BG = '#bc3fde';

// ─── Asset definitions ──────────────────────────────────────────────────────

const WEB_ICONS = [
  { name: 'icon-48.png',       size: 48 },
  { name: 'icon-72.png',       size: 72 },
  { name: 'icon-96.png',       size: 96 },
  { name: 'icon-128.png',      size: 128 },
  { name: 'icon-144.png',      size: 144 },
  { name: 'icon-152.png',      size: 152 },
  { name: 'icon-167.png',      size: 167 },
  { name: 'icon-180.png',      size: 180 },
  { name: 'icon-192.png',      size: 192 },
  { name: 'icon-192x192.png',  size: 192 },
  { name: 'icon-384.png',      size: 384 },
  { name: 'icon-512.png',      size: 512 },
  { name: 'icon-512x512.png',  size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

const FAVICON_SIZES = [
  { name: 'favicon-16.png', size: 16 },
  { name: 'favicon-32.png', size: 32 },
];

const ANDROID_DENSITIES = [
  { density: 'mdpi',    size: 48 },
  { density: 'hdpi',    size: 72 },
  { density: 'xhdpi',   size: 96 },
  { density: 'xxhdpi',  size: 144 },
  { density: 'xxxhdpi', size: 192 },
];

const SPLASH_SCREENS = [
  { name: 'splash-640x1136.png',    width: 640,  height: 1136,  iconSize: 128 },
  { name: 'splash-750x1334.png',    width: 750,  height: 1334,  iconSize: 140 },
  { name: 'splash-828x1792.png',    width: 828,  height: 1792,  iconSize: 148 },
  { name: 'splash-1125x2436.png',   width: 1125, height: 2436,  iconSize: 172 },
  { name: 'splash-1242x2688.png',   width: 1242, height: 2688,  iconSize: 180 },
  { name: 'splash-1536x2048.png',   width: 1536, height: 2048,  iconSize: 200 },
  { name: 'splash-1668x2388.png',   width: 1668, height: 2388,  iconSize: 208 },
  { name: 'splash-2048x2732.png',   width: 2048, height: 2732,  iconSize: 220 },
];

const PLAY_STORE = [
  { name: 'play-store-icon.png',            width: 512, height: 512 },
  { name: 'play-store-feature-graphic.png',  width: 1024, height: 500 },
];

// ─── ICO encoder ────────────────────────────────────────────────────────────

function createIco(pngBuffer, pngWidth, pngHeight) {
  const size = pngBuffer.length;
  const headerSize = 6 + 16;
  const buf = Buffer.alloc(headerSize + size);
  let offset = 0;
  buf.writeUInt16LE(0, offset); offset += 2;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt8(pngWidth >= 256 ? 0 : pngWidth, offset); offset += 1;
  buf.writeUInt8(pngHeight >= 256 ? 0 : pngHeight, offset); offset += 1;
  buf.writeUInt8(0, offset); offset += 1;
  buf.writeUInt8(0, offset); offset += 1;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt16LE(32, offset); offset += 2;
  buf.writeUInt32LE(headerSize, offset); offset += 4;
  buf.writeUInt32LE(size, offset); offset += 4;
  pngBuffer.copy(buf, offset);
  return buf;
}

// ─── Sharp helpers ──────────────────────────────────────────────────────────

function resizeIcon(size) {
  return sharp(SOURCE).resize(size, size, { fit: 'cover' }).png().toBuffer();
}

async function createSplash(width, height, iconSize) {
  const iconBuf = await sharp(SOURCE)
    .resize(iconSize, iconSize, { fit: 'cover' }).png().toBuffer();
  const left = Math.round((width - iconSize) / 2);
  const top = Math.round((height - iconSize) / 2);
  return sharp({
    create: { width, height, channels: 3, background: BRAND_BG },
  }).composite([{ input: iconBuf, top, left }]).png().toBuffer();
}

async function createFeatureGraphic() {
  const iconSize = 300;
  const iconBuf = await sharp(SOURCE)
    .resize(iconSize, iconSize, { fit: 'cover' }).png().toBuffer();
  const W = 1024, H = 500;
  const iconLeft = 80, iconTop = Math.round((H - iconSize) / 2);
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${BRAND_BG}"/>
    <text x="${iconLeft + iconSize + 40}" y="230" fill="#ffffff" font-family="Arial,sans-serif" font-size="44" font-weight="bold">OpenSend</text>
    <text x="${iconLeft + iconSize + 40}" y="270" fill="#f3e8ff" font-family="Arial,sans-serif" font-size="20">Send files directly</text>
  </svg>`;
  return sharp(Buffer.from(svg)).composite([{ input: iconBuf, top: iconTop, left: iconLeft }]).png().toBuffer();
}

async function createOGImage() {
  const iconSize = 260;
  const iconBuf = await sharp(SOURCE)
    .resize(iconSize, iconSize, { fit: 'cover' }).png().toBuffer();
  const W = 1200, H = 630;
  const iconLeft = Math.round((W - iconSize) / 2);
  const iconTop = Math.round((H - iconSize) / 2) - 20;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${BRAND_BG}"/>
    <text x="${W / 2}" y="${iconTop + iconSize + 56}" fill="#ffffff" font-family="Arial,sans-serif" font-size="44" font-weight="bold" text-anchor="middle">OpenSend</text>
    <text x="${W / 2}" y="${iconTop + iconSize + 86}" fill="#f3e8ff" font-family="Arial,sans-serif" font-size="20" text-anchor="middle">Free · Ad-free · Open-source file sharing</text>
  </svg>`;
  return sharp(Buffer.from(svg)).composite([{ input: iconBuf, top: iconTop, left: iconLeft }]).png().toBuffer();
}

async function createPngWrappedSvg(size) {
  const pngBuf = await sharp(SOURCE).resize(size, size, { fit: 'cover' }).png().toBuffer();
  const b64 = pngBuf.toString('base64');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <image href="data:image/png;base64,${b64}" width="${size}" height="${size}"/>
</svg>`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('━━━ OpenSend Icon Generator ━━━\n');
  if (!fs.existsSync(SOURCE)) {
    console.error('ERROR: Source not found:', SOURCE);
    process.exit(1);
  }
  const meta = await sharp(SOURCE).metadata();
  console.log(`Source: ${meta.width}x${meta.height}, ${meta.format}\n`);

  let total = 0;

  // 1. Copy source
  console.log('── Source icon ──');
  fs.copyFileSync(SOURCE, path.join(PUBLIC, 'opensend-icon.png'));
  console.log('  -> public/opensend-icon.png (1024x1024)'); total++;

  const svgIcon = await createPngWrappedSvg(512);
  fs.writeFileSync(path.join(PUBLIC, 'opensend-icon.svg'), svgIcon);
  console.log('  -> public/opensend-icon.svg (512x512, wrapped)'); total++;

  // 2. PWA web icons
  console.log('\n── PWA Web Icons ──');
  for (const icon of WEB_ICONS) {
    const buf = await resizeIcon(icon.size);
    fs.writeFileSync(path.join(PUBLIC, icon.name), buf);
    console.log(`  -> ${icon.name} (${icon.size}x${icon.size})`); total++;
  }

  // 3. Favicon
  console.log('\n── Favicon ──');
  for (const icon of FAVICON_SIZES) {
    const buf = await resizeIcon(icon.size);
    fs.writeFileSync(path.join(PUBLIC, icon.name), buf);
    console.log(`  -> ${icon.name} (${icon.size}x${icon.size})`); total++;
  }
  const png32 = await resizeIcon(32);
  fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), createIco(png32, 32, 32));
  console.log('  -> favicon.ico (32x32)'); total++;
  const b64 = png32.toString('base64');
  fs.writeFileSync(path.join(PUBLIC, 'favicon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><image href="data:image/png;base64,${b64}" width="32" height="32"/></svg>`);
  console.log('  -> favicon.svg (32x32)'); total++;

  // 4. iOS splash screens
  console.log('\n── iOS Splash Screens ──');
  for (const s of SPLASH_SCREENS) {
    const buf = await createSplash(s.width, s.height, s.iconSize);
    fs.writeFileSync(path.join(PUBLIC, s.name), buf);
    console.log(`  -> ${s.name} (${s.width}x${s.height})`); total++;
  }

  // 5. Social images
  console.log('\n── Social Images ──');
  fs.writeFileSync(path.join(PUBLIC, 'opengraph-image.png'), await createOGImage());
  console.log('  -> opengraph-image.png (1200x630)'); total++;

  // 6. Play Store
  console.log('\n── Play Store ──');
  for (const a of PLAY_STORE) {
    const buf = a.name.includes('feature') ? await createFeatureGraphic() : await resizeIcon(a.width);
    fs.writeFileSync(path.join(PUBLIC, a.name), buf);
    console.log(`  -> ${a.name} (${a.width}x${a.height})`); total++;
  }

  // 7. Android mipmap
  console.log('\n── Android Mipmap Icons ──');
  for (const { density, size } of ANDROID_DENSITIES) {
    const dir = path.join(ANDROID_RES, `mipmap-${density}`);
    const buf = await resizeIcon(size);
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), buf);
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), buf);
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), buf);
    console.log(`  -> mipmap-${density}/ic_*.png (${size}x${size})`); total += 3;
  }

  console.log(`\n━━━ Done! ${total} assets generated ━━━`);
}

main().catch(err => { console.error('ERROR:', err); process.exit(1); });
