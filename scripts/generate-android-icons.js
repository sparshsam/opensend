const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const REPO_DIR = path.resolve(__dirname, '..');
const SVG = fs.readFileSync(path.join(REPO_DIR, 'public', 'opensend-icon.svg'), 'utf-8');
const RES_DIR = path.join(REPO_DIR, 'android', 'app', 'src', 'main', 'res');

const densities = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

async function gen() {
  for (const [dir, size] of Object.entries(densities)) {
    const destDir = path.join(RES_DIR, dir);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    await sharp(Buffer.from(SVG))
      .resize(size, size)
      .png()
      .toFile(path.join(destDir, 'ic_launcher.png'));
    await sharp(Buffer.from(SVG))
      .resize(size, size)
      .png()
      .toFile(path.join(destDir, 'ic_launcher_round.png'));
    await sharp(Buffer.from(SVG))
      .resize(size, size)
      .png()
      .toFile(path.join(destDir, 'ic_launcher_foreground.png'));
    console.log(`Generated ${dir} (${size}px)`);
  }
  console.log('Done!');
}
gen().catch(console.error);
