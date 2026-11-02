// Renders the Chrome Web Store images into store/images/:
//   <locale>/screenshot-1.png  the player button on a video page (1280x800)
//   <locale>/screenshot-2.png  the player filling the browser window
//   <locale>/screenshot-3.png  how to use it
//   promo-small.png            small promo tile (440x280; the store does
//                              not localize it)
//
// Screenshots 1 and 2 load the real extension into Chromium and photograph
// it on store/assets/demo-page.html, a fictional page with a drawn
// "video", then place that photo inside a plain browser frame so the
// browser UI that stays visible is part of the picture. Run with
// `npm run store-images` after changing the extension's UI.
import { readFileSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT_DIR = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT_DIR, 'store', 'images');
const DEMO_URL = 'https://game.naver.com/esports/demo/videos/1';

const WIDTH = 1280;
const HEIGHT = 800;
const CAPTION_HEIGHT = 80;
const TOOLBAR_HEIGHT = 56;
const PAGE_HEIGHT = HEIGHT - CAPTION_HEIGHT - TOOLBAR_HEIGHT;

const FONT = '"Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

// Labels shown by the extension itself come from its own locale files.
const messages = (locale) => JSON.parse(
  readFileSync(path.join(ROOT_DIR, '_locales', locale, 'messages.json'), 'utf8'),
);

// Store-image wording per locale; the extension's own labels are quoted
// from _locales so the images always match the product.
function copyFor(locale) {
  const m = messages(locale);
  const enter = m.fillButtonEnter.message;
  if (locale === 'ko') {
    return {
      browserLocale: 'ko-KR',
      note: '예시 화면',
      caption1: `플레이어에 '${enter}' 버튼이 생깁니다`,
      caption2: '전체 화면이 아니라 브라우저 창을 채웁니다. 탭과 주소창은 그대로',
      howToTitle: '사용법',
      howTo: [
        ['button', `플레이어의 '${enter}' 버튼으로 켜고 끄기`],
        ['W', '영상 페이지에서 켜고 끄기'],
        ['Esc', '끄기'],
        ['Alt+Shift+W', '도구 모음 아이콘이나 단축키로 켜고 끄기'],
      ],
      howToFooter: '켜 둔 탭에서는 다음 영상으로 넘어가도 유지됩니다. 영상은 원래 비율을 유지합니다.',
    };
  }
  return {
    browserLocale: 'en-US',
    note: 'Example page',
    caption1: `Adds a "${enter}" button to the player`,
    caption2: 'Fills the browser window, not the screen. Tabs and the address bar stay',
    howToTitle: 'How to use',
    howTo: [
      ['button', `Toggle with the player's "${enter}" button`],
      ['W', 'Toggle on a video page'],
      ['Esc', 'Turn off'],
      ['Alt+Shift+W', 'Toggle with the toolbar icon or the shortcut'],
    ],
    howToFooter: 'Stays on as you move to the next video in the tab. The video keeps its aspect ratio.',
  };
}

const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const dataUrl = (bytes, type = 'image/png') => `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;

/**
 * Photos of the demo page with the extension loaded, and the markup of the
 * player button's icon as the extension draws it.
 *
 * @returns {Promise<{ before: Buffer, after: Buffer, buttonIconSvg: string }>}
 */
async function photographExtension(browserLocale) {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    locale: browserLocale,
    viewport: { width: WIDTH, height: PAGE_HEIGHT },
    args: [`--disable-extensions-except=${ROOT_DIR}`, `--load-extension=${ROOT_DIR}`, `--lang=${browserLocale}`],
  });
  try {
    const demo = await readFile(path.join(ROOT_DIR, 'store', 'assets', 'demo-page.html'), 'utf8');
    await context.route('https://game.naver.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: demo }));
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(DEMO_URL);
    const button = page.locator('.ens-fill-button');
    await button.waitFor();
    const buttonIconSvg = await page.locator('.ens-fill-button__icon--enter').evaluate((svg) => svg.outerHTML);

    await button.hover();
    await page.waitForTimeout(300);
    const before = await page.screenshot();

    await button.click();
    await page.mouse.move(WIDTH / 2, PAGE_HEIGHT / 3);
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-ens-fill'));
    await page.waitForTimeout(300);
    const after = await page.screenshot();
    return { before, after, buttonIconSvg };
  } finally {
    await context.close();
  }
}

function frameHtml({ caption, note, pagePng, iconPng }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; }
    body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #111827; font-family: ${FONT}; }
    .caption { height: ${CAPTION_HEIGHT}px; display: flex; align-items: center; justify-content: space-between; padding: 0 36px; box-sizing: border-box; color: #fff; }
    .caption strong { font-size: 27px; }
    .caption small { font-size: 14px; color: #9ca3af; }
    .toolbar { height: ${TOOLBAR_HEIGHT}px; display: flex; align-items: center; gap: 14px; padding: 0 18px; box-sizing: border-box; background: #dfe3ea; border-radius: 12px 12px 0 0; }
    .dots { display: flex; gap: 8px; }
    .dots i { width: 12px; height: 12px; border-radius: 50%; background: #9aa1ad; display: block; }
    .tab { width: 180px; height: 30px; border-radius: 8px; background: #fff; }
    .address { flex: 1; height: 32px; border-radius: 16px; background: #fff; }
    .icon { width: 22px; height: 22px; }
    img.page { display: block; width: ${WIDTH}px; height: ${PAGE_HEIGHT}px; }
  </style></head><body>
    <div class="caption"><strong>${escapeHtml(caption)}</strong><small>${escapeHtml(note)}</small></div>
    <div class="toolbar"><div class="dots"><i></i><i></i><i></i></div><div class="tab"></div><div class="address"></div><img class="icon" src="${iconPng}" alt=""></div>
    <img class="page" src="${pagePng}" alt="">
  </body></html>`;
}

