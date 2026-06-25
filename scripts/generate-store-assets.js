const sharp = require('sharp');
const path = require('path');

const REPO_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(REPO_DIR, 'public');

async function generateStoreAssets() {
  const iconPath = path.join(PUBLIC_DIR, 'opensend-icon.svg');
  
  // Feature Graphic (1024x500) — purple bg with icon + text area
  const featureGraphic = await sharp({
    create: {
      width: 1024,
      height: 500,
      channels: 4,
      background: { r: 26, g: 4, b: 34, alpha: 1 }, // #1a0422 dark bg
    },
  })
    .composite([
      {
        input: await sharp(iconPath).resize(256, 256).png().toBuffer(),
        top: 122,
        left: 80,
      },
    ])
    .png()
    .toFile(path.join(PUBLIC_DIR, 'play-store-feature-graphic.png'));

  // Store Icon (512x512) — just the icon
  await sharp(iconPath)
    .resize(512, 512)
    .png()
    .toFile(path.join(PUBLIC_DIR, 'play-store-icon.png'));

  console.log('Generated Play Store assets:');
  console.log('  play-store-feature-graphic.png (1024x500)');
  console.log('  play-store-icon.png (512x512)');
}
generateStoreAssets().catch(console.error);
