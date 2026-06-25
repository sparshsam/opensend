const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const REPO_DIR = path.resolve(__dirname, '..');
const SVG_PATH = path.join(REPO_DIR, 'public', 'opensend-icon.svg');
const PUBLIC_DIR = path.join(REPO_DIR, 'public');

const SIZES = {
  // Favicon
  'favicon-16.png': 16,
  'favicon-32.png': 32,
  'favicon.svg': null, // copy as-is

  // PWA manifest icons
  'icon-48.png': 48,
  'icon-72.png': 72,
  'icon-96.png': 96,
  'icon-128.png': 128,
  'icon-144.png': 144,
  'icon-152.png': 152,
  'icon-167.png': 167,
  'icon-180.png': 180,
  'icon-192.png': 192,
  'icon-384.png': 384,
  'icon-512.png': 512,

  // Legacy named icons (existing in public/)
  'icon-192x192.png': 192,
  'icon-512x512.png': 512,
  'apple-touch-icon.png': 180,

  // iOS splash screens (centered icon on background)
  'splash-640x1136.png': [640, 1136],
  'splash-750x1334.png': [750, 1334],
  'splash-828x1792.png': [828, 1792],
  'splash-1125x2436.png': [1125, 2436],
  'splash-1242x2688.png': [1242, 2688],
  'splash-1536x2048.png': [1536, 2048],
  'splash-1668x2388.png': [1668, 2388],
  'splash-2048x2732.png': [2048, 2732],

  // Social / OG image
  'opengraph-image.png': [1200, 630],
};

const SVG = fs.readFileSync(SVG_PATH, 'utf-8');

async function generate() {
  for (const [filename, size] of Object.entries(SIZES)) {
    const outPath = path.join(PUBLIC_DIR, filename);

    if (size === null) {
      // Copy SVG as-is
      fs.copyFileSync(SVG_PATH, outPath);
      console.log(`Copied ${filename}`);
      continue;
    }

    const w = Array.isArray(size) ? size[0] : size;
    const h = Array.isArray(size) ? size[1] : size;

    if (Array.isArray(size)) {
      // Splash screen: purple background + centered icon
      const iconSize = Math.min(w, h) * 0.35; // icon at 35% of smaller dimension
      const iconBuffer = await sharp(Buffer.from(SVG))
        .resize(Math.round(iconSize), Math.round(iconSize))
        .png()
        .toBuffer();

      // Create splash: purple background
      const splashBg = await sharp({
        create: {
          width: w,
          height: h,
          channels: 4,
          background: { r: 188, g: 63, b: 222, alpha: 1 },
        },
      })
        .composite([
          {
            input: iconBuffer,
            top: Math.round((h - iconSize) / 2),
            left: Math.round((w - iconSize) / 2),
          },
        ])
        .png()
        .toFile(outPath);
      console.log(`Generated ${filename} (${w}x${h})`);
    } else {
      // Regular icon: render SVG at exact size
      await sharp(Buffer.from(SVG))
        .resize(w, h)
        .png()
        .toFile(outPath);
      console.log(`Generated ${filename} (${w}x${h})`);
    }
  }

  // Generate multi-size ICO from 16 and 32 pngs
  console.log('\nDone! All icons generated in public/');
}

generate().catch(console.error);
