/**
 * Regenerate favicons/app icons from packages/client/public/favicon.svg.
 *
 * Requires sharp + png-to-ico (dev-only, not part of the app):
 *   npm i -D sharp png-to-ico && node scripts/gen-icons.mjs && npm un sharp png-to-ico
 */
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const dir = 'packages/client/public';
const svg = readFileSync(`${dir}/favicon.svg`);

const PNGS = {
  'favicon-16x16.png': 16,
  'favicon-32x32.png': 32,
  'favicon-48x48.png': 48,
  'apple-touch-icon.png': 180,
  'icon-192.png': 192,
  'icon-512.png': 512,
};

for (const [name, size] of Object.entries(PNGS)) {
  await sharp(svg).resize(size, size).png().toFile(`${dir}/${name}`);
  console.log('wrote', name);
}

const ico = await pngToIco([
  `${dir}/favicon-16x16.png`,
  `${dir}/favicon-32x32.png`,
  `${dir}/favicon-48x48.png`,
]);
writeFileSync(`${dir}/favicon.ico`, ico);
console.log('wrote favicon.ico');
