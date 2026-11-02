// Renders icons/icon.svg to the PNG sizes referenced by manifest.json.
// Run with `npm run icons` after editing the SVG; the PNGs are committed.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const SIZES = [16, 32, 48, 128];
const iconsDir = fileURLToPath(new URL('../icons/', import.meta.url));
const svg = await readFile(`${iconsDir}icon.svg`, 'utf8');

const browser = await chromium.launch();
try {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.screenshot({ path: `${iconsDir}icon-${size}.png`, omitBackground: true });
    await page.close();
    console.log(`icons/icon-${size}.png`);
  }
} finally {
  await browser.close();
}
