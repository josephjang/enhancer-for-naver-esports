// Builds the zip uploaded to the Chrome Web Store (and other Chromium
// extension stores): only the files the browser loads, with manifest.json
// at the root. Run with `npm run package`; the zip lands in dist/.
//
// The build refuses to produce a zip that a store would reject or that
// would break at runtime: manifest and package.json versions must match,
// and every file manifest.json refers to must be in the zip.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zipSync } from 'fflate';

const DEFAULT_ROOT = fileURLToPath(new URL('../', import.meta.url));

// What the extension loads at runtime. Everything else in the repository
// (tests, scripts, store assets, the icon source SVG) stays out.
const INCLUDED_DIRS = ['_locales', 'src'];
const INCLUDED_FILES = ['manifest.json'];
const INCLUDED_ICON = /^icons\/icon-\d+\.png$/;

// Fixed timestamp so the same sources always produce the same zip.
const FIXED_MTIME = new Date('2026-01-01T00:00:00Z');

/**
 * Every package path manifest.json refers to.
 *
 * @param {object} manifest parsed manifest.json
 * @returns {string[]} forward-slash paths relative to the package root.
 */
export function manifestReferences(manifest) {
  const refs = new Set();
  const addAll = (values) => { for (const value of values ?? []) refs.add(value); };
  addAll(Object.values(manifest.icons ?? {}));
  addAll(Object.values(manifest.action?.default_icon ?? {}));
  if (manifest.background?.service_worker) refs.add(manifest.background.service_worker);
  for (const script of manifest.content_scripts ?? []) {
    addAll(script.js);
    addAll(script.css);
  }
  if (manifest.default_locale) refs.add(`_locales/${manifest.default_locale}/messages.json`);
  return [...refs].sort();
}

/** @returns {string[]} references in `manifest` that are not in `files`. */
export function missingReferences(manifest, files) {
  const present = new Set(files);
  return manifestReferences(manifest).filter((ref) => !present.has(ref));
}

/** Throws unless the two versions match, so a release is never mislabeled. */
export function assertVersionsMatch(manifest, packageJson) {
  if (manifest.version !== packageJson.version) {
    throw new Error(
      `manifest.json version ${manifest.version} does not match package.json version ${packageJson.version}`,
    );
  }
}

async function listFiles(rootDir, relativeDir) {
  const entries = await readdir(path.join(rootDir, relativeDir), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await listFiles(rootDir, relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

/** Package-relative paths of every file that goes into the zip, sorted. */
export async function collectPackageFiles(rootDir = DEFAULT_ROOT) {
  const files = [...INCLUDED_FILES];
  for (const dir of INCLUDED_DIRS) files.push(...(await listFiles(rootDir, dir)));
  const icons = await readdir(path.join(rootDir, 'icons'));
  files.push(...icons.map((name) => `icons/${name}`).filter((file) => INCLUDED_ICON.test(file)));
  return files.sort();
}

/**
 * Writes dist/<package name>-<version>.zip.
 *
 * @param {{ rootDir?: string, outDir?: string }} [options]
 * @returns {Promise<{ zipPath: string, files: string[] }>}
 */
export async function buildPackage({ rootDir = DEFAULT_ROOT, outDir = path.join(rootDir, 'dist') } = {}) {
  const readJson = async (file) => JSON.parse(await readFile(path.join(rootDir, file), 'utf8'));
  const manifest = await readJson('manifest.json');
  const packageJson = await readJson('package.json');
  assertVersionsMatch(manifest, packageJson);

  const files = await collectPackageFiles(rootDir);
  const missing = missingReferences(manifest, files);
  if (missing.length > 0) {
    throw new Error(`manifest.json refers to files missing from the package: ${missing.join(', ')}`);
  }

  const entries = {};
  for (const file of files) {
    entries[file] = [await readFile(path.join(rootDir, file)), { mtime: FIXED_MTIME }];
  }
  const zip = zipSync(entries, { level: 9 });

  await mkdir(outDir, { recursive: true });
  const zipPath = path.join(outDir, `${packageJson.name}-${manifest.version}.zip`);
  await writeFile(zipPath, zip);
  return { zipPath, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { zipPath, files } = await buildPackage();
  console.log(`${path.relative(DEFAULT_ROOT, zipPath)} (${files.length} files)`);
  for (const file of files) console.log(`  ${file}`);
}