function howToHtml({ copy, buttonIconSvg }) {
  // The first row shows the player button exactly as the extension draws it.
  const key = (k) => (k === 'button'
    ? `<span class="key player">${buttonIconSvg}</span>`
    : `<span class="key">${escapeHtml(k)}</span>`);
  const rows = copy.howTo.map(([k, text]) => `<li>${key(k)}<span>${escapeHtml(text)}</span></li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; }
    body { width: ${WIDTH}px; height: ${HEIGHT}px; box-sizing: border-box; padding: 84px 120px; background: linear-gradient(160deg, #111827, #1e1b4b); color: #fff; font-family: ${FONT}; }
    h1 { font-size: 44px; margin: 0 0 48px; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 26px; }
    li { display: flex; align-items: center; gap: 28px; font-size: 28px; }
    .key { flex: 0 0 210px; height: 64px; padding: 0 18px; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; border-radius: 12px; background: #f9fafb; color: #111827; font-weight: 700; font-size: 26px; box-shadow: 0 4px 0 #9ca3af; }
    .key.player { background: #1f2937; color: #fff; box-shadow: 0 4px 0 #000; }
    .key.player svg { width: 48px; height: 48px; }
    p { margin: 56px 0 0; font-size: 22px; color: #c7d2fe; }
  </style></head><body>
    <h1>${escapeHtml(copy.howToTitle)}</h1>
    <ul>${rows}</ul>
    <p>${escapeHtml(copy.howToFooter)}</p>
  </body></html>`;
}

function promoHtml({ iconPng }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; }
    body { width: 440px; height: 280px; box-sizing: border-box; padding: 34px 32px; background: linear-gradient(150deg, #111827, #1e1b4b); color: #fff; font-family: ${FONT}; display: flex; flex-direction: column; justify-content: center; gap: 18px; }
    img { width: 72px; height: 72px; }
    h1 { margin: 0; font-size: 28px; line-height: 1.15; }
    p { margin: 0; font-size: 16px; color: #c7d2fe; line-height: 1.4; }
  </style></head><body>
    <img src="${iconPng}" alt="">
    <h1>Enhancer for NAVER Esports</h1>
    <p>e스포츠 영상 플레이어를 브라우저 창 크기로<br>Fill the browser window with the player</p>
  </body></html>`;
}

async function renderHtml(browser, html, size, file) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: file });
  } finally {
    await page.close();
  }
  console.log(path.relative(ROOT_DIR, file));
}

const iconPng = dataUrl(await readFile(path.join(ROOT_DIR, 'icons', 'icon-128.png')));
const browser = await chromium.launch();
try {
  for (const locale of ['ko', 'en']) {
    const copy = copyFor(locale);
    const dir = path.join(OUT_DIR, locale);
    await mkdir(dir, { recursive: true });
    const { before, after, buttonIconSvg } = await photographExtension(copy.browserLocale);
    const size = { width: WIDTH, height: HEIGHT };
    await renderHtml(browser, frameHtml({ caption: copy.caption1, note: copy.note, pagePng: dataUrl(before), iconPng }), size, path.join(dir, 'screenshot-1.png'));
    await renderHtml(browser, frameHtml({ caption: copy.caption2, note: copy.note, pagePng: dataUrl(after), iconPng }), size, path.join(dir, 'screenshot-2.png'));
    await renderHtml(browser, howToHtml({ copy, buttonIconSvg }), size, path.join(dir, 'screenshot-3.png'));
  }
  await renderHtml(browser, promoHtml({ iconPng }), { width: 440, height: 280 }, path.join(OUT_DIR, 'promo-small.png'));
} finally {
  await browser.close();
}
